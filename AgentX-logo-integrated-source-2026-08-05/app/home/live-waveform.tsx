"use client";

import { useEffect, useRef } from "react";
import { startFrameLoop } from "./frame-loop";
import { TONE_RGB, type VoiceSignal, type VoiceTone } from "./voice-signal";

type LiveWaveformProps = {
  signal: VoiceSignal;
  className?: string;
  bars?: number;
};

const STEP_MS = 55;

/**
 * Compact scrolling level meter. Newest sample on the right; each bar keeps
 * the colour of whoever was speaking when it was sampled. All per-frame data
 * lives in closures and refs, never in React state.
 */
export default function LiveWaveform({ signal, className, bars = 34 }: LiveWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const levels = new Float32Array(bars);
    const tones: VoiceTone[] = Array.from({ length: bars }, () => "idle");
    let lastStep = 0;
    let width = 0;
    let height = 0;
    let ratio = 1;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, Math.round(bounds.width));
      height = Math.max(1, Math.round(bounds.height));
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    const draw = (time: number) => {
      const level = signal.sample(time);
      if (time - lastStep >= STEP_MS) {
        lastStep = time;
        levels.copyWithin(0, 1);
        tones.copyWithin(0, 1);
        levels[bars - 1] = level;
        tones[bars - 1] = level > 0.03 ? signal.tone : "idle";
      } else {
        // Let the newest bar track the live level between steps.
        levels[bars - 1] = Math.max(levels[bars - 1], level);
      }

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const gap = 2;
      const barWidth = Math.max(1.5, (width - gap * (bars - 1)) / bars);
      const middle = height / 2;
      for (let index = 0; index < bars; index += 1) {
        const value = levels[index];
        const barHeight = Math.max(2, value * (height - 2));
        const [r, g, b] = TONE_RGB[tones[index]];
        const age = index / (bars - 1);
        const alpha = tones[index] === "idle" ? 0.22 : 0.35 + 0.65 * age;
        context.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
        const x = index * (barWidth + gap);
        const radius = Math.min(barWidth / 2, 1.5);
        context.beginPath();
        context.roundRect(x, middle - barHeight / 2, barWidth, barHeight, radius);
        context.fill();
      }
    };

    const stop = startFrameLoop(canvas, draw);
    return () => {
      stop();
      resizeObserver.disconnect();
    };
  }, [bars, signal]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
