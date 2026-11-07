"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animated stroke order. KanjiVG paths are rendered verbatim (CC BY-SA —
 * never alter `d`); animation is pure CSS dash offset at render time.
 */
export function StrokeOrder({ strokes }: { strokes: string[] }) {
  const [run, setRun] = useState(0);
  const [shown, setShown] = useState(strokes.length);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (run === 0) return;
    setShown(0);
    strokes.forEach((_, i) => {
      timers.current.push(setTimeout(() => setShown(i + 1), 700 * (i + 1)));
    });
    return () => timers.current.forEach(clearTimeout);
  }, [run, strokes]);

  return (
    <div>
      <svg viewBox="0 0 109 109" className="aspect-square w-full max-w-xs rounded-2xl border border-[var(--border)] bg-[var(--background-1)]">
        <style>{`@keyframes kvgdraw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}`}</style>
        <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3}>
          {strokes.map((d, i) => {
            const state = i < shown - 1 ? "done" : i === shown - 1 ? "now" : "todo";
            return (
              <path
                key={i}
                d={d}
                pathLength={1}
                stroke="currentColor"
                className={state === "todo" ? "opacity-15" : state === "done" ? "opacity-90" : "text-[var(--accent)]"}
                style={
                  state === "now" && run > 0
                    ? { strokeDasharray: 1, animation: "kvgdraw 0.6s ease forwards" }
                    : undefined
                }
              />
            );
          })}
        </g>
      </svg>
      <button
        type="button"
        onClick={() => setRun((n) => n + 1)}
        className="mt-3 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--layer-hover)]"
      >
        ▶ Chạy thứ tự nét
      </button>
      <p className="mt-2 text-xs text-[var(--muted-foreground)]">
        Nét vẽ:{" "}
        <a className="underline" href="https://kanjivg.tagaini.net" target="_blank" rel="noreferrer">
          KanjiVG
        </a>{" "}
        © Ulrich Apel,{" "}
        <a className="underline" href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noreferrer">
          CC BY-SA 3.0
        </a>
      </p>
    </div>
  );
}
