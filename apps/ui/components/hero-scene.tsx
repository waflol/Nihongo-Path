/**
 * Animated hero backdrop: Mt. Fuji at dawn. Sun rises, snowcap fades in,
 * mist drifts, birds fly past and petals fall. Pure CSS (no JS), decorative.
 * Intentionally NOT disabled by prefers-reduced-motion: it is slow, looping
 * ambience requested as a core part of the brand banner.
 */
const FUJI =
  "M930 600 C1130 540 1270 320 1345 205 C1380 192 1420 192 1455 205 C1530 320 1670 540 1880 600Z";
const CAP =
  "M1345 205 C1380 192 1420 192 1455 205 C1470 232 1482 262 1492 296 L1462 276 L1438 306 L1410 274 L1384 304 L1362 272 L1334 298 C1338 262 1342 232 1345 205Z";
const MIST =
  "M-1920 520 q120 -30 240 0"+" t240 0".repeat(17)+" V600 H-1920Z";
const PETALS = [
  { x: 1000, d: 0, s: 1, t: 7 },
  { x: 1150, d: 2.5, s: 1.3, t: 9 },
  { x: 1300, d: 5, s: 0.8, t: 8 },
  { x: 1450, d: 1, s: 1.1, t: 10 },
  { x: 1580, d: 4, s: 0.9, t: 7 },
  { x: 1700, d: 6.5, s: 1.4, t: 9 },
  { x: 1820, d: 3, s: 1, t: 8 },
  { x: 880, d: 7, s: 0.8, t: 10 },
];

export function HeroScene({ className = "" }: { className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      <style>{`
        @keyframes hs-rise{from{transform:translateY(170px)}to{transform:translateY(0)}}
        @keyframes hs-fade{from{opacity:0}to{opacity:1}}
        @keyframes hs-mist{from{transform:translateX(0)}to{transform:translateX(-240px)}}
        @keyframes hs-fall{from{transform:translate(0,-60px) rotate(0)}50%{transform:translate(60px,300px) rotate(180deg)}to{transform:translate(-20px,680px) rotate(360deg)}}
        @keyframes hs-fly{from{transform:translate(120px,0)}to{transform:translate(-900px,-60px)}}
        @keyframes hs-flap{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.35)}}
        .hs-rise{animation:hs-rise 3.2s cubic-bezier(.2,.7,.2,1) .2s both}
        .hs-fade{animation:hs-fade 2s ease-out 1.4s both}
        .hs-mist{animation:hs-mist 8s linear infinite}
        .hs-petal{animation:hs-fall 8s linear infinite}
        .hs-bird{animation:hs-fly 9s linear infinite}
        .hs-wing{transform-box:fill-box;transform-origin:center;animation:hs-flap .5s ease-in-out infinite}
      `}</style>
      <svg viewBox="0 0 1920 600" preserveAspectRatio="xMaxYMax meet" className="h-full w-full overflow-visible">
        <g className="hs-rise">
          <circle cx="1400" cy="215" r="118" fill="#ff5a3c" />
        </g>
        <path d={FUJI} fill="#312e81" />
        <path className="hs-fade" d={CAP} fill="#fff" />
        <path
          d="M640 600 C760 520 860 470 960 470 C1060 470 1160 520 1320 600Z"
          fill="#3730a3"
          opacity=".9"
        />
        <g className="hs-mist" opacity=".35">
          <path d={MIST} fill="#fde8f0" />
        </g>
        {[0, 1, 2, 3].map((i) => (
          <g key={i} className="hs-bird" style={{ animationDelay: `${-i * 2.2}s` }}>
            <path
              className="hs-wing"
              d={`M1700 ${110 + i * 28} q12 -14 24 0 q12 -14 24 0`}
              stroke="#1e1b4b"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              style={{ animationDelay: `${-i * 0.17}s` }}
            />
          </g>
        ))}
        {PETALS.map((p, i) => (
          <g key={i} className="hs-petal" style={{ animationDelay: `${-p.d}s`, animationDuration: `${p.t}s` }}>
            <path
              transform={`translate(${p.x} 0) scale(${p.s})`}
              d="M0 0 C8 -6 16 0 14 10 C8 12 2 8 0 0Z"
              fill="#f9a8d4"
              opacity=".85"
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
