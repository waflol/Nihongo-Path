import { PetalField } from "@/components/home/petal-field";

/**
 * Phone-only animated backdrop: a tinted dawn sky, a large breathing sun, three
 * ink-wash mountain ridges drifting at different speeds, and falling petals.
 * Pure CSS and decorative; everything sits behind the content.
 */
const PERIOD = 1200;

/** One ridge outline that tiles seamlessly: the peak list repeats over two periods. */
function ridge(peaks: number[], base: number): string {
  const step = PERIOD / peaks.length;
  const pts: [number, number][] = [];
  for (let rep = 0; rep < 2; rep++) {
    peaks.forEach((h, i) => pts.push([rep * PERIOD + i * step, base - h]));
  }
  pts.push([2 * PERIOD, base - peaks[0]]);
  let d = `M0 ${base} L${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    d += ` C${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`;
  }
  return `${d} L${2 * PERIOD} ${base} Z`;
}

const LAYERS = [
  { peaks: [120, 70, 150, 90, 130, 60], color: "var(--primary)", opacity: 0.14, secs: 70, top: "0%" },
  { peaks: [80, 125, 60, 105, 75, 115], color: "var(--primary)", opacity: 0.2, secs: 46, top: "22%" },
  { peaks: [55, 85, 45, 78, 60, 90], color: "var(--primary-800)", opacity: 0.26, secs: 30, top: "44%" },
];

export function DawnField({ className = "" }: { className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      <style>{`
        @keyframes dw-drift{from{transform:translate3d(0,0,0)}to{transform:translate3d(-50%,0,0)}}
        @keyframes dw-sun{0%,100%{transform:scale(1);opacity:.55}50%{transform:scale(1.12);opacity:.8}}
        .dw-ridge{position:absolute;left:0;width:200%;height:56%;animation:dw-drift linear infinite;will-change:transform}
        .dw-sun{animation:dw-sun 9s ease-in-out infinite}
        @media (prefers-reduced-motion:reduce){.dw-ridge,.dw-sun{animation:none}}
      `}</style>

      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(to bottom, color-mix(in srgb, var(--primary) 16%, transparent) 0%, color-mix(in srgb, #ffb88a 14%, transparent) 46%, transparent 78%)" }}
      />
      <div
        className="dw-sun absolute -right-20 top-[6%] size-72 rounded-full"
        style={{ background: "radial-gradient(circle, #ffb27a 0%, rgba(255,140,107,.45) 38%, transparent 68%)" }}
      />

      <div className="absolute inset-x-0 top-[26%] h-[40%]">
        {LAYERS.map((l, i) => (
          <svg
            key={i}
            className="dw-ridge"
            style={{ top: l.top, animationDuration: `${l.secs}s`, opacity: l.opacity }}
            viewBox={`0 0 ${2 * PERIOD} 200`}
            preserveAspectRatio="none"
          >
            <path d={ridge(l.peaks, 200)} style={{ fill: l.color }} />
          </svg>
        ))}
        <div
          className="absolute inset-x-0 bottom-0 h-1/2"
          style={{ background: "linear-gradient(to bottom, transparent, var(--background))" }}
        />
      </div>

      <PetalField className="absolute inset-0 overflow-hidden" />
    </div>
  );
}
