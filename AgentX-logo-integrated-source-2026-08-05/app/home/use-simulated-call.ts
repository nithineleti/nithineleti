"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  buildTimeline,
  type FieldKey,
  type SimPhase,
  type Timeline,
  type TimelineEvent,
  type ToolKey,
} from "./call-script";
import type { VoiceSignal } from "./voice-signal";

export type FieldState = { value: string; pending: boolean; seq: number };
export type ToolState = { tool: ToolKey; state: "running" | "done"; seq: number };

export type SimState = {
  phase: SimPhase;
  /** Index of the newest turn that has started. */
  turn: number;
  /** Words revealed in each started turn. */
  revealed: number[];
  /** Turns that have finished speaking (for screen-reader announcements). */
  finished: number;
  thinking: boolean;
  fields: Partial<Record<FieldKey, FieldState>>;
  tools: ToolState[];
  seq: number;
};

const initialState: SimState = {
  phase: "idle",
  turn: -1,
  revealed: [],
  finished: 0,
  thinking: false,
  fields: {},
  tools: [],
  seq: 0,
};

type Action =
  | { type: "reset" }
  | { type: "stop" }
  | { type: "events"; events: TimelineEvent[] };

function reduce(state: SimState, action: Action): SimState {
  if (action.type === "reset") return { ...initialState, phase: "dialing" };
  if (action.type === "stop") return { ...state, phase: "stopped", thinking: false };

  let next = state;
  for (const event of action.events) {
    const seq = next.seq + 1;
    switch (event.type) {
      case "phase":
        next = { ...next, phase: event.phase, thinking: false, seq };
        break;
      case "thinking":
        next = { ...next, thinking: event.on, seq };
        break;
      case "turn": {
        const revealed = [...next.revealed];
        revealed[event.turn] = 0;
        next = { ...next, turn: event.turn, revealed, thinking: false, seq };
        break;
      }
      case "word": {
        const revealed = [...next.revealed];
        revealed[event.turn] = event.word + 1;
        next = { ...next, revealed, seq };
        break;
      }
      case "turnEnd":
        next = { ...next, finished: event.turn + 1, seq };
        break;
      case "capture":
        next = {
          ...next,
          fields: { ...next.fields, [event.field]: { value: event.value, pending: event.pending, seq } },
          seq,
        };
        break;
      case "tool": {
        const others = next.tools.filter((item) => item.tool !== event.tool);
        const existing = next.tools.find((item) => item.tool === event.tool);
        next = {
          ...next,
          tools: [...others, { tool: event.tool, state: event.state, seq: existing?.seq ?? seq }].sort(
            (a, b) => a.seq - b.seq,
          ),
          seq,
        };
        break;
      }
    }
  }
  return next;
}

/**
 * Plays the scripted call on a single timer chain. The clock pauses while the
 * tab is hidden (background timers are throttled, which would otherwise make
 * the call jump), and every timer is cleared on stop and unmount.
 */
export function useSimulatedCall(signal: VoiceSignal) {
  const [state, dispatch] = useReducer(reduce, initialState);
  const [timeline] = useState<Timeline>(buildTimeline);
  const cursorRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const pausedAtRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const frozenRef = useRef<number | null>(null);
  const startedRef = useRef(false);

  const clock = useCallback(() => {
    if (frozenRef.current !== null) return frozenRef.current;
    const now = pausedAtRef.current ?? performance.now();
    return now - startRef.current;
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const pump = useCallback(function step() {
    if (!runningRef.current || pausedAtRef.current !== null) return;
    const elapsed = clock();
    const due: TimelineEvent[] = [];
    while (cursorRef.current < timeline.events.length && timeline.events[cursorRef.current].t <= elapsed + 4) {
      due.push(timeline.events[cursorRef.current]);
      cursorRef.current += 1;
    }

    if (due.length) {
      const base = performance.now() - elapsed;
      for (const event of due) {
        if (event.type === "word") {
          const turn = timeline.turns[event.turn];
          signal.word(turn.words[event.word], turn.speaker, base + event.t, event.duration);
        } else if (event.type === "phase" && event.phase === "ringing") {
          signal.ringFor(base + event.t, base + event.t + 1500);
        } else if (event.type === "phase" && event.phase !== "dialing") {
          signal.silence();
        }
      }
      dispatch({ type: "events", events: due });
    }

    const nextEvent = timeline.events[cursorRef.current];
    if (!nextEvent) {
      runningRef.current = false;
      timerRef.current = null;
      return;
    }
    timerRef.current = window.setTimeout(step, Math.max(0, nextEvent.t - clock()));
  }, [clock, signal, timeline]);

  const start = useCallback(() => {
    clearTimer();
    signal.reset();
    cursorRef.current = 0;
    frozenRef.current = null;
    startedRef.current = true;
    startRef.current = performance.now();
    pausedAtRef.current = document.visibilityState === "hidden" ? startRef.current : null;
    runningRef.current = true;
    dispatch({ type: "reset" });
    pump();
  }, [clearTimer, pump, signal]);

  const stop = useCallback(() => {
    if (!runningRef.current) return;
    frozenRef.current = clock();
    runningRef.current = false;
    clearTimer();
    signal.silence();
    dispatch({ type: "stop" });
  }, [clearTimer, clock, signal]);

  useEffect(() => {
    const onVisibility = () => {
      if (!runningRef.current) return;
      if (document.visibilityState === "hidden") {
        if (pausedAtRef.current === null) pausedAtRef.current = performance.now();
        clearTimer();
        signal.silence();
      } else if (pausedAtRef.current !== null) {
        startRef.current += performance.now() - pausedAtRef.current;
        pausedAtRef.current = null;
        pump();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      runningRef.current = false;
      clearTimer();
    };
  }, [clearTimer, pump, signal]);

  /** Whole seconds since the call connected, or null before it connects. */
  const callSeconds = useCallback(() => {
    if (!startedRef.current) return null;
    const elapsed = clock();
    if (elapsed < timeline.connectedAt) return null;
    return Math.floor((Math.min(elapsed, timeline.endedAt) - timeline.connectedAt) / 1000);
  }, [clock, timeline]);

  return { state, timeline, start, stop, callSeconds };
}
