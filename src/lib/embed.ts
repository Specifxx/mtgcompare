// The free embeddable price badge (DECISIONS.md, "Free price widgets", 2026-11-02): a chrome-free HTML document a
// blog, store or community site drops into an <iframe>, plus one plain text link under it (the only part a search
// engine credits to us). Pure: tests/embed.test.ts. Reads only the public data files through src/lib/data.ts (productPage).
import { REGIONS, X_DEFAULT_REGION, type Region } from "./regions";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** ?region=uk → "uk"; anything unknown → the US (X_DEFAULT_REGION). */
export function regionParam(v: string | null | undefined): Region {
  const r = (v ?? "").toLowerCase() as Region;
  return r in REGIONS ? r : X_DEFAULT_REGION;
}

/** The cheapest in-stock independent store offer (never a marketplace such as TCGplayer). */
export function badgeOffer<T extends { inStock: boolean; marketplace: boolean; priceCents: number }>(offers: readonly T[]): T | null {
  let out: T | null = null;
  for (const o of offers) if (o.inStock && !o.marketplace && (!out || o.priceCents < out.priceCents)) out = o;
  return out;
}

export interface Badge {
  site: string;
  name: string;
  meta: string;
  price: string | null;
  sub: string;
  href: string;
  image: string | null;
}

/** The widget's whole HTML. Inline CSS, no script, noindex. */
export function badgeHtml(b: Badge): string {
  const img = b.image ? `<img class="i" src="${esc(b.image)}" alt="${esc(b.name)}" width="48" height="67" loading="lazy" decoding="async">` : `<div class="i"></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(b.site)} price</title>
<style>*{box-sizing:border-box;margin:0;padding:0}html,body{background:transparent;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}a{text-decoration:none;color:inherit}
.c{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid #d6dae1;border-radius:12px;background:#fff;color:#0f172a}.c:hover{border-color:#2563eb}
.i{width:48px;height:67px;border-radius:6px;object-fit:contain;flex:none;background:#f1f5f9}.b{min-width:0;flex:1}
.n{font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.m{font-size:11px;color:#64748b;margin-top:1px}
.p{font-size:19px;font-weight:800;color:#047857;margin-top:4px}.s{font-size:11px;color:#64748b}
.t{flex:none;font-weight:700;font-size:12px;padding:7px 10px;border-radius:8px;background:#eff6ff;color:#1d4ed8}.f{margin-top:4px;text-align:right;font-size:10px;color:#94a3b8}</style></head>
<body><a class="c" href="${esc(b.href)}" target="_blank" rel="noopener">${img}<div class="b"><div class="n" title="${esc(b.name)}">${esc(b.name)}</div><div class="m">${esc(b.meta)}</div><div class="p">${b.price ? esc(b.price) : "—"}</div><div class="s">${esc(b.sub)}</div></div><div class="t">Compare&nbsp;→</div></a><div class="f">Live prices by ${esc(b.site)}</div></body></html>`;
}

/** The snippet a site owner copies: the iframe, then one plain text link (the part search engines credit). */
export function embedSnippet(siteUrl: string, siteName: string, region: Region, slug: string, name: string): string {
  return `<iframe src="${siteUrl}/widgets/p/${slug}?region=${region}" width="100%" height="130" style="border:0" loading="lazy" title="${name} price"></iframe>\n<p style="font-size:12px;margin:2px 0 0"><a href="${siteUrl}/${region}/p/${slug}">${name} price on ${siteName}</a></p>`;
}

/** Plain-HTML store badge: no iframe, so the link sits on the store's own page. */
export function storeBadge(siteUrl: string, siteName: string, game: string): string {
  return `<a href="${siteUrl}/us/stores" style="display:inline-block;padding:6px 10px;border:1px solid #d6dae1;border-radius:8px;font:600 12px system-ui,sans-serif;color:#0f172a;text-decoration:none;background:#fff">${game} prices compared on ${siteName}</a>`;
}
