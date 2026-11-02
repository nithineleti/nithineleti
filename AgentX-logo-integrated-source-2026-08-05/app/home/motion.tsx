"use client";

import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { prefersReducedMotion } from "./frame-loop";

/**
 * Scroll reveal for every `[data-reveal]` element inside `root`.
 *
 * Content is server-rendered visible. Only elements that are still below the
 * fold when the page hydrates are hidden and then revealed once, so there is
 * no flash, no hidden content without JavaScript, and nothing moves at all
 * for people who prefer reduced motion.
 */
export function useScrollReveal(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = root.current;
    if (!container || prefersReducedMotion() || typeof IntersectionObserver === "undefined") return;

    const targets = Array.from(container.querySelectorAll<HTMLElement>("[data-reveal]"));
    const fold = window.innerHeight * 0.94;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const element = entry.target as HTMLElement;
          element.dataset.reveal = "shown";
          observer.unobserve(element);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );

    for (const element of targets) {
      if (element.getBoundingClientRect().top < fold) continue;
      element.dataset.reveal = "pending";
      observer.observe(element);
    }

    return () => {
      observer.disconnect();
      // Never leave content hidden if the effect is torn down mid-flight.
      for (const element of targets) {
        if (element.dataset.reveal === "pending") element.dataset.reveal = "";
      }
    };
  }, [root]);
}

/**
 * Pointer-follow spotlight: writes the pointer position into CSS custom
 * properties on the hovered `[data-spotlight]` card. No React state.
 */
export function trackSpotlight(event: ReactPointerEvent<HTMLElement>) {
  if (event.pointerType === "touch") return;
  const card = (event.target as HTMLElement).closest<HTMLElement>("[data-spotlight]");
  if (!card || !event.currentTarget.contains(card)) return;
  const bounds = card.getBoundingClientRect();
  card.style.setProperty("--spot-x", `${(event.clientX - bounds.left).toFixed(1)}px`);
  card.style.setProperty("--spot-y", `${(event.clientY - bounds.top).toFixed(1)}px`);
}

type CountUpProps = { value: number; pad?: number; className?: string };

/**
 * Counts up to a fixed product fact (never a usage metric) the first time it
 * scrolls into view. The server-rendered text is already the final value.
 */
export function CountUp({ value, pad = 2, className }: CountUpProps) {
  const nodeRef = useRef<HTMLSpanElement>(null);
  const format = (current: number) => String(current).padStart(pad, "0");

  useEffect(() => {
    const node = nodeRef.current;
    if (!node || prefersReducedMotion() || typeof IntersectionObserver === "undefined") return;
    if (node.getBoundingClientRect().top < window.innerHeight) return;

    const final = String(value).padStart(pad, "0");
    node.textContent = String(0).padStart(pad, "0");
    let frame = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        const started = performance.now();
        const duration = 650;
        const step = (now: number) => {
          const progress = Math.min(1, (now - started) / duration);
          const eased = 1 - Math.pow(1 - progress, 3);
          node.textContent = String(Math.round(eased * value)).padStart(pad, "0");
          if (progress < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
      },
      { threshold: 0.6 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      node.textContent = final;
    };
  }, [pad, value]);

  return (
    <span ref={nodeRef} className={className}>
      {format(value)}
    </span>
  );
}
