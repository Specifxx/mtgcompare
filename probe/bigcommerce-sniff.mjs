// Sniff 2: find game category URLs via each store's sitemap and keep the
// stripped HTML of a few category pages per store, so the right parser can be
// written offline. Identifies itself as our bot, honours robots.txt, one request
// at a time with a delay.
import { writeFileSync, mkdirSync } from "node:fs";
const UA = "Mozilla/5.0 (compatible; CompareEmpireBot/1.0; +https://mtgcompare.app/about)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STORES = [
  { key: "miniaturemarket", base: "https://www.miniaturemarket.com", fixed: ["/trading-card-games/magic-the-gathering.html", "/trading-card/riftbound", "/trading-card-games/magic-the-gathering.html?p=2"], keep: 2000000 },
  { key: "gamegoblins", base: "https://www.gamegoblins.com", fixed: [] },
  { key: "magicmadhouse", base: "https://www.magicmadhouse.co.uk", fixed: [] },
  { key: "grandjgames", base: "https://grandjgames.com", fixed: [] },
  { key: "gamenerdz", base: "https://www.gamenerdz.com", fixed: [] },
];
const KEY = /magic|mtg|pokemon|riftbound/i;
async function get(url, accept = "text/html") {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: accept }, redirect: "follow", signal: AbortSignal.timeout(45000) });
    return { status: res.status, text: await res.text() };
  } catch (e) { return { status: 0, text: "", err: String(e) }; }
}
async function robots(base) {
  const r = await get(`${base}/robots.txt`, "text/plain");
  const dis = [];
  let star = false;
  for (const line of r.text.split("\n")) {
    const l = line.trim();
    if (/^user-agent:/i.test(l)) star = /^user-agent:\s*\*/i.test(l);
    else if (star && /^disallow:/i.test(l)) { const p = l.replace(/^disallow:\s*/i, "").trim(); if (p) dis.push(p); }
  }
  // Same semantics as the sites' own robotsAllows: a plain prefix match on the rule as written (a wildcard rule never matches, fails open).
  return (path) => !dis.some((d) => path.startsWith(d));
}
function strip(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<svg[\s\S]*?<\/svg>/gi, "").replace(/\s+\n/g, "\n");
}
async function sitemapCats(base, allowed) {
  const urls = new Set();
  for (const sm of ["/xmlsitemap.php", "/sitemap.xml", "/sitemap_index.xml"]) {
    if (!allowed(sm)) continue;
    const r = await get(`${base}${sm}`, "application/xml,text/xml,*/*");
    await sleep(1200);
    if (r.status !== 200) continue;
    const locs = [...r.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim().replace(/&amp;/g, "&"));
    const subs = locs.filter((l) => /xmlsitemap\.php\?type=categor|categor|sitemap/i.test(l) && !/product|brand|blog|image/i.test(l)).slice(0, 4);
    for (const l of locs) if (KEY.test(l) && !/\.(jpg|png|webp)$/i.test(l)) urls.add(l);
    for (const s of subs) {
      const r2 = await get(s, "application/xml,text/xml,*/*");
      await sleep(1200);
      for (const m of r2.text.matchAll(/<loc>([^<]+)<\/loc>/g)) if (KEY.test(m[1]) && !/xmlsitemap\.php/.test(m[1])) urls.add(m[1].trim().replace(/&amp;/g, "&"));
    }
    if (urls.size) break;
    if (sm === "/xmlsitemap.php") {
      // BigCommerce: the index may only list product sitemaps; ask for the categories one by name.
      const r3 = await get(`${base}/xmlsitemap.php?type=categories&page=1`, "application/xml,text/xml,*/*");
      await sleep(1200);
      for (const m of r3.text.matchAll(/<loc>([^<]+)<\/loc>/g)) if (KEY.test(m[1])) urls.add(m[1].trim().replace(/&amp;/g, "&"));
      if (urls.size) break;
    }
  }
  return [...urls];
}
mkdirSync("probe/html", { recursive: true });
const out = [];
for (const s of STORES) {
  const r = { key: s.key, base: s.base, sitemapCats: [], pages: [] };
  const allowed = await robots(s.base);
  const cats = await sitemapCats(s.base, allowed);
  r.sitemapCats = cats.slice(0, 40);
  const pick = [...s.fixed, ...cats.filter((u) => /sealed|booster|magic|pokemon|riftbound/i.test(u) && !/single/i.test(u)).map((u) => u.replace(/^https?:\/\/[^/]+/, "")).slice(0, 4)].slice(0, 5);
  let n = 0;
  for (const path of pick) {
    if (!allowed(path)) { r.pages.push({ path, robots: "disallowed" }); continue; }
    await sleep(1500);
    const sep = path.includes("?") ? "&" : "?";
    const p = await get(`${s.base}${path}${sep}limit=100&product_list_limit=100`);
    const html = p.text;
    r.pages.push({
      path, status: p.status, len: html.length,
      articleCard: (html.match(/<article class="card\b/g) ?? []).length,
      liProduct: (html.match(/<li class="product\b/g) ?? []).length,
      productItem: (html.match(/class="product-item\b/g) ?? []).length,
      dataPrice: (html.match(/data-product-price-with/g) ?? []).length,
      priceBox: (html.match(/price-box|data-price-amount/g) ?? []).length,
      dollar: (html.match(/[$£]\s?\d+\.\d\d/g) ?? []).length,
    });
    if (p.status === 200) {
      const st = strip(html);
      const at = Math.max(0, st.search(/<article class="card\b|<ol class="products|class="product-item|<main\b/));
      writeFileSync(`probe/html/${s.key}-${n++}.html`, st.slice(at, at + (s.keep ?? 150000)));
    }
  }
  out.push(r);
  console.log(JSON.stringify(r));
}
writeFileSync("probe/bigcommerce-sniff2.json", JSON.stringify(out, null, 1));
