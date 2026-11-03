// The card page's share image (owner, 2026-11-02, word of mouth): the card,
// and the real price gap in the US (the page's baseline market) — cheapest
// in-stock price, the dearest, and how much less — from lib/share.ts. With no
// spread it shows the TCGplayer market price. Drawn on first request, kept a
// day like the page (empty generateStaticParams: nothing drawn at build).
import { ImageResponse } from "next/og";
import { SITE } from "@/site.config";
import { priceOf, productBySlug, refCents, setById } from "@/lib/data";
import { imageAt } from "@/lib/image";
import { money } from "@/lib/format";
import { shortName } from "@/lib/names";
import { priceGap, storeName } from "@/lib/share";

export const revalidate = 86400;
export const generateStaticParams = () => [];
export const alt = `Price comparison on ${SITE.name}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image({ params }: { params: { slug: string } }) {
  const p = productBySlug(params.slug);
  const t = SITE.theme;
  const name = p ? shortName(p.name) : SITE.name;
  const gap = p ? priceGap(priceOf(p.id).offers, "US") : null;
  const ref = p ? refCents(p.id) : null;
  const img = p ? imageAt(p.image, "400w") : null;
  const sub = p ? [setById(p.setId)?.name, p.number].filter(Boolean).join(" · ") : SITE.tagline;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: t.pageDark, color: "#fff", padding: "48px 64px", fontFamily: "sans-serif" }}>
        {img && (
          <div style={{ display: "flex", width: 380, height: 534, marginRight: 56, alignItems: "center", justifyContent: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img} width={380} height={532} style={{ objectFit: "contain", borderRadius: 18 }} alt="" />
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
          <div style={{ fontSize: 30, color: t.brandLight, fontWeight: 700 }}>{SITE.name}</div>
          <div style={{ fontSize: name.length > 34 ? 50 : 62, fontWeight: 800, lineHeight: 1.08, marginTop: 14 }}>{name}</div>
          {sub && <div style={{ fontSize: 28, color: "#a9b4cc", marginTop: 10 }}>{sub}</div>}
          {gap ? (
            <div style={{ display: "flex", flexDirection: "column", marginTop: 34 }}>
              <div style={{ display: "flex", alignItems: "baseline" }}>
                <span style={{ fontSize: 76, fontWeight: 800, color: "#4ade80" }}>{money(gap.low.cents, gap.low.currency)}</span>
                <span style={{ fontSize: 30, color: "#cfd6e6", marginLeft: 18 }}>at {storeName(gap.low)}</span>
              </div>
              <div style={{ fontSize: 34, color: "#cfd6e6", marginTop: 6 }}>
                {`up to ${money(gap.high.cents, gap.high.currency)} elsewhere`}
              </div>
              <div style={{ display: "flex", marginTop: 22 }}>
                <span style={{ fontSize: 34, fontWeight: 800, background: t.accent, color: "#fff", padding: "8px 20px", borderRadius: 12 }}>{`${gap.pct}% less · ${gap.sellers} sellers compared`}</span>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", marginTop: 34 }}>
              <span style={{ fontSize: 72, fontWeight: 800, color: "#4ade80" }}>{ref ? money(ref) : "Compare prices"}</span>
              <span style={{ fontSize: 30, color: "#cfd6e6", marginTop: 6 }}>{ref ? "TCGplayer market · every store compared" : `TCGplayer, eBay and ${SITE.gameShort} stores`}</span>
            </div>
          )}
        </div>
      </div>
    ),
    { ...size, headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
  );
}
