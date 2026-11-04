"use client";

import { useRef, useState } from "react";
import type { FloorPlan } from "@/lib/layout/types";
import { applyChatCommand } from "@/lib/layout/chatEdit";

interface ChatEditPanelProps {
  plan: FloorPlan;
  onChange: (plan: FloorPlan) => void;
}

interface LogEntry {
  id: number;
  command: string;
  message: string;
  ok: boolean;
  aiAssisted?: boolean;
}

const SUGGESTIONS = [
  "make the primary bedroom bigger",
  "shrink bedroom 2 by 15%",
  "move the bathroom left",
  "rename the office to Studio",
  "add a sofa to the living room",
  "rotate the bed in bedroom 1",
  "add a window to the kitchen",
  "remove the front door",
];

/**
 * Natural-language editing on top of the already-generated plan — Maket's
 * other headline feature ("refine any plan by typing changes in natural
 * language"), built on the regex command parser in lib/layout/chatEdit.ts.
 * Every command is a real, inspectable rewrite of the plan (via the same
 * lib/layout/edit.ts primitives the Studio drag editor uses) — never a
 * canned reply. Phrasings that parser doesn't recognize fall back to a real
 * server-side AI-assist (app/api/chat-edit/route.ts, lib/layout/chatEditAI.ts)
 * that translates them into one of the parser's own canonical forms and
 * re-applies the exact same deterministic logic — so this stays free/instant
 * for every command the regex already understands, and only makes a network
 * call for the rest.
 */
export function ChatEditPanel({ plan, onChange }: ChatEditPanelProps) {
  const [input, setInput] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [aiPending, setAiPending] = useState(false);
  const idRef = useRef(0);

  function appendLog(entry: Omit<LogEntry, "id">) {
    setLog((l) => [...l, { id: idRef.current++, ...entry }].slice(-12));
  }

  async function runCommand(command: string) {
    const trimmed = command.trim();
    if (!trimmed) return;
    setInput("");

    const result = applyChatCommand(plan, trimmed);
    if (result.ok) {
      appendLog({ command: trimmed, message: result.message, ok: true });
      if (result.plan) onChange(result.plan);
      return;
    }

    setAiPending(true);
    try {
      const res = await fetch("/api/chat-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, command: trimmed }),
      });
      const data = await res.json();
      const ok = data?.ok === true;
      const baseMessage = typeof data?.message === "string" ? data.message : "AI-assist couldn't process that request.";
      const message = typeof data?.translatedCommand === "string" ? `${baseMessage} (understood as "${data.translatedCommand}")` : baseMessage;
      appendLog({ command: trimmed, message, ok, aiAssisted: true });
      if (ok && data.plan) onChange(data.plan as FloorPlan);
    } catch {
      appendLog({ command: trimmed, message: "Could not reach AI-assist. Try one of the example commands.", ok: false, aiAssisted: true });
    } finally {
      setAiPending(false);
    }
  }

  return (
    <div className="panel" style={{ padding: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 650, marginBottom: 4 }}>Chat edit</h3>
      <p style={{ fontSize: 12.5, color: "var(--color-ink-faint)", marginBottom: 12 }}>
        Type a change in plain language. Common phrasings apply instantly, no AI call — anything else is translated by a free AI assist. Try one of the examples below.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="chip" disabled={aiPending} onClick={() => void runCommand(s)}>
            {s}
          </button>
        ))}
      </div>

      {log.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginBottom: 12,
            maxHeight: 180,
            overflowY: "auto",
            paddingRight: 4,
          }}
        >
          {log
            .slice()
            .reverse()
            .map((entry) => (
              <div key={entry.id} style={{ fontSize: 12.5 }}>
                <div style={{ color: "var(--color-ink-soft)", fontWeight: 600 }}>
                  &ldquo;{entry.command}&rdquo;
                  {entry.aiAssisted && <span style={{ color: "var(--color-ink-faint)", fontWeight: 500 }}> · AI assist</span>}
                </div>
                <div style={{ color: entry.ok ? "var(--color-success-text)" : "var(--color-danger-text)" }}>{entry.message}</div>
              </div>
            ))}
        </div>
      )}

      {aiPending && (
        <p style={{ fontSize: 12.5, color: "var(--color-ink-faint)", marginBottom: 8 }}>Asking the AI assist to translate that…</p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runCommand(input);
        }}
        style={{ display: "flex", gap: 8 }}
      >
        <input
          type="text"
          className="text-input"
          placeholder="e.g. make bedroom 2 bigger"
          value={input}
          disabled={aiPending}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={!input.trim() || aiPending}>
          {aiPending ? "Thinking…" : "Apply"}
        </button>
      </form>
    </div>
  );
}
