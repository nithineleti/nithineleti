"use client";

import { useEffect, useRef } from "react";

type CallTimerProps = {
  /** Returns whole seconds elapsed, or null when there is nothing to time. */
  read: () => number | null;
  /** Poll while true; when false the last value stays on screen. */
  running: boolean;
  className?: string;
};

export function formatClock(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * mm:ss call clock. It writes straight to the DOM node four times a second
 * instead of re-rendering the console every tick.
 */
export default function CallTimer({ read, running, className }: CallTimerProps) {
  const nodeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return;
    const paint = () => {
      const seconds = read();
      const text = seconds === null ? "--:--" : formatClock(seconds);
      if (node.textContent !== text) node.textContent = text;
    };
    paint();
    if (!running) return;
    const interval = window.setInterval(paint, 250);
    return () => window.clearInterval(interval);
  }, [read, running]);

  return (
    <span ref={nodeRef} className={className} role="timer" aria-label="Call duration">
      --:--
    </span>
  );
}
