// The share-image compositions (1200×630). Pure functions of already-loaded data:
// the routes in src/app/**/opengraph-image.tsx load, these draw. They live here,
// not in the routes, because an image route may export only the names Next
// recognises (default, alt, size, contentType, runtime, revalidate, …); a
// helper exported from a route passes tsc and then fails next build.
//
// Satori rules (learned the hard way, keep them):
// - Every <div> gets display: "flex", even a single-text cell; justifyContent
//   needs it to right-align. Satori throws otherwise.
// - One text node per element: build strings in one template literal.
// - JPEG/PNG only, passed as data: URIs fetched by lib/og/art.ts; a null art
//   draws <ArtPlaceholder>, never an <img> that might fail.
// - No emoji or flag glyphs (each makes satori fetch an emoji font per render).
// - radial-gradient must be the unsized "circle at x y" form.
// - Safe area: content inside x 48–1152, y 30–612; nothing essential below
//   ~575 (Reddit/X overlay the domain there). The centre square (x 285–915)
//   always holds real content.
import type { CSSProperties, ReactNode } from "react";
import { HAT_PATHS } from "../../components/Logo";
import { MARKETS, type Country } from "../country";
import type { OgPrice, OgRow } from "./select";
import { showMoveColumn } from "./select";
import { OG, MARKETS_LINE, SEA_BG, SET_STATS, badgeText, clip, clipWords, fitStats, ogDelta, ogMoney, plural, printingDot, rarityTone, setTitleSize, splitEdition } from "./theme";

const F = {
  brand: { fontFamily: "Luckiest Guy", fontWeight: 400 },
  display: { fontFamily: "Archivo", fontWeight: 900 },
  semi: { fontFamily: "Inter", fontWeight: 600 },
  bold: { fontFamily: "Inter", fontWeight: 700 },
  mono: { fontFamily: "JetBrains Mono", fontWeight: 700 },
} as const;

const PANEL: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  background: OG.ink900,
  border: `1.5px solid ${OG.ink800}`,
  borderRadius: 14,
  boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
  overflow: "hidden",
};
const ROW_RULE = "1.5px solid rgba(20,31,52,0.8)";

function Canvas({ children, padding, bg = SEA_BG, column = false }: { children: ReactNode; padding: string; bg?: string; column?: boolean }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: column ? "column" : "row",
        padding,
        background: OG.page,
        backgroundImage: bg,
        color: OG.white,
        fontFamily: "Inter",
      }}
    >
      {children}
    </div>
  );
}

// ── Brand ────────────────────────────────────────────────────────────────────
export function Hat({ size, id = "h" }: { size: number; id?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <defs>
        <linearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe28c" />
          <stop offset="1" stopColor="#e3a531" />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f8d262" />
          <stop offset="1" stopColor="#c7861f" />
        </linearGradient>
      </defs>
      <ellipse {...HAT_PATHS.brim} fill={`url(#${id}b)`} stroke="#7d520e" strokeWidth="1.6" />
      <path d={HAT_PATHS.brimLine} stroke="#7d520e" strokeWidth="1" fill="none" opacity="0.45" />
      <path d={HAT_PATHS.crown} fill={`url(#${id}c)`} stroke="#7d520e" strokeWidth="1.6" />
      <path d={HAT_PATHS.band} fill="#d92b33" stroke="#6e1016" strokeWidth="1.2" />
      <path d={HAT_PATHS.shine} stroke="#fff6cf" strokeWidth="1.6" fill="none" opacity="0.75" strokeLinecap="round" />
    </svg>
  );
}

export function Lockup({ hat = 46, text = 29 }: { hat?: number; text?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <Hat size={hat} />
      <div style={{ display: "flex", marginLeft: 10, ...F.display, fontSize: text, letterSpacing: -0.5 }}>
        <span style={{ color: OG.redWord }}>OP</span>
        <span style={{ color: OG.white }}>Compare</span>
      </div>
    </div>
  );
}

function Eyebrow({ children, size = 19 }: { children: string; size?: number }) {
  return <div style={{ display: "flex", ...F.bold, fontSize: size, color: OG.straw, letterSpacing: 2.6, textTransform: "uppercase" }}>{children}</div>;
}

