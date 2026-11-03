// Real LLM-assisted fallback for the chat-edit panel (components/ChatEditPanel.tsx,
// lib/layout/chatEdit.ts) — the actual "agentic/conversational editing" piece Maket.ai's
// own chat-edit differentiator has that this codebase was still missing: ChatEditPanel's
// own UI copy says "no AI call" because chatEdit.ts is a deliberately regex-only parser
// (see that file's docstring). The regex parser stays the default, free, instant,
// zero-AI-call path for every phrasing it already recognizes — this module only ever
// engages when that parser returns ok:false, i.e. the user typed something outside its
// known grammar.
//
// Deliberately NOT an AI geometry engine: this module never computes room dimensions,
// positions, or new plan data itself. It asks a free OpenRouter text model (same
// multi-model fallback chain pattern as lib/zoningAssistant.ts/lib/visionBrief.ts) to
// TRANSLATE the free-form request into one of chatEdit.ts's own existing canonical
// command strings, then runs that string back through the real, already-verified
// `applyChatCommand`. Every actual plan mutation this module can ever produce is
// therefore byte-for-byte identical to what the deterministic parser itself would
// produce for that exact canonical string — same "never trust raw LLM output as final
// geometry" discipline as visionBrief.ts (bounded counts, not coordinates) and
// zoningAssistant.ts (grounded real facts, not invented ones).
//
// Scoped to two edit intents this pass, per the owner's own scoping instruction —
// resizing a named room, and adding a room of a given type — not every possible
// edit phrase. Zoning/lot-coverage re-validation needs no new code here: ZoningPanel
// already recomputes from whatever `plan`/`floors` state app/page.tsx holds, and
// every successful AI-assisted edit flows through the exact same `onChange`/
// `updatePlan` path a regex-matched edit already does.

import type { FloorPlan } from "./types";
import { applyChatCommand, type ChatEditResult } from "./chatEdit";

const TEXT_MODELS = [
  "nvidia/nemotron-3.5-super-vl:free",
  "cohere/north-mini-code:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
] as const;

const MAX_COMMAND_LENGTH = 300;

const SYSTEM_PROMPT = [
  "You translate a free-form floor-plan edit request into ONE canonical command string HomePlan's deterministic editor already understands.",
  "Only two kinds of edits are supported right now:",
  '1) Resizing an existing room: "make the <room> bigger", "make the <room> smaller", "make the <room> bigger by <N>%", "make the <room> smaller by <N> sqft", "make the <room> to <N> sqft".',
  '2) Adding a new room: "add a <roomtype>" or "add a <roomtype> called <Label>" — roomtype one of: bedroom, primary bedroom, bathroom, primary bathroom, half bath, kitchen, living room, dining room, office, garage, closet, entry, great room, hallway.',
  "You will be given the plan's real current room labels. When the request refers to an existing room, use that room's EXACT label text from the list inside the canonical command — never a paraphrase or guess at a label that isn't in the list.",
  'Respond with ONLY a single JSON object, no markdown fences, no prose, matching exactly: {"intent": "resize" | "add_room" | "unsupported", "command": string, "note": string}.',
  '"command" must be a single literal command string in one of the exact forms above whenever intent is "resize" or "add_room" — never anything outside those two shapes. Use an empty string for "command" when intent is "unsupported".',
  'Set intent to "unsupported" and briefly explain why in "note" whenever the request asks for anything else (moving, renaming, removing, furniture, multiple rooms at once, or anything ambiguous) — only resize and add-room requests are supported right now.',
].join(" ");

export type ChatEditAIErrorCode = "not_configured" | "all_models_unavailable" | "network_error";

export interface ChatEditAIResult extends ChatEditResult {
  /** The canonical command the model translated the request into — surfaced so the UI can show the user exactly what ran. Absent on outright failures (not configured, no model produced a valid translation, etc). */
  translatedCommand?: string;
  modelUsed?: string;
}

interface OpenRouterEnv {
  apiKey: string;
  baseUrl: string;
}

function loadOpenRouterEnv(): OpenRouterEnv | null {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const baseUrl = process.env.OPENROUTER_BASE_URL;
  if (!apiKey || !baseUrl) return null;
  return { apiKey, baseUrl };
}

interface OpenRouterChatResponse {
  choices?: { message?: { content?: string } }[];
}

