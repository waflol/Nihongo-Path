"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

interface Drag {
  from: number;
  to: number;
  /** How far the dragged row has moved from where it started. */
  dy: number;
  /** Height of the dragged row: the rows it passes shift by this much. */
  height: number;
}

/** Distance from the top / bottom of the window where dragging scrolls the page. */
const EDGE = 90;
const SCROLL_STEP = 14;

/**
 * Drag-to-reorder for a vertical list, on pointer events so mouse, pen and
 * touch behave the same (HTML5 drag-and-drop does not fire on touch screens).
 * Rows may differ in height. Release drops; Escape or a cancelled pointer
 * leaves the order as it was.
 */
export function useDragReorder(onDrop: (from: number, to: number) => void) {
  const rows = useRef(new Map<number, HTMLElement>());
  const stop = useRef<(() => void) | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  useEffect(() => () => stop.current?.(), []);

  const rowRef = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      if (el) rows.current.set(index, el);
      else rows.current.delete(index);
    },
    [],
  );

  function start(e: ReactPointerEvent, from: number, count: number) {
    if (e.button !== 0 || stop.current) return;
    // Page coordinates, so scrolling during the drag does not skew the maths.
    const boxes = Array.from({ length: count }, (_, i) => {
      const r = rows.current.get(i)?.getBoundingClientRect();
      return r ? { top: r.top + window.scrollY, height: r.height } : null;
    });
    const own = boxes[from];
    if (!own || boxes.some((b) => !b)) return;
    e.preventDefault();

    const pointer = e.pointerId;
    const startY = e.clientY + window.scrollY;
    let clientY = e.clientY;
    let to = from;
    let frame = 0;

    const update = () => {
      const first = boxes[0]!;
      const last = boxes[count - 1]!;
      // The row stays inside the list.
      const dy = Math.min(last.top + last.height - own.top - own.height, Math.max(first.top - own.top, clientY + window.scrollY - startY));
      // It takes a neighbour's place once its leading edge passes that row's middle.
      to = from;
      for (let i = from + 1; i < count; i += 1) if (own.top + own.height + dy > boxes[i]!.top + boxes[i]!.height / 2) to = i;
      for (let i = from - 1; i >= 0; i -= 1) if (own.top + dy < boxes[i]!.top + boxes[i]!.height / 2) to = i;
      setDrag({ from, to, dy, height: own.height });
    };
    const scroll = () => {
      const step = clientY < EDGE ? -SCROLL_STEP : clientY > window.innerHeight - EDGE ? SCROLL_STEP : 0;
      if (step) {
        window.scrollBy(0, step);
        update();
      }
      frame = requestAnimationFrame(scroll);
    };
    const end = (drop: boolean) => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      stop.current = null;
      setDrag(null);
      if (drop && to !== from) onDrop(from, to);
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointer) return;
      clientY = ev.clientY;
      update();
    };
    const up = (ev: PointerEvent) => ev.pointerId === pointer && end(true);
    const cancel = (ev: PointerEvent) => ev.pointerId === pointer && end(false);
    const key = (ev: KeyboardEvent) => ev.key === "Escape" && end(false);

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    stop.current = () => end(false);
    update();
    frame = requestAnimationFrame(scroll);
  }

  /** Position of row `index` while a drag is in progress. */
  function styleOf(index: number): CSSProperties | undefined {
    if (!drag) return undefined;
    const { from, to, dy, height } = drag;
    if (index === from) return { transform: `translateY(${dy}px)`, position: "relative", zIndex: 10 };
    const shift = index > from && index <= to ? -height : index < from && index >= to ? height : 0;
    return { transform: `translateY(${shift}px)`, transition: "transform 150ms ease" };
  }

  return { rowRef, start, styleOf, dragging: drag?.from ?? null, active: drag !== null };
}
