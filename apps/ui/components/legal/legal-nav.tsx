"use client";

import { useEffect, useState } from "react";

type Item = { id: string; label: string };

/**
 * Sticky table of contents with scroll-spy and a reading-progress bar.
 * One passive scroll listener + rAF throttle; no layout reads beyond
 * getBoundingClientRect on a handful of sections.
 */
export function LegalNav({ items, label }: { items: Item[]; label: string }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
      let current = items[0]?.id ?? "";
      for (const it of items) {
        const el = document.getElementById(it.id);
        if (el && el.getBoundingClientRect().top <= 140) current = it.id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [items]);

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-[var(--primary)]"
        style={{ transform: `scaleX(${progress})` }}
      />
      <nav aria-label={label} className="legal-nav">
        <p className="legal-nav-title">Mục lục</p>
        <ol>
          {items.map((it, i) => (
            <li key={it.id}>
              <a href={`#${it.id}`} data-active={active === it.id ? "true" : undefined}>
                <span className="legal-nav-num">{String(i + 1).padStart(2, "0")}</span>
                <span>{it.label.replace(/^(Điều\s)?\d+\.\s*/, "")}</span>
              </a>
            </li>
          ))}
        </ol>
        <div className="legal-nav-meter" aria-hidden="true">
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <p className="legal-nav-pct">Đã đọc {Math.round(progress * 100)}%</p>
      </nav>
    </>
  );
}
