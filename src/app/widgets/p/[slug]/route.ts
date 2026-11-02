import { productPage } from "@/lib/data";
import { money } from "@/lib/format";
import { REGIONS } from "@/lib/regions";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { badgeHtml, badgeOffer, regionParam } from "@/lib/embed";

// The embeddable sealed price badge (DECISIONS.md, "Free price widgets", 2026-11-02). A route handler, so it escapes
// the root layout and can be framed (next.config.js, /widgets/:path+). Reads only the public data files through
// productPage; it reads ?region, so its only cache is the CDN header (a day, like every page here).
export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9-]{1,160}$/;

export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const region = regionParam(new URL(req.url).searchParams.get("region"));
  const r = REGIONS[region];
  const headers = { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex" };
  const p = SLUG.test(params.slug) ? await productPage(params.slug, r.market).catch(() => null) : null;
  if (!p) {
    const body = badgeHtml({ site: SITE_NAME, name: "Not found", meta: "Search every Magic sealed product", price: null, sub: "", href: `${SITE_URL}/?utm_source=embed`, image: null });
    return new Response(body, { status: 404, headers: { ...headers, "Cache-Control": "public, s-maxage=21600" } });
  }
  const o = badgeOffer(p.offers);
  const inStock = p.offers.filter((x) => x.inStock && !x.marketplace).length;
  const body = badgeHtml({
    site: SITE_NAME,
    name: p.name,
    meta: [p.productType, p.setCode?.toUpperCase()].filter(Boolean).join(" · "),
    price: o ? `from ${money(o.priceCents, r.market)}` : null,
    sub: o ? `${inStock} ${inStock === 1 ? "store" : "stores"} in stock · ${r.name}` : `not in stock at a store in ${r.inName}`,
    href: `${SITE_URL}/${region}/p/${p.slug}?utm_source=embed&utm_medium=widget`,
    image: p.imageUrl ?? null,
  });
  return new Response(body, { headers: { ...headers, "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" } });
}
