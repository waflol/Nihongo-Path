/**
 * Light animated backdrop for phones: soft drifting colour glows and slowly
 * falling cherry-blossom petals. Pure CSS, decorative, sits behind content.
 * (The Fuji scene is desktop-only: it overlapped the text on narrow screens.)
 */
const PETALS = [
  { x: 6, s: 14, d: 0, t: 11 },
  { x: 17, s: 10, d: 4, t: 13 },
  { x: 29, s: 16, d: 8, t: 12 },
  { x: 41, s: 11, d: 2, t: 14 },
  { x: 53, s: 15, d: 6, t: 11 },
  { x: 64, s: 10, d: 9.5, t: 13 },
  { x: 76, s: 14, d: 3, t: 12 },
  { x: 88, s: 12, d: 7, t: 14 },
  { x: 94, s: 9, d: 11, t: 10 },
];

export function PetalField({ className = "" }: { className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      <style>{`
        @keyframes pf-fall{0%{transform:translate3d(0,-8vh,0) rotate(0deg);opacity:0}10%{opacity:.75}50%{transform:translate3d(28px,48vh,0) rotate(200deg)}90%{opacity:.6}100%{transform:translate3d(-18px,108vh,0) rotate(400deg);opacity:0}}
        @keyframes pf-glow-a{from{transform:translate3d(-10%,0,0) scale(1)}to{transform:translate3d(18%,12%,0) scale(1.25)}}
        @keyframes pf-glow-b{from{transform:translate3d(10%,0,0) scale(1.15)}to{transform:translate3d(-16%,-10%,0) scale(.9)}}
        .pf-petal{position:absolute;top:0;border-radius:0 100% 0 100%;background:linear-gradient(135deg,#fbcfe8,#f472b6);animation:pf-fall linear infinite;will-change:transform}
        .pf-glow{position:absolute;border-radius:9999px;filter:blur(48px);animation-duration:14s;animation-timing-function:ease-in-out;animation-iteration-count:infinite;animation-direction:alternate;will-change:transform}
        @media (prefers-reduced-motion:reduce){.pf-petal,.pf-glow{animation:none}.pf-petal{display:none}}
      `}</style>
      <span
        className="pf-glow"
        style={{ left: "-20%", top: "6%", width: "70%", height: "34%", background: "color-mix(in srgb, var(--primary) 26%, transparent)", animationName: "pf-glow-a" }}
      />
      <span
        className="pf-glow"
        style={{ right: "-25%", bottom: "8%", width: "75%", height: "38%", background: "color-mix(in srgb, #f472b6 22%, transparent)", animationName: "pf-glow-b" }}
      />
      {PETALS.map((p, i) => (
        <span
          key={i}
          className="pf-petal"
          style={{ left: `${p.x}%`, width: p.s, height: p.s, animationDuration: `${p.t}s`, animationDelay: `-${p.d}s`, opacity: 0.7 }}
        />
      ))}
    </div>
  );
}
