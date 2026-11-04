// Standalone sniff: does each BigCommerce store render a Stencil product grid
// (article.card + data-product-price) on its game category pages, in which currency?
import { writeFileSync } from "node:fs";
const UA = "Mozilla/5.0 (compatible; CompareEmpireBot/1.0; +https://mtgcompare.app/about)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STORES = [
  { name: "Star City Games", base: "https://starcitygames.com", cur: "USD" },
  { name: "Miniature Market", base: "https://www.miniaturemarket.com", cur: "USD" },
  { name: "Game Nerdz", base: "https://www.gamenerdz.com", cur: "USD" },
  { name: "Game Goblins", base: "https://www.gamegoblins.com", cur: "USD" },
  { name: "ToyWiz", base: "https://toywiz.com", cur: "USD" },
  { name: "Magic Madhouse", base: "https://www.magicmadhouse.co.uk", cur: "GBP" },
  { name: "Grand J Games", base: "https://grandjgames.com", cur: "AUD" },
  { name: "Troll and Toad", base: "https://www.trollandtoad.com", cur: "USD" },
  { name: "Card Kingdom", base: "https://www.cardkingdom.com", cur: "USD" },
  { name: "Hobby Master NZ", base: "https://www.hobbymaster.co.nz", cur: "NZD" },
  { name: "Good Games AU", base: "https://www.goodgames.com.au", cur: "AUD" },
  { name: "Gameology AU", base: "https://www.gameology.com.au", cur: "AUD" },
  { name: "Board Game Bliss CA", base: "https://www.boardgamebliss.com", cur: "CAD" },
  { name: "401 Games CA", base: "https://store.401games.ca", cur: "CAD" },
  { name: "Chimera Hobby", base: "https://www.chimerahobby.com", cur: "USD" },
  { name: "Mox Boarding House", base: "https://www.moxboardinghouse.com", cur: "USD" },
  { name: "Hareruya EN", base: "https://www.hareruyamtg.com", cur: "USD" },
];
const KEY = /magic|mtg|pokemon|pok%C3%A9mon|riftbound|sealed|booster/i;
async function get(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(45000) });
    const text = await res.text();
    return { status: res.status, text, url: res.url };
  } catch (e) { return { status: 0, text: "", err: String(e) }; }
}
function grid(html, cur) {
  const cards = (html.match(/<article class="card\b/g) ?? []).length;
  const prices = [...html.matchAll(/data-product-price-with(?:out)?-tax[^>]*>([^<]+)</g)].map((m) => m[1].trim());
  const titles = [...html.matchAll(/<h3 class="card-title">\s*<a\b[^>]*>([^<]+)<\/a>/g)].map((m) => m[1].trim());
  const li = (html.match(/<li class="product"/g) ?? []).length;
  const ld = /"@type":\s*"Product"/.test(html);
  return { cards, li, ldProduct: ld, prices: prices.slice(0, 4), titles: titles.slice(0, 4), priceN: prices.length, curHits: (html.match(new RegExp(cur, "g")) ?? []).length };
}
const out = [];
for (const s of STORES) {
  const r = { ...s, robots: "", home: 0, platform: "", cats: [] };
  const rb = await get(`${s.base}/robots.txt`);
  r.robots = rb.text.split("\n").filter((l) => /^(disallow|user-agent)/i.test(l)).slice(0, 25).join(" | ");
  await sleep(1500);
  const home = await get(`${s.base}/`);
  r.home = home.status;
  r.cf = /cf-chl|challenge-platform|Just a moment|Attention Required/i.test(home.text);
  r.platform = /bigcommerce|stencil|cdn11\.bigcommerce/i.test(home.text) ? "bigcommerce" : /cdn\.shopify/i.test(home.text) ? "shopify" : /wp-content/i.test(home.text) ? "wordpress" : /Magento|mage\//i.test(home.text) ? "magento" : "?";
  const hrefs = new Set();
  for (const m of home.text.matchAll(/href="([^"#?]+)"/g)) {
    let h = m[1];
    if (h.startsWith(s.base)) h = h.slice(s.base.length);
    if (!h.startsWith("/") || h.length < 4) continue;
    if (KEY.test(h) && !/\.(png|jpg|css|js|svg)$/.test(h)) hrefs.add(h);
  }
  const cand = [...hrefs].slice(0, 8);
  r.candidates = [...hrefs].length;
  for (const path of cand) {
    await sleep(1500);
    const p = await get(`${s.base}${path}?limit=100`);
    r.cats.push({ path, status: p.status, len: p.text.length, ...grid(p.text, s.cur) });
  }
  out.push(r);
  console.log(JSON.stringify(r));
}
writeFileSync("probe/bigcommerce-sniff.json", JSON.stringify(out, null, 1));
// run 1793770025
