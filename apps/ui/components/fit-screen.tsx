"use client";

import { useLayoutEffect } from "react";

/**
 * Marks <html> while a one-viewport page (/ or /learn) is mounted so globals.css
 * can hide the footer / lock body scroll. Replaces `body:has(...)` selectors,
 * which forced expensive style recalculation on every navigation.
 */
export function FitScreen({ lg = false }: { lg?: boolean }) {
  useLayoutEffect(() => {
    const cls = lg ? "fit-screen-lg" : "fit-screen";
    const el = document.documentElement;
    el.classList.add(cls, "learn-bg");
    return () => el.classList.remove(cls, "learn-bg");
  }, [lg]);
  return null;
}
