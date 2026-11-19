// The Hot 100's share card (owner, 2026-11-20: Reddit snapshot posts work because of the link thumbnail). A Reddit link post
// shows only its title and this picture, so the picture is the chart itself: the #1 riser large with its photo, the next five beside it with their
// photos, each with its real 7-day rise and price. Every figure comes from lib/hot100.ts, the same rows the page lists.
//
// Photos are fetched when the card is drawn (about once a day per region: the route is CDN-cached), each with a timeout, and
// only kept when they arrive as PNG or JPEG (satori draws nothing else). A photo that fails draws a plain tile, never a broken card.
import { ImageResponse } from "next/og";
import { BRAND, BrandHeader, INK, LINE, MUTED, OG_SIZE, ogFonts } from "@/lib/og-card";

const UP = "#147638";
const UP_SOFT = "#e2f5e8";

export interface HotCardRow {
  rank: number;
  name: string;
  imageUrl: string | null;
  pct: number;
  /** Formatted prices, a week ago and now ("$8.47", "$12.00"). */
  before: string;
  after: string;
  stores: number;
}

/** A smaller copy of a product photo: TCGplayer's 200-pixel image, a Shopify file at 300 pixels wide. Other hosts as given. */
export function thumbUrl(url: string): string {
  if (/tcgplayer-cdn\.tcgplayer\.com\/product\//.test(url)) return url.replace(/_in_\d+x\d+\.(jpg|png)$/, "_200w.jpg");
  if (/cdn\.shopify\.com\//.test(url)) return url + (url.includes("?") ? "&" : "?") + "width=300";
  return url;
}

/** The photo as a data URI, or null: a timeout, an error or a format satori cannot draw (WebP, AVIF, SVG) is a plain tile. */
export async function photoData(url: string | null, timeoutMs = 6000): Promise<string | null> {
  if (url && /^data:image\/(png|jpeg);base64,/.test(url)) return url; // a fixture's own photo
  if (!url || !/^https:\/\//.test(url)) return null;
  try {
    const res = await fetch(thumbUrl(url), { headers: { accept: "image/png,image/jpeg;q=0.9" }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (type !== "image/png" && type !== "image/jpeg") return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 1_500_000) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function Photo({ src, size, radius }: { src: string | null; size: number; radius: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: size, height: size, borderRadius: radius, background: "#ffffff", border: `2px solid ${LINE}`, flexShrink: 0, overflow: "hidden" }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={size - 12} height={size - 12} style={{ width: size - 12, height: size - 12, objectFit: "contain" }} />
      ) : (
        <div style={{ display: "flex", width: size / 2, height: size / 2, borderRadius: radius / 2, background: "#efeee9" }} />
      )}
    </div>
  );
}

export interface HotCard {
  /** "United States" */
  region: string;
  /** "Magic sealed" */
  noun: string;
  /** "19 Nov 2026" */
  through: string;
  /** How many products rose this week (the chart's length). */
  total: number;
  /** "mtgcompare.app/us/hot-100" */
  path: string;
  /** "US stores" */
  where: string;
  rows: HotCardRow[];
}

/** The card as a PNG response: photos fetched first, then drawn. */
export async function hotCard(c: HotCard): Promise<ImageResponse> {
  const rows = c.rows.slice(0, 6);
  const photos = await Promise.all(rows.map((r) => photoData(r.imageUrl)));
  const [top, ...rest] = rows;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#f6f6f3",
          backgroundImage: "radial-gradient(circle at 0% 0%, rgba(210,48,10,0.12), rgba(210,48,10,0) 45%), radial-gradient(circle at 100% 0%, rgba(255,203,5,0.18), rgba(255,203,5,0) 40%)",
          padding: "40px 52px 34px",
          fontFamily: "Bricolage",
          color: INK,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <BrandHeader tag={c.region} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", fontSize: 40, fontWeight: 800, letterSpacing: -1, color: BRAND }}>{`Hot ${c.total}`}</div>
            <div style={{ display: "flex", fontSize: 20, fontWeight: 600, color: MUTED }}>{`${c.noun} · week to ${c.through}`}</div>
          </div>
        </div>
        {top ? (
          <div style={{ display: "flex", gap: 28, marginTop: 22, flexGrow: 1 }}>
            <div style={{ display: "flex", flexDirection: "column", width: 270, gap: 8 }}>
              <div style={{ display: "flex", position: "relative" }}>
                <Photo src={photos[0]} size={240} radius={24} />
                <div style={{ display: "flex", position: "absolute", top: 12, left: 12, padding: "4px 14px", borderRadius: 999, background: INK, color: "#ffffff", fontSize: 26, fontWeight: 800 }}>#1</div>
              </div>
              <div style={{ display: "flex", fontSize: 21, fontWeight: 600, lineHeight: 1.15 }}>{cut(top.name, 46)}</div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                <div style={{ display: "flex", padding: "2px 14px", borderRadius: 999, background: UP_SOFT, fontSize: 38, fontWeight: 800, color: UP }}>{`+${top.pct}%`}</div>
                <div style={{ display: "flex", fontSize: 20, fontWeight: 600, color: MUTED }}>{`${top.before} → ${top.after}`}</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9, flexGrow: 1 }}>
              {rest.map((r, i) => (
                <div key={r.rank} style={{ display: "flex", alignItems: "center", gap: 14, padding: "7px 16px 7px 10px", borderRadius: 16, background: "#ffffff", border: `2px solid ${LINE}` }}>
                  <div style={{ display: "flex", width: 44, justifyContent: "center", fontSize: 24, fontWeight: 800, color: MUTED }}>{`#${r.rank}`}</div>
                  <Photo src={photos[i + 1]} size={58} radius={10} />
                  <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", fontSize: 21, fontWeight: 600 }}>{cut(r.name, 40)}</div>
                    <div style={{ display: "flex", fontSize: 17, fontWeight: 600, color: MUTED }}>{`${r.before} → ${r.after} · ${r.stores} stores in stock`}</div>
                  </div>
                  <div style={{ display: "flex", padding: "4px 12px", borderRadius: 999, background: UP_SOFT, color: UP, fontSize: 24, fontWeight: 800 }}>{`+${r.pct}%`}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexGrow: 1, alignItems: "center", fontSize: 48, fontWeight: 800 }}>{`This week's ${c.noun} risers`}</div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 18, fontWeight: 600, color: MUTED }}>
          <div style={{ display: "flex" }}>{`Cheapest in-stock price at ${c.where}, change over 7 days. Checked daily.`}</div>
          <div style={{ display: "flex", color: INK }}>{c.path}</div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: [...ogFonts()] },
  );
}
