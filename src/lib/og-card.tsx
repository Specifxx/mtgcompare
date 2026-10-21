// The site's 1200×630 share card, drawn with next/og: the root card (app/opengraph-image.tsx), each region home's (app/og/[region])
// and each guide's (app/og/guides/[slug]). Static, rendered once at build: no database, no remote fetch (no emoji flags, no remote
// logos). Its text is the brand's display face, bundled in src/app/fonts (Bricolage Grotesque, SIL OFL 1.1, static instances: satori
// cannot read a variable font, and next/og's own font is a regular-weight Noto that would draw every heading thin).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

const INK = "#15171c";
const MUTED = "#5c606c";
const BRAND = "#d2300a";
const LINE = "#e4e3de";
const OPEN = "#147638";
const OPEN_SOFT = "#e2f5e8";

const font = (file: string) => readFileSync(join(process.cwd(), "src/app/fonts", file));

/** One comparison row of the card on the right: a store, its stock, its price, drawn as shapes (no invented names or prices). */
function Row({ best = false, store, price }: { best?: boolean; store: number; price: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "18px 20px",
        borderRadius: 16,
        background: best ? "#fdece7" : "#ffffff",
        border: `2px solid ${best ? BRAND : LINE}`,
      }}
    >
      <div style={{ width: 40, height: 40, borderRadius: 10, background: best ? BRAND : "#efeee9", display: "flex", flexShrink: 0 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flexGrow: 1, minWidth: 0 }}>
        <div style={{ width: store, height: 14, borderRadius: 7, background: best ? INK : "#c9c8c2", display: "flex" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 10px", borderRadius: 999, background: OPEN_SOFT, color: OPEN, fontSize: 16, alignSelf: "flex-start" }}>
          <div style={{ width: 7, height: 7, borderRadius: 7, background: OPEN, display: "flex" }} />
          In stock
        </div>
      </div>
      <div style={{ width: price, height: 22, borderRadius: 8, background: best ? INK : "#c9c8c2", display: "flex", flexShrink: 0 }} />
    </div>
  );
}

export interface OgCard {
  /** The headline, one entry per line; `true` draws that line in the brand's red. */
  lines: [string, boolean][];
  /** The line under the headline. */
  sub: string;
  /** Small pills along the bottom (region codes, a region's currency…). */
  chips: string[];
  /** A small label beside the logo ("Guide", "Australia"). */
  tag?: string;
  /** Headline size: 64 for four short lines, smaller for a long guide title. */
  size?: number;
}

/** The card as a PNG response. */
export function ogCard({ lines, sub, chips, tag, size = 64 }: OgCard): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#f6f6f3",
          backgroundImage: "radial-gradient(circle at 0% 0%, rgba(210,48,10,0.14), rgba(210,48,10,0) 45%), radial-gradient(circle at 100% 0%, rgba(255,203,5,0.22), rgba(255,203,5,0) 40%)",
          padding: 64,
          fontFamily: "Bricolage",
          color: INK,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 650 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <svg width="64" height="64" viewBox="0 0 64 64">
              <rect width="64" height="64" rx="16" fill={BRAND} />
              <path d="M18 16h14c10 0 16 6.5 16 16s-6 16-16 16H18z" fill="#fff" />
              <path d="M26 24h5.5c5 0 8 3 8 8s-3 8-8 8H26z" fill={BRAND} />
              <rect x="18" y="30" width="30" height="4" fill={BRAND} />
            </svg>
            <div style={{ display: "flex", fontSize: 42, fontWeight: 800, letterSpacing: -1 }}>
              Dex<span style={{ color: BRAND }}>Compare</span>
            </div>
            {tag && (
              <div style={{ display: "flex", marginLeft: 8, padding: "4px 14px", borderRadius: 999, background: INK, color: "#ffffff", fontSize: 22, fontWeight: 600 }}>{tag}</div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", fontSize: size, fontWeight: 800, lineHeight: 1.04, letterSpacing: -2 }}>
            {lines.map(([text, accent]) => (
              <div key={text} style={{ display: "flex", color: accent ? BRAND : INK }}>
                {text}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", fontSize: 27, fontWeight: 600, color: MUTED }}>{sub}</div>
            <div style={{ display: "flex", gap: 10 }}>
              {chips.map((c) => (
                <div key={c} style={{ display: "flex", padding: "6px 16px", borderRadius: 999, border: `2px solid ${LINE}`, background: "#ffffff", fontSize: 22, fontWeight: 600, color: INK }}>
                  {c}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", marginLeft: "auto", width: 380 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
              padding: 22,
              borderRadius: 28,
              background: "#ffffff",
              border: `2px solid ${LINE}`,
              boxShadow: "0 24px 60px -20px rgba(24,22,18,0.28)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px 4px" }}>
              <div style={{ display: "flex", fontSize: 22, fontWeight: 800 }}>Cheapest first</div>
              <div style={{ display: "flex", padding: "4px 12px", borderRadius: 999, background: BRAND, color: "#ffffff", fontSize: 16, fontWeight: 600 }}>Best price</div>
            </div>
            <Row best store={118} price={78} />
            <Row store={92} price={84} />
            <Row store={128} price={88} />
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Bricolage", data: font("BricolageGrotesque-ExtraBold.ttf"), weight: 800, style: "normal" },
        { name: "Bricolage", data: font("BricolageGrotesque-SemiBold.ttf"), weight: 600, style: "normal" },
      ],
    },
  );
}

/** Words wrapped into lines of at most `max` characters (a share card's headline). */
export function wrapWords(text: string, max: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/)) {
    if (line && (line + " " + w).length > max) {
      out.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
}
