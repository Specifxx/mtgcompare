// Small SVG flags for the region switchers (owner, 2026-11-02: "have the
// flags as well"). Drawn here, not emoji: Windows shows a flag emoji as two
// letters. Since 2026-11-10 (site review X1) a flag is an <img> of a static
// file, public/flags/<code>.svg, written from FLAGS by scripts/write-flags.tsx:
// drawn inline, the header, footer and region chips repeated ~2 KB of SVG per
// flag in the HTML and again in the page payload, about 60 KB a page. Bodies
// are functions so importing this file draws nothing (the node tests import
// components without React). Shared by the Compare Empire sites.
import type { CSSProperties, ReactElement } from "react";

function star(cx: number, cy: number, r: number, points = 5, inner = 0.4): string {
  const out: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? r : r * inner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    out.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return out.join(" ");
}

const BLUE = "#012169";
const RED = "#C8102E";

// The Union Jack in a 60×30 box (simplified: the red saltire is not offset).
const unionJack = () => (
  <>
    <rect width="60" height="30" fill={BLUE} />
    <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
    <path d="M0,0 L60,30 M60,0 L0,30" stroke={RED} strokeWidth="2" />
    <path d="M30,0 V30 M0,15 H60" stroke="#fff" strokeWidth="10" />
    <path d="M30,0 V30 M0,15 H60" stroke={RED} strokeWidth="6" />
  </>
);

// A simplified maple leaf around (20, 10) in a 40×20 box.
const LEAF_RIGHT: [number, number][] = [
  [0, -7], [1.3, -4.6], [2.6, -5.2], [2.1, -1.6], [4.2, -3.9], [4.7, -2.7], [6.6, -3.1],
  [5.8, -0.6], [6.6, -0.2], [3, 2.6], [3.4, 3.7], [0.45, 3.2], [0.45, 6.4],
];
const leaf = [...LEAF_RIGHT, ...LEAF_RIGHT.slice().reverse().map(([x, y]) => [-x, y] as [number, number])]
  .map(([x, y]) => `${(20 + x).toFixed(2)},${(10.3 + y).toFixed(2)}`)
  .join(" ");

export const FLAGS: Record<string, { box: string; body: () => ReactElement }> = {
  US: {
    box: "0 0 38 20",
    body: () => (
      <>
        <rect width="38" height="20" fill="#B22234" />
        <path
          d={Array.from({ length: 6 }, (_, i) => `M0,${((i * 2 + 1.5) * 20) / 13} H38`).join(" ")}
          stroke="#fff"
          strokeWidth={20 / 13}
        />
        <rect width="15.2" height={(20 * 7) / 13} fill="#3C3B6E" />
        {[0, 1, 2].flatMap((row) =>
          [0, 1, 2, 3].map((col) => <circle key={`${row}${col}`} cx={2.2 + col * 3.6} cy={2 + row * 3.4} r="0.75" fill="#fff" />),
        )}
      </>
    ),
  },
  UK: { box: "0 0 60 30", body: unionJack },
  GB: { box: "0 0 60 30", body: unionJack },
  CA: {
    box: "0 0 40 20",
    body: () => (
      <>
        <rect width="40" height="20" fill="#fff" />
        <rect width="10" height="20" fill="#D52B1E" />
        <rect x="30" width="10" height="20" fill="#D52B1E" />
        <polygon points={leaf} fill="#D52B1E" />
      </>
    ),
  },
  AU: {
    box: "0 0 60 30",
    body: () => (
      <>
        <rect width="60" height="30" fill={BLUE} />
        <g transform="scale(0.5)">{unionJack()}</g>
        <polygon points={star(15, 22.6, 4.6, 7)} fill="#fff" />
        <polygon points={star(45, 25, 2.4, 7)} fill="#fff" />
        <polygon points={star(37.5, 14, 2.4, 7)} fill="#fff" />
        <polygon points={star(45, 5.5, 2.4, 7)} fill="#fff" />
        <polygon points={star(51.6, 12, 2.4, 7)} fill="#fff" />
        <polygon points={star(48, 16.2, 1.3, 5)} fill="#fff" />
      </>
    ),
  },
  NZ: {
    box: "0 0 60 30",
    body: () => (
      <>
        <rect width="60" height="30" fill={BLUE} />
        <g transform="scale(0.5)">{unionJack()}</g>
        {[
          [45, 24.5],
          [38, 13.5],
          [45, 5.8],
          [51.6, 11.8],
        ].map(([x, y]) => (
          <g key={`${x}${y}`}>
            <polygon points={star(x, y, 2.9)} fill="#fff" />
            <polygon points={star(x, y, 2.1)} fill={RED} />
          </g>
        ))}
      </>
    ),
  },
  EU: {
    box: "0 0 30 20",
    body: () => (
      <>
        <rect width="30" height="20" fill="#003399" />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (Math.PI * 2 * i) / 12;
          return <polygon key={i} points={star(15 + 6.6 * Math.sin(a), 10 - 6.6 * Math.cos(a), 1.15)} fill="#FFCC00" />;
        })}
      </>
    ),
  },
  JP: {
    box: "0 0 30 20",
    body: () => (
      <>
        <rect width="30" height="20" fill="#fff" />
        <circle cx="15" cy="10" r="6" fill="#BC002D" />
      </>
    ),
  },
  SG: {
    box: "0 0 30 20",
    body: () => (
      <>
        <rect width="30" height="20" fill="#fff" />
        <rect width="30" height="10" fill="#EF3340" />
        <circle cx="7" cy="5" r="3.6" fill="#fff" />
        <circle cx="8.4" cy="5" r="3.3" fill="#EF3340" />
        {Array.from({ length: 5 }, (_, i) => {
          const a = (Math.PI * 2 * i) / 5;
          return <polygon key={i} points={star(10.6 + 1.9 * Math.sin(a), 5.1 - 1.9 * Math.cos(a), 0.65)} fill="#fff" />;
        })}
      </>
    ),
  },
};

/** True when there is a drawn flag for this region code (US, UK/GB, CA, AU, NZ, EU, SG, JP). */
export function hasFlag(code: string): boolean {
  return code.toUpperCase() in FLAGS;
}

/**
 * A region's flag, 3:2, about the height of the text beside it (globals.css .flag). Decorative:
 * the region's name or code is always written next to it.
 */
export function Flag({ code, className, style }: { code: string; className?: string; style?: CSSProperties }) {
  const key = code.toUpperCase();
  if (!FLAGS[key]) return null;
  // eslint-disable-next-line @next/next/no-img-element -- a 1 KB static SVG; next/image would add a function call per flag
  return <img src={`/flags/${key.toLowerCase()}.svg`} alt="" aria-hidden="true" width={27} height={18} decoding="async" className={className ? `flag ${className}` : "flag"} style={style} />;
}
