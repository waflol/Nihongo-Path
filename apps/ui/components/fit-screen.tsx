"use client";

import { useLayoutEffect } from "react";

/**
 * Marks <html> while a one-viewport page (/ or /learn) is mounted so globals.css
 * can hide the footer / lock body scroll. Replaces `body:has(...)` selectors,
 * which forced expensive style recalculation on every navigation.
 * With `maxWidth`, the one-screen mode only applies at or below that viewport
 * width (e.g. phones) and larger screens scroll normally; `minHeight` keeps very
 * short viewports (small or landscape phones) scrollable instead of clipped.
 * `media` takes a full media query and wins over the other two.
 */
export function FitScreen({ lg = false, maxWidth, minHeight, media }: { lg?: boolean; maxWidth?: number; minHeight?: number; media?: string }) {
  useLayoutEffect(() => {
    const cls = lg ? "fit-screen-lg" : "fit-screen";
    const el = document.documentElement;
    if (maxWidth === undefined && !media) {
      el.classList.add(cls, "learn-bg");
      return () => el.classList.remove(cls, "learn-bg");
    }
    const mq = window.matchMedia(media ?? `(max-width: ${maxWidth}px)` + (minHeight ? ` and (min-height: ${minHeight}px)` : ""));
    const apply = () => el.classList.toggle(cls, mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      el.classList.remove(cls);
    };
  }, [lg, maxWidth, minHeight, media]);
  return null;
}
