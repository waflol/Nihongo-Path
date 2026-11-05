"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export interface GradeCounts {
  AGAIN: number;
  HARD: number;
  GOOD: number;
  EASY: number;
}

const TILES: {
  key: keyof GradeCounts;
  label: string;
  emoji: string;
  glow: string;
  text: string;
}[] = [
  { key: "AGAIN", label: "Quên", emoji: "😵", glow: "#ef4444", text: "text-[#fca5a5]" },
  { key: "HARD", label: "Khó", emoji: "😅", glow: "#f59e0b", text: "text-[#fcd34d]" },
  { key: "GOOD", label: "Tốt", emoji: "🙂", glow: "#22c55e", text: "text-[#86efac]" },
  { key: "EASY", label: "Thuộc", emoji: "🤩", glow: "#38bdf8", text: "text-[#7dd3fc]" },
];

/** Eases a number from 0 → `to` (respecting reduced motion). */
function useCountUp(to: number, duration = 1300, delay = 350): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = requestAnimationFrame(() => setValue(to));
      return () => cancelAnimationFrame(id);
    }
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, Math.max(0, (t - start - delay) / duration));
      setValue(Math.round((1 - Math.pow(1 - p, 3)) * to));
      if (p < 1 || t - start < delay) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration, delay]);
  return value;
}

/** One-shot confetti cannon on a canvas (stops by itself after ~4 s). */
function ConfettiBurst() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const colors = ["#8b5cf6", "#38bdf8", "#4ade80", "#fbbf24", "#f472b6", "#f87171"];
    const parts = Array.from({ length: 140 }, (_, i) => {
      const fromLeft = i % 2 === 0;
      const angle = (fromLeft ? -65 : -115) * (Math.PI / 180) + (Math.random() - 0.5) * 0.7;
      const speed = 9 + Math.random() * 10;
      return {
        x: fromLeft ? w * 0.08 : w * 0.92,
        y: h * 0.95,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 5 + Math.random() * 6,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.4,
        color: colors[i % colors.length],
        shape: i % 3,
        delay: Math.random() * 220,
      };
    });

    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      const t = now - t0;
      ctx.clearRect(0, 0, w, h);
      let alive = false;
      for (const p of parts) {
        if (t < p.delay) {
          alive = true;
          continue;
        }
        p.vy += 0.34; // gravity
        p.vx *= 0.992;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        const fade = Math.max(0, 1 - (t - 2600) / 1400);
        if (p.y < h + 20 && fade > 0) alive = true;
        ctx.save();
        ctx.globalAlpha = Math.min(1, fade);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === 0) ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        else if (p.shape === 1) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(0, -p.size / 2);
          ctx.lineTo(p.size / 2, p.size / 2);
          ctx.lineTo(-p.size / 2, p.size / 2);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
      if (alive) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-20 h-full w-full"
    />
  );
}

function verdict(pct: number): { title: string; sub: string } {
  if (pct >= 90) return { title: "Xuất sắc!", sub: "Bạn gần như thuộc lòng cả bộ rồi." };
  if (pct >= 70) return { title: "Rất tốt!", sub: "Trí nhớ của bạn đang vào guồng." };
  if (pct >= 40) return { title: "Tiến bộ rõ rệt!", sub: "Lặp lại thêm vài lượt là chắc." };
  return { title: "Hoàn thành phiên!", sub: "Những thẻ khó sẽ quay lại đúng lúc để bạn nhớ." };
}

/**
 * Completion "stage": a dark aurora panel with a confetti cannon, a gauge that
 * fills while the percentage counts up, emoji result tiles that rise one by
 * one, and a glowing call-to-action.
 */
