/**
 * requestAnimationFrame loop that only runs while it can be seen: it stops
 * when the tab is hidden or the element scrolls out of view, and resumes when
 * both are true again. The returned function cancels everything.
 */
export function startFrameLoop(element: Element, draw: (time: number) => void): () => void {
  let frame = 0;
  let onScreen = true;
  let disposed = false;

  const tick = (time: number) => {
    frame = 0;
    if (disposed) return;
    draw(time);
    schedule();
  };

  const schedule = () => {
    if (disposed || frame) return;
    if (document.visibilityState === "hidden" || !onScreen) return;
    frame = requestAnimationFrame(tick);
  };

  const halt = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };

  const onVisibility = () => {
    if (document.visibilityState === "hidden") halt();
    else schedule();
  };

  const observer =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(
          (entries) => {
            onScreen = entries.some((entry) => entry.isIntersecting);
            if (onScreen) schedule();
            else halt();
          },
          { rootMargin: "120px" },
        );
  observer?.observe(element);
  document.addEventListener("visibilitychange", onVisibility);
  schedule();

  return () => {
    disposed = true;
    halt();
    observer?.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
