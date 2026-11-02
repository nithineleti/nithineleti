"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { formatClock } from "./call-timer";
import { CALLER_PROFILE, type Timeline } from "./call-script";
import type { SimState } from "./use-simulated-call";
import c from "./console.module.css";

export type TranscriptEntry =
  | {
      kind: "turn";
      id: string;
      speaker: "agent" | "caller" | "system";
      label: string;
      initials: string;
      time?: string;
      /** Word-by-word rendering (simulation). Falls back to `text`. */
      words?: { text: string; mark: boolean }[];
      text: string;
      streaming: boolean;
      /** True once the turn is complete and may be announced. */
      final: boolean;
    }
  | { kind: "tool"; id: string; tool: string; state: "running" | "done" | "failed"; detail: string }
  | { kind: "thinking"; id: string }
  | { kind: "end"; id: string; text: string };

const TOOL_ROW_TEXT: Record<string, { running: string; done: string }> = {
  create_lead: { running: "Saving lead…", done: "Lead saved" },
  request_human_handoff: { running: "Queuing callback…", done: "Callback queued" },
  request_appointment: { running: "Requesting slot…", done: "Appointment requested" },
};

export function toolRowText(tool: string, state: "running" | "done" | "failed") {
  if (state === "failed") return "Not saved";
  return TOOL_ROW_TEXT[tool]?.[state] ?? (state === "running" ? "Running…" : "Done");
}

/** Turn the simulation state into transcript rows. Pure; safe to call in render. */
export function simulationEntries(timeline: Timeline, state: SimState): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  const toolState = new Map(state.tools.map((item) => [item.tool, item.state]));
  const pushTools = (turnIndex: number) => {
    for (const tool of timeline.turns[turnIndex]?.tools ?? []) {
      const current = toolState.get(tool);
      if (!current) continue;
      entries.push({
        kind: "tool",
        id: `tool-${tool}`,
        tool,
        state: current,
        detail: current === "done" ? "would be recorded" : "",
      });
    }
  };

  const callerKnown = Boolean(state.fields.caller && !state.fields.caller.pending);
  for (let index = 0; index <= state.turn; index += 1) {
    const turn = timeline.turns[index];
    pushTools(index);
    const shown = state.revealed[index] ?? 0;
    const isCaller = turn.speaker === "caller";
    entries.push({
      kind: "turn",
      id: `sim-${index}`,
      speaker: turn.speaker,
      label: isCaller ? (callerKnown ? CALLER_PROFILE.name : "Caller") : "AgentX",
      initials: isCaller ? (callerKnown ? "RT" : "C") : "AX",
      time: formatClock(Math.max(0, Math.floor(turn.at / 1000))),
      words: turn.words.slice(0, shown).map((text, wordIndex) => ({
        text,
        mark: turn.marks.some(([from, to]) => wordIndex >= from && wordIndex <= to),
      })),
      text: turn.text,
      streaming: index === state.turn && state.finished <= index && state.phase === "inCall",
      final: state.finished > index,
    });
  }

  if (state.thinking) {
    pushTools(state.turn + 1);
    entries.push({ kind: "thinking", id: `thinking-${state.turn}` });
  }

  const duration = formatClock(Math.floor((timeline.endedAt - timeline.connectedAt) / 1000));
  if (state.phase === "wrapUp") entries.push({ kind: "end", id: "end", text: `Caller hung up · ${duration}` });
  if (state.phase === "completed") entries.push({ kind: "end", id: "end", text: `Call ended · ${duration}` });
  if (state.phase === "stopped") entries.push({ kind: "end", id: "end", text: "Simulation stopped" });
  return entries;
}

type TranscriptPanelProps = {
  entries: TranscriptEntry[];
  title: string;
  meta: ReactNode;
  empty: ReactNode;
};

function Check() {
  return (
    <svg className={c.check} viewBox="0 0 16 16" aria-hidden="true">
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  );
}

export default function TranscriptPanel({ entries, title, meta, empty }: TranscriptPanelProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  // Follow new content inside the panel only. Never scroll the page, and stop
  // following if the reader has scrolled up to re-read something.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || !stickRef.current) return;
    body.scrollTop = body.scrollHeight;
  }, [entries]);

  return (
    <div className={c.transcriptInner}>
      <div className={c.colHead}>
        <span>{title}</span>
        <b>{meta}</b>
      </div>
      <div
        className={c.transcriptBody}
        ref={bodyRef}
        tabIndex={0}
        aria-label="Call transcript"
        onScroll={(event) => {
          const body = event.currentTarget;
          stickRef.current = body.scrollHeight - body.scrollTop - body.clientHeight < 140;
        }}
      >
        {entries.length === 0 ? (
          empty
        ) : (
          <div className={c.log} role="log" aria-live="polite" aria-relevant="additions">
            {entries.map((entry) => {
              if (entry.kind === "thinking") {
                return (
                  <div className={c.thinking} key={entry.id}>
                    <span className={c.chip} aria-hidden="true">AX</span>
                    <span>
                      <span className={c.dots} aria-hidden="true"><i /><i /><i /></span>
                      AgentX is thinking
                    </span>
                  </div>
                );
              }
              if (entry.kind === "tool") {
                return (
                  <div className={c.toolRow} data-state={entry.state} key={entry.id}>
                    {entry.state === "running" ? <span className={c.spinner} aria-hidden="true" /> : <Check />}
                    <code>{entry.tool}</code>
                    <span>
                      {toolRowText(entry.tool, entry.state)}
                      {entry.detail ? ` · ${entry.detail}` : ""}
                    </span>
                  </div>
                );
              }
              if (entry.kind === "end") {
                return (
                  <div className={c.endRow} key={entry.id} role="status">
                    {entry.text}
                  </div>
                );
              }
              return (
                <article className={c.turn} data-speaker={entry.speaker} key={entry.id}>
                  <span className={c.chip} aria-hidden="true">{entry.initials}</span>
                  <div className={c.turnMeta}>
                    <span>{entry.label}</span>
                    {entry.time ? <time>{entry.time}</time> : null}
                  </div>
                  <p className={c.turnText}>
                    {entry.words ? (
                      <span aria-hidden="true">
                        {entry.words.map((word, index) => (
                          <span className={word.mark ? `${c.word} ${c.mark}` : c.word} key={index}>
                            {word.text}{" "}
                          </span>
                        ))}
                        {entry.streaming ? <span className={c.caret} /> : null}
                      </span>
                    ) : (
                      <span aria-hidden={!entry.final}>{entry.text}</span>
                    )}
                    {entry.words && entry.final ? (
                      <span className={c.srOnly}>
                        {entry.label}: {entry.text}
                      </span>
                    ) : null}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
