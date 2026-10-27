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
}

const SUGGESTIONS = [
  "make the primary bedroom bigger",
  "shrink bedroom 2 by 15%",
  "move the bathroom left",
  "rename the office to Studio",
  "add a sofa to the living room",
  "rotate the bed in bedroom 1",
];

/**
 * Natural-language editing on top of the already-generated plan — Maket's
 * other headline feature ("refine any plan by typing changes in natural
 * language"), built on the regex command parser in lib/layout/chatEdit.ts.
 * Every command is a real, inspectable rewrite of the plan (via the same
 * lib/layout/edit.ts primitives the Studio drag editor uses) — never a
 * canned reply.
 */
export function ChatEditPanel({ plan, onChange }: ChatEditPanelProps) {
  const [input, setInput] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const idRef = useRef(0);

  function runCommand(command: string) {
    const trimmed = command.trim();
    if (!trimmed) return;
    const result = applyChatCommand(plan, trimmed);
    const entry: LogEntry = { id: idRef.current++, command: trimmed, message: result.message, ok: result.ok };
    setLog((l) => [...l, entry].slice(-12));
    if (result.ok && result.plan) onChange(result.plan);
    setInput("");
  }

  return (
    <div className="panel" style={{ padding: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 650, marginBottom: 4 }}>Chat edit</h3>
      <p style={{ fontSize: 12.5, color: "var(--color-ink-faint)", marginBottom: 12 }}>
        Type a change in plain language. Parsed instantly, no AI call — try one of the examples below.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="chip" onClick={() => runCommand(s)}>
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
                <div style={{ color: "var(--color-ink-soft)", fontWeight: 600 }}>&ldquo;{entry.command}&rdquo;</div>
                <div style={{ color: entry.ok ? "var(--color-success-text)" : "var(--color-danger-text)" }}>{entry.message}</div>
              </div>
            ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          runCommand(input);
        }}
        style={{ display: "flex", gap: 8 }}
      >
        <input
          type="text"
          className="text-input"
          placeholder="e.g. make bedroom 2 bigger"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={!input.trim()}>
          Apply
        </button>
      </form>
    </div>
  );
}