/** Art box: the data URI when we have one, else a dark plate with a small hat. */
function Art({ src, width, height, radius = 4, border = true, shadow }: { src: string | null | undefined; width: number; height: number; radius?: number; border?: boolean; shadow?: string }) {
  const frame: CSSProperties = { borderRadius: radius, ...(border ? { border: `1px solid ${OG.ink700}` } : {}), ...(shadow ? { boxShadow: shadow } : {}) };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="" src={src} width={width} height={height} style={{ ...frame, objectFit: "cover" }} />;
  }
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width, height, background: OG.ink800, ...frame }}>
      <Hat size={Math.round(Math.min(width, height) * 0.56)} id={`p${width}`} />
    </div>
  );
}

function PrintingBadge({ printing, text, size = 18, dot = 11 }: { printing: string; text: string; size?: number; dot?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <div style={{ display: "flex", width: dot, height: dot, borderRadius: dot, background: printingDot(printing), marginRight: 8 }} />
      <div style={{ display: "flex", ...F.semi, fontSize: size, color: OG.slate300 }}>{text}</div>
    </div>
  );
}

// ── (a)/(b) The price guide ──────────────────────────────────────────────────
// Cheapest sits straight after the card, so a centre-square crop (Reddit's compact
// thumbnail, x 285–915) keeps the site's selling point and the market beside it.
const GUIDE_COLS = { card: 400, low: 203, market: 214, set: 150, last: 86 }; // 1053 = 1104 − 3 border − 48 padding

