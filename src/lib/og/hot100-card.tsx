// The Hot 100's share card (owner, 2026-11-20: Reddit snapshot posts work because of the link thumbnail). A Reddit link post
// shows only its title and this picture, so the picture is the chart itself: since 2026-11-20 (owner, from a Reddit reply asking for the
// biggest drops) the week's three biggest rises beside its three biggest drops, each with its photo, real 7-day change and prices. Every figure comes from lib/hot100.ts, the same rows the page lists.
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
  /** The week's biggest rises, biggest first (the chart's top). */
  rows: HotCardRow[];
  /** The week's biggest drops, biggest fall first (lib/hot100.ts hotDrops); pct is negative. */
  drops: HotCardRow[];
}

const DOWN = "#b42318";
const DOWN_SOFT = "#fde8e6";
const sign = (pct: number) => (pct > 0 ? `+${pct}%` : `−${Math.abs(pct)}%`);

/** One mover: photo, name, the week's price change and its two prices. */
function MoveRow({ r, photo, up }: { r: HotCardRow; photo: string | null; up: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 14px 8px 8px", borderRadius: 16, background: "#ffffff", border: `2px solid ${LINE}`, height: 122 }}>
      <Photo src={photo} size={104} radius={12} />
      <div style={{ display: "flex", flexDirection: "column", width: 382, gap: 6 }}>
        <div style={{ display: "flex", width: 382, fontSize: 21, fontWeight: 600, lineHeight: 1.15 }}>{cut(r.name, 62)}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", padding: "1px 12px", borderRadius: 999, background: up ? UP_SOFT : DOWN_SOFT, color: up ? UP : DOWN, fontSize: 30, fontWeight: 800 }}>{sign(r.pct)}</div>
          <div style={{ display: "flex", fontSize: 19, fontWeight: 600, color: MUTED }}>{`${r.before} → ${r.after}`}</div>
        </div>
      </div>
    </div>
  );
}

function Column({ title, rows, photos, up, empty }: { title: string; rows: HotCardRow[]; photos: (string | null)[]; up: boolean; empty: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: 538, gap: 10 }}>
      <div style={{ display: "flex", fontSize: 27, fontWeight: 800, color: up ? UP : DOWN }}>{title}</div>
      {rows.length ? (
        rows.map((r, i) => <MoveRow key={`${r.rank}-${r.name}`} r={r} photo={photos[i]} up={up} />)
      ) : (
        <div style={{ display: "flex", fontSize: 22, fontWeight: 600, color: MUTED }}>{empty}</div>
      )}
    </div>
  );
}

/** The card as a PNG response: photos fetched first, then drawn. Half the week's biggest rises, half its biggest drops (owner, 2026-11-20). */
export async function hotCard(c: HotCard): Promise<ImageResponse> {
  const ups = c.rows.slice(0, 3);
  const downs = c.drops.slice(0, 3);
  const photos = await Promise.all([...ups, ...downs].map((r) => photoData(r.imageUrl)));
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
          padding: "34px 52px 28px",
          fontFamily: "Bricolage",
          color: INK,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <BrandHeader tag={c.region} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", fontSize: 36, fontWeight: 800, letterSpacing: -1, color: BRAND }}>{c.total ? `Hot ${c.total} · rises & drops` : "Rises & drops"}</div>
            <div style={{ display: "flex", fontSize: 20, fontWeight: 600, color: MUTED }}>{`${c.noun} · 7 days to ${c.through}`}</div>
          </div>
        </div>
        {ups.length || downs.length ? (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, flexGrow: 1 }}>
            <Column title="Biggest rises" rows={ups} photos={photos.slice(0, ups.length)} up empty="No rises of 1% or more this week." />
            <Column title="Biggest drops" rows={downs} photos={photos.slice(ups.length)} up={false} empty="No drops of 1% or more this week." />
          </div>
        ) : (
          <div style={{ display: "flex", flexGrow: 1, alignItems: "center", fontSize: 48, fontWeight: 800 }}>{`This week's ${c.noun} rises and drops`}</div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 18, fontWeight: 600, color: MUTED }}>
          <div style={{ display: "flex" }}>{`Cheapest in-stock price at ${c.where}, change over 7 days. Checked daily.`}</div>
          <div style={{ display: "flex", color: INK }}>{c.path}</div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: [...ogFonts()] },
  );
}