/** Pulls the first balanced-looking JSON object out of a model response, tolerating stray markdown fences some free models still add despite instructions — same tolerant parsing as lib/visionBrief.ts. */
function extractJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

async function callModel(
  env: OpenRouterEnv,
  model: string,
  userPrompt: string,
): Promise<{ ok: true; content: string } | { ok: false; retryable: boolean; networkError: boolean }> {
  let res: Response;
  try {
    res = await fetch(`${env.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 500,
        reasoning: { effort: "low" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return { ok: false, retryable: true, networkError: true };
  }

  if (!res.ok) {
    const retryable = res.status === 429 || res.status === 404 || res.status >= 500;
    return { ok: false, retryable, networkError: false };
  }

  const body = (await res.json().catch(() => null)) as OpenRouterChatResponse | null;
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) return { ok: false, retryable: true, networkError: false };
  return { ok: true, content };
}

const CANONICAL_RESIZE_RE =
  /^make\s+.+\s+(bigger|smaller)(\s+(by\s+\d+(\.\d+)?\s*(%|percent|sqft|sq ft|square feet)|to\s+\d+(\.\d+)?\s*(sqft|sq ft|square feet)))?$/;
const CANONICAL_ADD_RE = /^add\s+(a|an)\s+.+$/;

/** Sanity-checks the model's own "command" string really is one of the two canonical shapes this module is scoped to produce, before it's ever handed to the real deterministic parser — never trust the model's self-reported "intent" field alone. */
function isCanonicalCommand(intent: string, command: string): boolean {
  const normalized = command.trim().toLowerCase();
  if (intent === "resize") return CANONICAL_RESIZE_RE.test(normalized);
  if (intent === "add_room") return CANONICAL_ADD_RE.test(normalized);
  return false;
}

/**
 * Translates `rawCommand` into one of chatEdit.ts's own canonical command shapes via a
 * free OpenRouter text model, then applies it through the real `applyChatCommand`. Only
 * ever called after the deterministic regex parser itself has already rejected the
 * command (see app/api/chat-edit/route.ts) — this function does not re-check that.
 */
export async function interpretChatCommandWithAI(plan: FloorPlan, rawCommand: string): Promise<ChatEditAIResult> {
  const env = loadOpenRouterEnv();
  if (!env) {
    return {
      ok: false,
      message: "AI-assisted editing isn't configured on this deployment yet. Try one of the exact example phrasings instead.",
    };
  }

  const trimmed = rawCommand.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_COMMAND_LENGTH) {
    return { ok: false, message: `Command must be between 1 and ${MAX_COMMAND_LENGTH} characters.` };
  }

  const roomLabels = plan.rooms.map((r) => r.label);
  const userPrompt = [`Current rooms on this plan: ${roomLabels.join(", ") || "(none)"}.`, `User's request: "${trimmed}"`].join("\n");

  let sawNetworkError = false;
  for (const model of TEXT_MODELS) {
    const result = await callModel(env, model, userPrompt);
    if (!result.ok) {
      if (!result.retryable) {
        return { ok: false, message: "The AI-assist service rejected the request. Try rephrasing or use one of the example commands." };
      }
      sawNetworkError = sawNetworkError || result.networkError;
      continue;
    }

    const parsed = extractJsonObject(result.content);
    const intent = parsed && typeof parsed.intent === "string" ? parsed.intent : null;
    const command = parsed && typeof parsed.command === "string" ? parsed.command : "";
    const note = parsed && typeof parsed.note === "string" ? parsed.note : "";
    if (!intent) continue; // malformed JSON from this model — try the next one in the chain

    if (intent === "unsupported" || !isCanonicalCommand(intent, command)) {
      return {
        ok: false,
        message: note || "That edit isn't supported by AI-assist yet (only resizing a room or adding a new room). Try one of the example commands.",
        modelUsed: model,
      };
    }

    const applied = applyChatCommand(plan, command);
    return { ...applied, translatedCommand: command, modelUsed: model };
  }

  return sawNetworkError
    ? { ok: false, message: "Could not reach the AI-assist service. Try rephrasing using one of the example commands." }
    : { ok: false, message: "All free AI-assist models are rate-limited right now. Try rephrasing using one of the example commands." };
}
