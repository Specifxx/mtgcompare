// Shared shell of the embeddable widgets (/embed/*): one small self-contained
// HTML document, no script, no tracking, dark-safe, with a link back to the page.
import { SITE_NAME } from "./site";

export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function embedPage(title: string, body: string, href: string): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>:root{color-scheme:light dark;--bg:#fff;--fg:#1c1730;--mut:#6b6580;--ac:#6b3fa0;--br:#b08d3c}@media(prefers-color-scheme:dark){:root{--bg:#17122a;--fg:#f3e9cf;--mut:#a9a2c0;--ac:#c4a3f0}}body{margin:0;padding:12px;background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,sans-serif;border:1px solid var(--br);border-radius:8px}a{color:var(--ac);text-decoration:none}.big{font-size:26px;font-weight:800}.mut{color:var(--mut);font-size:12px}</style></head><body>${body}<p class="mut"><a href="${esc(href)}" target="_blank" rel="noopener">${esc(SITE_NAME)}</a></p></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600", "Content-Security-Policy": "frame-ancestors *", "X-Robots-Tag": "noindex" } });
}
