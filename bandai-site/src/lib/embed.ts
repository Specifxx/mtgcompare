// The free embeddable price badge (DECISIONS.md, "Free price widgets", 2026-11-02): a chrome-free HTML document a
// blog, store or community site drops into an <iframe>, plus one plain text link under it (the only part a search
// engine credits to us). Pure: tests/embed.test.ts. Read only from committed data through src/lib/data.ts.
import type { Market, Offer } from "./site-types";
import { MARKETS } from "./site-types";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** ?market=uk → "UK"; anything unknown → the US. */
export function marketParam(v: string | null | undefined): Market {
  const m = (v ?? "").toUpperCase() as Market;
  return MARKETS.includes(m) ? m : "US";
}

/** The cheapest in-stock store offer in a market: never TCGplayer, eBay, Amazon or a pre-order. */
export function badgeOffer(best: readonly Offer[], market: Market): Offer | null {
  let out: Offer | null = null;
  for (const o of best) {
    if (o.market !== market || !o.inStock || o.preorder || ["tcgplayer", "ebay", "amazon"].includes(o.source)) continue;
    if (!out || o.cents < out.cents) out = o;
  }
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
export function embedSnippet(siteUrl: string, siteName: string, slug: string, name: string, title: string): string {
  return `<iframe src="${siteUrl}/embed/card/${slug}" width="100%" height="130" style="border:0" loading="lazy" title="${title}"></iframe>\n<p style="font-size:12px;margin:2px 0 0"><a href="${siteUrl}/card/${slug}">${name} price on ${siteName}</a></p>`;
}

/** Plain-HTML store badge: no iframe, so the link sits on the store's own page. */
export function storeBadge(siteUrl: string, siteName: string, game: string): string {
  return `<a href="${siteUrl}/stores" style="display:inline-block;padding:6px 10px;border:1px solid #d6dae1;border-radius:8px;font:600 12px system-ui,sans-serif;color:#0f172a;text-decoration:none;background:#fff">${game} prices compared on ${siteName}</a>`;
}

/** The daily game's widget (2026-11-03): today's first pair, face up, prices hidden, one link to play. No script. */
export function dailyHtml(d: { site: string; game: string; n: number; a: { name: string; image: string | null }; b: { name: string; image: string | null }; href: string }): string {
  const card = (c: { name: string; image: string | null }) =>
    `<div class="k">${c.image ? `<img src="${esc(c.image)}" alt="${esc(c.name)}" width="84" height="117" loading="lazy" decoding="async">` : `<div class="x"></div>`}<div class="kn" title="${esc(c.name)}">${esc(c.name)}</div></div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(d.game)} Price Duel</title>
<style>*{box-sizing:border-box;margin:0;padding:0}html,body{background:transparent;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}a{text-decoration:none;color:inherit}
.c{display:block;padding:12px;border:1px solid #d6dae1;border-radius:12px;background:#fff;color:#0f172a;text-align:center}.c:hover{border-color:#2563eb}
.h{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#64748b}.q{font-size:17px;font-weight:800;margin-top:2px}
.r{display:flex;justify-content:center;align-items:center;gap:10px;margin-top:8px}.k{width:110px}.k img,.x{width:84px;height:117px;border-radius:6px;object-fit:contain;background:#f1f5f9;display:block;margin:0 auto}
.kn{font-size:11px;font-weight:600;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.v{font-weight:900;color:#94a3b8}
.t{display:inline-block;margin-top:10px;font-weight:700;font-size:13px;padding:8px 12px;border-radius:8px;background:#2563eb;color:#fff}.f{margin-top:4px;text-align:right;font-size:10px;color:#94a3b8}</style></head>
<body><a class="c" href="${esc(d.href)}" target="_blank" rel="noopener"><div class="h">${esc(d.game)} Price Duel #${d.n}</div><div class="q">Which is worth more?</div><div class="r">${card(d.a)}<div class="v">vs</div>${card(d.b)}</div><span class="t">Play today&rsquo;s 10 pairs &rarr;</span></a><div class="f">Daily game by ${esc(d.site)}</div></body></html>`;
}

/** The snippet for the daily widget: the iframe, then one plain text link. */
export function dailySnippet(siteUrl: string, siteName: string, game: string): string {
  return `<iframe src="${siteUrl}/embed/daily" width="100%" height="270" style="border:0" loading="lazy" title="${game} Price Duel"></iframe>\n<p style="font-size:12px;margin:2px 0 0"><a href="${siteUrl}/daily">Daily ${game} card price game on ${siteName}</a></p>`;
}

/** Seconds until the next midnight UTC, when the puzzle changes (at least five minutes). */
export const secondsToUtcMidnight = (now: Date) => Math.max(300, Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()) / 1000));