export function StudyComplete({
  total,
  reviews,
  grades,
  resetting,
  onBack,
  onReset,
  onRestart,
  restartLabel = "Học lại phiên này",
}: {
  total: number;
  reviews: number;
  grades: GradeCounts;
  resetting: boolean;
  onBack?: () => void;
  /** Omitted for the cross-deck review, which has no single deck to reset. */
  onReset?: () => void;
  onRestart?: () => void;
  restartLabel?: string;
}) {
  const graded = grades.AGAIN + grades.HARD + grades.GOOD + grades.EASY;
  const pct = graded > 0 ? Math.round(((grades.GOOD + grades.EASY) / graded) * 100) : 100;
  const shown = useCountUp(pct);
  const shownTotal = useCountUp(total, 1000, 500);
  const v = verdict(pct);

  return (
    <section
      aria-labelledby="stage-title"
      className="relative mt-8 overflow-hidden rounded-[2rem] bg-[#0b0a1f] px-5 py-10 text-white shadow-[0_30px_80px_-30px_rgba(76,29,149,0.7)] ring-1 ring-white/10 sm:px-12 sm:py-14"
    >
      {/* aurora */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="stage-aurora-a absolute -left-24 -top-24 size-[26rem] rounded-full bg-[#7c3aed] opacity-40 blur-[90px]" />
        <div className="stage-aurora-b absolute -bottom-32 -right-16 size-[28rem] rounded-full bg-[#0ea5e9] opacity-30 blur-[100px]" />
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(255,255,255,0.08),transparent)]" />
      </div>
      <ConfettiBurst />

      <div className="relative z-10 flex flex-col items-center text-center">
        <p className="stage-pop rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
          Phiên ôn tập hoàn tất
        </p>

        {/* gauge */}
        <div
          className="stage-pop relative mt-8 grid size-52 place-items-center sm:size-60"
          style={{ animationDelay: "120ms" }}
        >
          <div
            className="stage-ring absolute inset-0 rounded-full"
            style={{ "--target": pct } as React.CSSProperties}
          />
          <div className="absolute inset-[14px] rounded-full bg-[#0b0a1f]" />
          <div className="absolute inset-0 rounded-full shadow-[0_0_60px_-8px_rgba(139,92,246,0.55)]" />
          <div className="relative z-10 text-center">
            <p className="text-6xl font-extrabold tabular-nums tracking-tight sm:text-7xl">
              {shown}
              <span className="text-3xl text-white/60 sm:text-4xl">%</span>
            </p>
            <p className="mt-1 text-sm font-medium text-white/60">nhớ tốt</p>
          </div>
        </div>

        <h2
          id="stage-title"
          className="stage-pop stage-shine mt-9 bg-[linear-gradient(110deg,#fff_30%,#c4b5fd_45%,#7dd3fc_55%,#fff_70%)] bg-clip-text text-4xl font-black tracking-tight text-transparent sm:text-5xl"
          style={{ animationDelay: "260ms" }}
        >
          {v.title}
        </h2>
        <p className="stage-pop mt-3 max-w-md text-base text-white/70" style={{ animationDelay: "340ms" }}>
          {v.sub} Bạn vừa đi qua <strong className="text-white">{shownTotal}</strong> thẻ
          {reviews > 0 ? <> với <strong className="text-white">{reviews}</strong> lượt đánh giá.</> : "."}
        </p>

        {/* result tiles */}
        {graded > 0 && (
          <ul className="mt-9 grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
            {TILES.map((t, i) => (
              <li
                key={t.key}
                className="stage-pop relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-4 backdrop-blur-sm"
                style={{ animationDelay: `${480 + i * 110}ms` }}
              >
                <span
                  aria-hidden="true"
                  className="absolute -top-8 left-1/2 size-20 -translate-x-1/2 rounded-full opacity-30 blur-2xl"
                  style={{ background: t.glow }}
                />
                <p className="stage-float relative text-2xl" style={{ animationDelay: `${i * 300}ms` }} aria-hidden="true">
                  {t.emoji}
                </p>
                <p className={`relative mt-1 text-3xl font-extrabold tabular-nums ${t.text}`}>
                  {grades[t.key]}
                </p>
                <p className="relative text-xs font-medium uppercase tracking-wider text-white/60">
                  {t.label}
                </p>
              </li>
            ))}
          </ul>
        )}

        {/* actions */}
        <div className="stage-pop mt-10 flex w-full max-w-2xl flex-col gap-3 sm:flex-row sm:justify-center" style={{ animationDelay: "900ms" }}>
          <Link
            href="/learn/exercises"
            className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-white px-8 py-4 text-base font-bold text-[#1e1b4b] shadow-[0_10px_40px_-8px_rgba(167,139,250,0.9)] transition hover:scale-[1.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Ôn luyện với câu hỏi
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span>
          </Link>
          {onRestart && (
          <button
            type="button"
            onClick={onRestart}
            className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/5 px-8 py-4 text-base font-semibold text-white backdrop-blur transition hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {restartLabel}
          </button>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/60">
          {onBack && (
            <button type="button" onClick={onBack} className="hover:text-white">
              ← Quay lại thẻ cuối cùng
            </button>
          )}
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              disabled={resetting}
              className="hover:text-white disabled:opacity-50"
              title="Xoá tiến độ của bộ thẻ — mọi thẻ thành thẻ mới (thẻ vẫn giữ nguyên)"
            >
              {resetting ? "Đang đặt lại…" : "Đặt lại thẻ ghi nhớ"}
            </button>
          )}
          <Link href="/learn/decks" className="hover:text-white">
            Về danh sách bộ thẻ
          </Link>
        </div>
      </div>
    </section>
  );
}
