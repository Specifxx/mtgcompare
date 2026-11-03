import { SITE } from "@/site.config";
import { SITE_URL } from "@/lib/site";
import { productBySlug, refCents, setById, summaryOf } from "@/lib/data";
import { money } from "@/lib/format";
import { MARKET_LABEL } from "@/lib/site-types";
import { badgeHtml, badgeOffer, marketParam } from "@/lib/embed";
import { shortName } from "@/lib/names";

// The embeddable price badge (DECISIONS.md, "Free price widgets", 2026-11-02). A route handler, so it escapes the
// root layout; it reads ?market, so its only cache is the CDN header (a day, like every page here).
export const revalidate = 86400;

export function GET(req: Request, { params }: { params: { slug: string } }) {
  const market = marketParam(new URL(req.url).searchParams.get("market"));
  const p = productBySlug(params.slug);
  const headers = { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex" };
  if (!p) {
    const body = badgeHtml({ site: SITE.name, name: "Not found", meta: `Search every ${SITE.gameShort} card`, price: null, sub: "", href: `${SITE_URL}/?utm_source=embed`, image: null });
    return new Response(body, { status: 404, headers: { ...headers, "Cache-Control": "public, s-maxage=300" } });
  }
  const s = summaryOf(p.id);
  const o = badgeOffer(s.best, market);
  const ref = refCents(p.id);
  const set = setById(p.setId);
  const body = badgeHtml({
    site: SITE.name,
    name: shortName(p.name),
    meta: [set?.name, p.number].filter(Boolean).join(" · "),
    price: o ? `from ${money(o.cents, o.currency)}` : ref != null ? money(ref) : null,
    sub: o ? `cheapest in-stock store · ${MARKET_LABEL[market]}` : ref != null ? "TCGplayer market price" : "no price yet",
    href: `${SITE_URL}/card/${p.slug}?utm_source=embed&utm_medium=widget`,
    image: p.image ?? null,
  });
  return new Response(body, { headers: { ...headers, "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" } });
}