export function PriceTable({ rows, showMove }: { rows: OgRow[]; showMove: boolean }) {
  const c = GUIDE_COLS;
  const head: CSSProperties = { display: "flex", ...F.bold, fontSize: 15, letterSpacing: 1.6, color: OG.slate500, textTransform: "uppercase" };
  const num: CSSProperties = { display: "flex", ...F.mono, justifyContent: "flex-end" };
  return (
    <div style={PANEL}>
      <div style={{ display: "flex", alignItems: "center", height: 40, padding: "0 24px", borderBottom: `1.5px solid ${OG.ink800}`, background: OG.ink850 }}>
        <div style={{ ...head, width: c.card }}>Card</div>
        <div style={{ ...head, width: c.low, justifyContent: "flex-end", color: OG.straw }}>Cheapest ▼</div>
        <div style={{ ...head, width: c.market, justifyContent: "flex-end" }}>TCGplayer market</div>
        <div style={{ ...head, width: c.set, justifyContent: "flex-end" }}>Set · No.</div>
        <div style={{ ...head, width: c.last, justifyContent: "flex-end" }}>{showMove ? "7 days" : "Stores"}</div>
      </div>
      {rows.map((r, i) => {
        const d = ogDelta(r.change7d);
        return (
          <div
            key={r.id}
            style={{
              display: "flex",
              alignItems: "center",
              height: 76,
              padding: "0 24px",
              borderBottom: i < rows.length - 1 ? ROW_RULE : "none",
              background: i % 2 ? "rgba(255,255,255,0.012)" : "transparent",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", width: c.card }}>
              <Art src={r.art} width={50} height={70} />
              <div style={{ display: "flex", flexDirection: "column", marginLeft: 16 }}>
                <div style={{ display: "flex", ...F.bold, fontSize: 27, color: OG.slate100, lineHeight: 1.1 }}>{clip(r.name, 21)}</div>
                <div style={{ display: "flex", marginTop: 6 }}>
                  <PrintingBadge printing={r.printing} text={badgeText(r)} />
                </div>
              </div>
            </div>
            <div style={{ ...num, width: c.low, fontSize: 30, color: OG.accent }}>{ogMoney(r.low)}</div>
            <div style={{ ...num, width: c.market, fontSize: 25, color: OG.slate300 }}>{ogMoney(r.marketUsd)}</div>
            <div style={{ ...num, width: c.set, fontSize: 19, color: OG.slate400 }}>{r.number ?? r.setCode}</div>
            {showMove ? (
              <div style={{ ...num, width: c.last, fontSize: 23, color: d.color }}>{d.text}</div>
            ) : (
              <div style={{ ...num, width: c.last, fontSize: 23, color: OG.slate300 }}>{r.stores ? String(r.stores) : "—"}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Stats({ items, size = 26 }: { items: [string, string][]; size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", fontSize: size }}>
      {items.map(([v, l], i) => (
        <div key={l} style={{ display: "flex", alignItems: "baseline", marginLeft: i ? 20 : 0 }}>
          <span style={{ ...F.mono, color: OG.white }}>{v}</span>
          <span style={{ ...F.semi, color: OG.slate400, marginLeft: 8 }}>{l}</span>
        </div>
      ))}
    </div>
  );
}

function GuideTitle({ size = 58 }: { size?: number }) {
  return (
    <div style={{ display: "flex", ...F.brand, fontSize: size, lineHeight: 1, textTransform: "uppercase", letterSpacing: 0.5 }}>
      <span style={{ color: OG.redWord, marginRight: Math.round(size * 0.28) }}>One Piece</span>
      <span style={{ color: OG.white }}>Price Guide</span>
    </div>
  );
}

export type GuideVariant = "home" | "guide";

const GUIDE_FOOTER: Record<GuideVariant, [string, string]> = {
  home: ["Every card, the cheapest store in your market, updated twice a day", "opcompare.app"],
  guide: ["Every printing in one table · sorted by price · updated twice a day", "opcompare.app/price-guide"],
};

/** The site default and /price-guide: brand header + a five-row price guide. */
export function GuideImage({ rows, cards, stores, variant = "home" }: { rows: OgRow[]; cards: number; stores: number; variant?: GuideVariant }) {
  const [tag, url] = GUIDE_FOOTER[variant];
  return (
    <Canvas padding="30px 48px 0" column>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", height: 108 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <Lockup />
          <div style={{ display: "flex", marginTop: 10 }}>
            <GuideTitle />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", paddingBottom: 4 }}>
          <Stats
            items={[
              [cards.toLocaleString("en-US"), "cards"],
              [stores.toLocaleString("en-US"), "stores"],
              [String(MARKETS.length), "markets"],
            ]}
          />
          <div style={{ display: "flex", ...F.bold, fontSize: 18, color: OG.straw, marginTop: 10, letterSpacing: 2.6 }}>{MARKETS_LINE}</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 14 }}>
        <PriceTable rows={rows.slice(0, 5)} showMove={showMoveColumn(rows)} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
        <div style={{ display: "flex", ...F.semi, fontSize: 20, color: OG.slate400 }}>{tag}</div>
        <div style={{ display: "flex", ...F.mono, fontSize: 20, color: OG.slate300 }}>{url}</div>
      </div>
    </Canvas>
  );
}

/** No data, no remote images: what any route draws when the catalogue is empty or a read throws. */
export function FallbackImage() {
  const widths = [300, 240, 330, 210, 270];
  return (
    <Canvas padding="40px 48px" column>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
        <Lockup hat={72} text={44} />
        <div style={{ display: "flex", marginTop: 18 }}>
          <GuideTitle size={76} />
        </div>
        <div style={{ display: "flex", ...F.semi, fontSize: 28, color: OG.slate300, marginTop: 16 }}>
          {`Every card's cheapest price, compared across stores in ${MARKETS.length} markets`}
        </div>
        <div style={{ ...PANEL, width: 900, marginTop: 30 }}>
          {widths.map((w, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", height: 44, padding: "0 22px", borderBottom: i < widths.length - 1 ? ROW_RULE : "none" }}>
              <div style={{ display: "flex", width: 22, height: 30, borderRadius: 3, background: OG.ink700 }} />
              <div style={{ display: "flex", width: w, height: 12, borderRadius: 6, background: OG.ink700, marginLeft: 18 }} />
              <div style={{ display: "flex", flex: 1 }} />
              <div style={{ display: "flex", width: 110, height: 12, borderRadius: 6, background: "rgba(245,197,66,0.55)" }} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", ...F.semi, fontSize: 22, color: OG.straw, letterSpacing: 3, marginTop: 26 }}>{MARKETS_LINE}</div>
      </div>
    </Canvas>
  );
}

// ── (c) A set's own price guide ──────────────────────────────────────────────
function MiniTable({ rows }: { rows: OgRow[] }) {
  const head: CSSProperties = { display: "flex", ...F.bold, fontSize: 15, letterSpacing: 1.6, color: OG.slate500, textTransform: "uppercase" };
  // Rows run by TCGplayer market (the set's most valuable first). The big number is
  // the cheapest in-stock US listing; a row without one shows the market itself,
  // marked "≈" and dimmed, so the column never claims a market price is a store's.
  return (
    <div style={PANEL}>
      <div style={{ display: "flex", alignItems: "center", height: 40, padding: "0 22px", borderBottom: `1.5px solid ${OG.ink800}`, background: OG.ink850 }}>
        <div style={{ ...head, width: 400 }}>Top cards by value</div>
        <div style={{ ...head, width: 206, justifyContent: "flex-end", color: OG.straw }}>Cheapest</div>
      </div>
      {rows.slice(0, 5).map((r, i, all) => {
        const badge = `${badgeText(r)} · ${r.number ?? r.setCode}`;
        const listed = r.low != null;
        const price = listed ? ogMoney(r.low) : `≈${ogMoney(r.marketUsd)}`;
        // r.stores counts real stores only: a TCGplayer or eBay low has none to name.
        const sub = listed ? (r.stores ? `${plural(r.stores, "store")} · mkt ${ogMoney(r.marketUsd)}` : `mkt ${ogMoney(r.marketUsd)}`) : r.stores
            ? `mkt · ${plural(r.stores, "store")} far above`
            : "no store · TCGplayer mkt";
        return (
          <div key={r.id} style={{ display: "flex", alignItems: "center", height: 92, padding: "0 22px", borderBottom: i < all.length - 1 ? ROW_RULE : "none" }}>
            <Art src={r.art} width={58} height={81} />
            <div style={{ display: "flex", flexDirection: "column", marginLeft: 16, width: 326 }}>
              <div style={{ display: "flex", ...F.bold, fontSize: 26, color: OG.slate100 }}>{clip(r.name, 20)}</div>
              <div style={{ display: "flex", marginTop: 5 }}>
                <PrintingBadge printing={r.printing} text={badge.length <= 30 ? badge : clip(badgeText(r), 28)} size={17} dot={10} />
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", width: 206 }}>
              <div style={{ display: "flex", ...F.mono, fontSize: 29, color: listed ? OG.accent : OG.slate400 }}>{price}</div>
              <div style={{ display: "flex", ...F.semi, fontSize: 17, color: OG.slate400, marginTop: 2 }}>{sub}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export interface SetImageProps {
  code: string;
  name: string;
  kindLabel: string;
  printings: number;
  /** The set's most valuable printing (TCGplayer market, US cents), or null. */
  topCard: number | null;
  /** "28 Aug 2026"; empty when unknown. */
  released: string;
  upcoming: boolean;
  rows: OgRow[];
  /** Art-only cards for the upcoming / unpriced composition. */
  preview: OgRow[];
  /** The set's booster box (or any sealed) art, drawn when no card has art yet. */
  boxArt?: string | null;
}

export function SetImage(p: SetImageProps) {
  const priced = p.rows.length >= 3;
  const datePlate = !priced && !p.preview.length && !p.boxArt && p.upcoming && !!p.released;
  const released: [string, string][] = p.released && !datePlate ? [[p.released, p.upcoming ? "releases" : "released"]] : [];
  const stats = fitStats([
    [p.printings.toLocaleString("en-US"), "printings"],
    ...(priced && p.topCard != null ? [[ogMoney(p.topCard), "top card"] as [string, string]] : []),
    ...released,
  ]);
  const { title, edition } = splitEdition(p.name);
  // "ST-03 PRE · Super Pre-Release": the edition note, when the name carries one, in place of the kind.
  const eyebrow = `${p.code} · ${edition ? edition.replace(/\s+Edition$/i, "") : p.kindLabel}`;
  return (
    <Canvas padding="40px 48px 40px">
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 396, marginRight: 32 }}>
        <Lockup />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <Eyebrow size={eyebrow.length > 22 ? 15 : 19}>{clipWords(eyebrow, 30)}</Eyebrow>
          <div style={{ display: "flex", ...F.display, fontSize: setTitleSize(title), lineHeight: 1.02, color: OG.white, marginTop: 10, letterSpacing: -1 }}>
            {clipWords(title, 60)}
          </div>
          <div style={{ display: "flex", ...F.semi, fontSize: 23, color: OG.slate300, marginTop: 14 }}>Card list & prices</div>
        </div>
        <div style={{ display: "flex", width: SET_STATS.width, overflow: "hidden" }}>
          {stats.map(([v, l], i) => (
            <div key={l} style={{ display: "flex", flexDirection: "column", flexShrink: 0, marginLeft: i ? SET_STATS.gap : 0 }}>
              <div style={{ display: "flex", ...F.mono, fontSize: SET_STATS.value, color: OG.accent }}>{v}</div>
              <div style={{ display: "flex", ...F.bold, fontSize: SET_STATS.label, color: OG.slate400, marginTop: 4, textTransform: "uppercase", letterSpacing: 1.2 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1 }}>
        {priced ? (
          <MiniTable rows={p.rows} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            {p.preview.length ? (
              <div style={{ display: "flex" }}>
                {p.preview.slice(0, 4).map((r, i) => (
                  <div key={r.id} style={{ display: "flex", marginLeft: i ? 16 : 0 }}>
                    <Art src={r.art} width={140} height={195} radius={10} border={false} shadow="0 14px 36px rgba(0,0,0,0.6)" />
                  </div>
                ))}
              </div>
            ) : p.boxArt ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 420, height: 420, background: OG.white, borderRadius: 18, boxShadow: "0 18px 50px rgba(0,0,0,0.55)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="" src={p.boxArt} width={390} height={390} style={{ objectFit: "contain" }} />
              </div>
            ) : datePlate ? (
              <div style={{ ...PANEL, alignItems: "center", justifyContent: "center", width: 520, height: 400 }}>
                <Hat size={150} id="soon" />
                <div style={{ display: "flex", ...F.bold, fontSize: 20, letterSpacing: 2.6, color: OG.straw, textTransform: "uppercase", marginTop: 6 }}>Releases</div>
                <div style={{ display: "flex", ...F.mono, fontSize: 56, color: OG.accent, marginTop: 8 }}>{p.released}</div>
              </div>
            ) : (
              <SealedPlate kindLabel={p.kindLabel} width={420} height={420} />
            )}
            <div style={{ display: "flex", ...F.semi, fontSize: 24, color: OG.slate400, marginTop: 28 }}>
              {p.upcoming ? "Prices appear on release day" : `No store listings yet · tracked across ${MARKETS.length} markets`}
            </div>
          </div>
        )}
      </div>
    </Canvas>
  );
}

// ── Prices for cards and sealed ──────────────────────────────────────────────
const MARKET_PLACE: Record<Country, string> = { US: "the US", AU: "Australia", UK: "the UK", SG: "Singapore", CA: "Canada", EU: "the EU" };

function PriceBlock({
  head,
  marketUsd,
  extra,
  others,
}: {
  head: OgPrice;
  marketUsd: number | null;
  extra?: string;
  others: { country: Country; cents: number }[];
}) {
  const where = head.country === "US" ? "US" : head.country;
  const lines: string[] = [];
  if (head.kind === "listing") {
    const mkt = marketUsd != null ? `TCGplayer market ${ogMoney(marketUsd)}` : null;
    lines.push([mkt, extra].filter(Boolean).join(" · ") || (head.stores ? "Cheapest in-stock store price" : "Cheapest in-stock listing"));
    lines.push(
      head.stores
        ? `Cheapest of ${plural(head.stores, `${where} store`)} · ${MARKETS.length} markets compared`
        : `Cheapest ${where} listing · ${MARKETS.length} markets compared`,
    );
  } else if (head.kind === "reference") {
    lines.push(["TCGplayer market price", extra].filter(Boolean).join(" · "));
    if (head.ask) {
      // A lone listing far above the market: shown, never the headline.
      const at = head.ask.country === "US" ? "US" : head.ask.country;
      lines.push(`Cheapest ${at} listing ${ogMoney(head.ask.cents, head.ask.country)}${head.ask.stores ? ` (${plural(head.ask.stores, "store")})` : ""}`);
    } else {
      lines.push(`No store listings yet · tracked across ${MARKETS.length} markets`);
    }
  } else {
    lines.push(`Tracked across ${MARKETS.length} markets · no TCGplayer price yet`);
  }
  const chipSize = others.length >= 5 ? 17 : 19;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {head.kind === "none" ? (
        <div style={{ display: "flex", ...F.semi, fontSize: 34, color: OG.slate300 }}>No store listings yet</div>
      ) : (
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <div style={{ display: "flex", ...F.semi, fontSize: 26, color: OG.slate400, marginRight: 14 }}>{head.kind === "listing" ? "from" : "≈"}</div>
          <div style={{ display: "flex", ...F.mono, fontSize: 74, color: OG.accent, lineHeight: 1 }}>{ogMoney(head.cents, head.country)}</div>
          {head.kind === "listing" && head.country !== "US" ? (
            <div style={{ display: "flex", ...F.semi, fontSize: 24, color: OG.slate400, marginLeft: 14 }}>{`in ${MARKET_PLACE[head.country]}`}</div>
          ) : null}
        </div>
      )}
      {lines.map((l, i) => (
        <div key={i} style={{ display: "flex", ...F.semi, fontSize: 22, color: i ? OG.slate400 : OG.slate300, marginTop: i ? 6 : 12 }}>
          {l}
        </div>
      ))}
      {others.length ? (
        <div style={{ display: "flex", marginTop: 16 }}>
          {others.slice(0, 5).map((o) => (
            <div
              key={o.country}
              style={{ display: "flex", alignItems: "baseline", padding: "5px 11px", marginRight: 8, borderRadius: 7, background: OG.ink850, border: `1.5px solid ${OG.ink800}` }}
            >
              <span style={{ ...F.bold, fontSize: 15, color: OG.slate500, marginRight: 7 }}>{o.country}</span>
              <span style={{ ...F.mono, fontSize: chipSize, color: OG.slate100 }}>{ogMoney(o.cents, o.country)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Chip({ children, color = OG.slate100, dot }: { children: string; color?: string; dot?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "6px 14px", borderRadius: 8, background: OG.ink850, border: `1.5px solid ${OG.ink700}`, marginRight: 10 }}>
      {dot ? <div style={{ display: "flex", width: 12, height: 12, borderRadius: 6, background: dot, marginRight: 10 }} /> : null}
      <div style={{ display: "flex", ...F.semi, fontSize: 21, color }}>{children}</div>
    </div>
  );
}

// ── (d) A card ───────────────────────────────────────────────────────────────
export interface CardImageProps {
  name: string;
  variant: string | null;
  printing: string;
  printingLabel: string;
  rarity: string | null;
  rarityLabel: string | null;
  number: string | null;
  setName: string;
  art: string | null;
  marketUsd: number | null;
  head: OgPrice;
  others: { country: Country; cents: number }[];
}

export function CardImage(p: CardImageProps) {
  const n = p.name.length;
  const size = n > 40 ? 40 : n > 28 ? 46 : n > 18 ? 54 : 66;
  const eyebrow = [p.number, p.setName].filter(Boolean).join(" · ");
  return (
    <Canvas
      padding="44px 56px 44px 48px"
      bg="radial-gradient(circle at 18% 40%, rgba(217,43,51,0.28) 0%, rgba(217,43,51,0) 45%), radial-gradient(circle at 95% 0%, rgba(245,197,66,0.12) 0%, rgba(245,197,66,0) 40%)"
    >
      {p.art ? (
        <Art src={p.art} width={388} height={542} radius={16} border={false} shadow="0 18px 50px rgba(0,0,0,0.7)" />
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 388, height: 542, borderRadius: 16, background: OG.ink900, border: `1.5px solid ${OG.ink800}` }}>
          <Hat size={220} id="cardplate" />
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, marginLeft: 48 }}>
        <Lockup />
        <div style={{ display: "flex", flexDirection: "column" }}>
          {eyebrow ? <Eyebrow>{clip(eyebrow, 48)}</Eyebrow> : null}
          <div style={{ display: "flex", ...F.display, fontSize: size, lineHeight: 1.02, color: OG.white, marginTop: 10, letterSpacing: -1 }}>{clip(p.name, 72)}</div>
          <div style={{ display: "flex", marginTop: 16 }}>
            <Chip dot={printingDot(p.printing)}>{clip(p.variant ?? p.printingLabel, 34)}</Chip>
            {p.rarityLabel ? <Chip color={rarityTone(p.rarity)}>{p.rarityLabel}</Chip> : null}
          </div>
        </div>
        <PriceBlock head={p.head} marketUsd={p.marketUsd} others={p.others} />
      </div>
    </Canvas>
  );
}

// ── (c) A sealed product ─────────────────────────────────────────────────────
function SealedPlate({ kindLabel, width = 470, height = 542 }: { kindLabel: string; width?: number; height?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width, height, background: OG.ink900, border: `1.5px solid ${OG.ink800}`, borderRadius: 18 }}>
      <Hat size={Math.round(Math.min(width, height) * 0.42)} id="plate" />
      <div style={{ display: "flex", ...F.bold, fontSize: 20, letterSpacing: 2.6, color: OG.slate400, textTransform: "uppercase", marginTop: 8 }}>{kindLabel}</div>
    </div>
  );
}

export interface SealedImageProps {
  name: string;
  kindLabel: string;
  setCode: string | null;
  art: string | null;
  marketUsd: number | null;
  packCount: number | null;
  head: OgPrice;
  others: { country: Country; cents: number }[];
}

export function SealedImage(p: SealedImageProps) {
  const size = p.name.length > 60 ? 38 : p.name.length > 34 ? 46 : 56;
  const perPack =
    p.packCount && p.packCount > 1 && p.head.cents != null && p.head.kind !== "none"
      ? `${ogMoney(Math.round(p.head.cents / p.packCount), p.head.country)} a pack`
      : undefined;
  return (
    <Canvas padding="44px 48px">
      {p.art ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 470, height: 542, background: OG.white, borderRadius: 18, boxShadow: "0 18px 50px rgba(0,0,0,0.55)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" src={p.art} width={440} height={440} style={{ objectFit: "contain" }} />
        </div>
      ) : (
        <SealedPlate kindLabel={p.kindLabel} />
      )}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, marginLeft: 48 }}>
        <Lockup />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <Eyebrow size={20}>{[p.kindLabel, p.setCode].filter(Boolean).join(" · ")}</Eyebrow>
          <div style={{ display: "flex", ...F.display, fontSize: size, lineHeight: 1.04, color: OG.white, marginTop: 10, letterSpacing: -1 }}>{clip(p.name, 96)}</div>
        </div>
        <PriceBlock head={p.head} marketUsd={p.marketUsd} extra={perPack} others={p.others} />
      </div>
    </Canvas>
  );
}

// ── (d) A blog post ──────────────────────────────────────────────────────────
export function BlogImage({ title, arts, badge = "BLOG", footer = "Live prices from the OP Compare price guide" }: { title: string; arts: (string | null)[]; badge?: string; footer?: string }) {
  const cards = arts.filter((a): a is string => !!a).slice(0, 3);
  const size = title.length > 70 ? 46 : title.length > 48 ? 54 : 62;
  // Back-left, back-right, then the front card last so it sits on top.
  const fan = [
    { left: 20, top: 70, w: 230, h: 321, rot: -8 },
    { left: 250, top: 70, w: 230, h: 321, rot: 8 },
    { left: 130, top: 28, w: 250, h: 349, rot: 0 },
  ];
  const order = cards.length === 3 ? [1, 2, 0] : cards.length === 2 ? [0, 1] : [0];
  const slots = cards.length === 3 ? fan : cards.length === 2 ? [fan[0], { ...fan[1], left: 210 }] : [fan[2]];
  return (
    <Canvas
      padding="44px 48px"
      bg="radial-gradient(circle at 10% -10%, rgba(217,43,51,0.30) 0%, rgba(217,43,51,0) 50%), radial-gradient(circle at 95% 0%, rgba(245,197,66,0.12) 0%, rgba(245,197,66,0) 40%)"
    >
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: cards.length ? 600 : 1104 }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <Lockup />
          <div
            style={{
              display: "flex",
              marginLeft: 14,
              padding: "4px 12px",
              borderRadius: 6,
              background: "rgba(217,43,51,0.15)",
              border: "1.5px solid rgba(217,43,51,0.5)",
              ...F.bold,
              fontSize: 16,
              letterSpacing: 2,
              color: "#ff8a8f",
            }}
          >
            {badge}
          </div>
        </div>
        <div style={{ display: "flex", ...F.display, fontSize: size, lineHeight: 1.06, color: OG.white, letterSpacing: -1 }}>{clip(title, 110)}</div>
        <div style={{ display: "flex", ...F.semi, fontSize: 21, color: OG.straw }}>{footer}</div>
      </div>
      {cards.length ? (
        <div style={{ display: "flex", position: "relative", flex: 1 }}>
          {order.map((ci, i) => {
            const s = slots[i];
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={ci}
                alt=""
                src={cards[ci]}
                width={s.w}
                height={s.h}
                style={{ position: "absolute", left: s.left, top: s.top, borderRadius: 12, boxShadow: "0 14px 36px rgba(0,0,0,0.65)", transform: `rotate(${s.rot}deg)` }}
              />
            );
          })}
        </div>
      ) : null}
    </Canvas>
  );
}
