// Sealed sports card store probe (research only; never touches data/ or main).
// For each candidate host: is it Shopify, what currency, which collections are
// sports, and how many sealed sports products (hobby, blaster, mega, hanger,
// cello, value, jumbo, case...) it lists. Each product gets a rough key (year +
// product words + box type) so summarize.mjs can count boxes 2+ shops sell.
// Runs one shop at a time per runner (two runners: two shops at a time), ~1 request a second.
import fs from "node:fs";

const SHARD = Number(process.env.SHARD ?? 0);
const SHARDS = Number(process.env.SHARDS ?? 1);
const UA = "Mozilla/5.0 (compatible; CompareEmpireProbe/1.0; +https://compareempire.com)";
const SPORT_COLL = /(sport|baseball|basketball|football|soccer|hockey|nba|nfl|mlb|nhl|ufc|wwe|wrestling|f1|formula|nrl|afl|premier|uefa|golf|cricket|rugby|racing|topps|panini|upper-?deck|bowman|donruss|prizm|futera|hobby-?box|blaster|wax)/i;
const SPORT = /\b(baseball|basketball|football|soccer|hockey|nba|nfl|mlb|nhl|ufc|wwe|aew|wrestling|f1|formula 1|formula one|nrl|afl|premier league|uefa|champions league|mls|wnba|golf|tennis|cricket|rugby|nascar|indycar|motogp|olympics?|euro 20\d\d|world cup|bundesliga|la liga|serie a)\b/i;
const MAKER = /\b(topps|panini|upper deck|bowman|donruss|prizm|optic|mosaic|select|leaf|sage|onit|futera|tap ?n ?play|parkside|wild card|fanatics|immaculate|national treasures|flawless|contenders|chronicles|score|absolute|spectra|obsidian|stadium club|finest|heritage|allen ?& ?ginter|gypsy queen|merlin|sp authentic|o-?pee-?chee|opc|young guns|series [12]|ice|artifacts)\b/i;
const SEALED = /\b(hobby|blaster|mega|hanger|cello|fat pack|value (box|pack)|jumbo|retail|gravity feed|tin|choice|fotl|first off the line|breaker'?s delight|h2|lite|sapphire|monster box|super box|collector'?s? box|booster box|box|boxes|case|pack|packs)\b/i;
const NOT = /\b(breaks?|spot|spots|random (team|division|serial)|pick your|pyt|personal break|single|singles|psa|bgs|sgc|cgc|graded|slab|lot of|lots|auto(graph)?ed? card|#\d+|(?<!\d)\/\d{1,4}\b|sleeves?|top ?loaders?|binder|magnetic|one ?touch|display case|storage|pokemon|pokémon|magic|yu-?gi-?oh|one piece|lorcana|digimon|dragon ball|flesh and blood|star wars|marvel|disney|garbage pail|empty)\b/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, redirect: "follow", signal: AbortSignal.timeout(25_000) });
      if (res.status === 429) { await sleep(10_000 * (i + 1)); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      await sleep(900);
      return { url: res.url, json: JSON.parse(text) };
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(3000);
    }
  }
  throw new Error("429");
}
const ean = (s) => {
  let d = String(s ?? "").replace(/\D/g, "");
  if (/^\d{12}$/.test(d)) d = `0${d}`;
  if (!/^\d{13}$/.test(d)) return null;
  const sum = [...d.slice(0, 12)].reduce((a, c, i) => a + Number(c) * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(d[12]) ? d : null;
};
const isSealedSports = (p) => {
  const t = p.title ?? "";
  const ctx = `${t} ${p.product_type ?? ""} ${Array.isArray(p.tags) ? p.tags.join(" ") : p.tags ?? ""}`;
  return SEALED.test(t) && (MAKER.test(t) || SPORT.test(t)) && (SPORT.test(ctx) || MAKER.test(t)) && !NOT.test(t);
};
const TYPE = [["hobby case", /\bhobby case\b|\bcase of\b|\b\d+ ?box case\b/], ["breakers delight", /breaker'?s delight/], ["fotl", /fotl|first off the line/], ["jumbo", /\bjumbo\b/], ["hobby", /\bhobby\b/], ["blaster", /\bblaster\b/], ["mega", /\bmega\b/], ["hanger", /\bhanger\b/], ["cello", /\bcello\b|fat pack/], ["value", /\bvalue\b/], ["tin", /\btin\b/], ["choice", /\bchoice\b/], ["h2", /\bh2\b/], ["lite", /\blite\b/], ["retail", /\bretail\b|gravity/], ["pack", /\bpacks?\b/], ["box", /\bbox(es)?\b/]];
const STOP = new Set("the a and of with new sealed factory trading cards card pre order preorder presale release edition official box boxes pack packs hobby blaster mega hanger cello fat value jumbo retail gravity feed tin choice lite case in stock ship ships shipping limited per customer sale only exclusive uk au us ca eu sports sport".split(" "));
const CANON = { nba: "basketball", nfl: "football", mlb: "baseball", nhl: "hockey", soccer: "football", "premierleague": "epl" };
function key(title) {
  let t = title.toLowerCase().replace(/premier league/g, "premierleague").replace(/upper deck/g, "upperdeck").replace(/stadium club/g, "stadiumclub").replace(/[’']/g, "");
  const ym = t.match(/\b(20\d\d)\s*[-/ ]\s*(20)?(\d\d)\b/) ?? t.match(/\b(20\d\d)\b/);
  const year = ym ? (ym[3] ? `${ym[1]}-${ym[3]}` : ym[1]) : "?";
  const type = (TYPE.find(([, re]) => re.test(t)) ?? ["?"])[0];
  t = t.replace(/\b20\d\d\s*[-/ ]\s*(20)?\d\d\b|\b20\d\d\b/g, " ").replace(/\(.*?\)|\[.*?\]/g, " ").replace(/[^a-z0-9 ]/g, " ");
  const words = [...new Set(t.split(/\s+/).filter(Boolean).map((w) => CANON[w] ?? w).filter((w) => !STOP.has(w) && !/^\d{2,}$/.test(w)))].sort();
  return `${year}|${words.join(" ")}|${type}`;
}

const hosts = [...new Set(fs.readFileSync(new URL("./candidates.txt", import.meta.url), "utf8").split("\n")
  .map((l) => l.replace(/#.*/, "").trim().toLowerCase()).filter(Boolean))].filter((_, i) => i % SHARDS === SHARD);

async function pages(base, path, max) {
  const out = [];
  for (let p = 1; p <= max; p++) {
    const d = await get(`${base}${path}${path.includes("?") ? "&" : "?"}limit=250&page=${p}`);
    const arr = d.json.products ?? d.json.collections ?? [];
    out.push(...arr);
    if (arr.length < 250) break;
  }
  return out;
}

async function probe(host) {
  const r = { host };
  let base;
  try {
    const first = await get(`https://${host}/products.json?limit=1`, 2);
    if (!Array.isArray(first.json.products)) return { ...r, shopify: false };
    base = new URL(first.url).origin;
    r.shopify = true;
    r.base = base;
    try { const m = await get(`${base}/meta.json`, 1); r.name = m.json.name; r.currency = m.json.currency; r.country = m.json.country; } catch {}
    let colls = [];
    try { colls = await pages(base, "/collections.json", 4); } catch {}
    const sportColls = colls.filter((c) => SPORT_COLL.test(`${c.handle} ${c.title}`) && !/pokemon|magic|yugioh|lorcana|one-piece/i.test(c.handle)).slice(0, 15);
    r.sportCollections = sportColls.map((c) => c.handle);
    const byId = new Map();
    for (const c of sportColls) {
      try { for (const p of await pages(base, `/collections/${c.handle}/products.json`, 8)) byId.set(p.id, p); } catch {}
      if (byId.size > 4000) break;
    }
    if (!sportColls.length) {
      // No sports collection: look at the first two catalogue pages, and go on only if they hold sealed sports.
      const head = await pages(base, "/products.json", 2);
      const hits = head.filter(isSealedSports).length;
      const all = hits >= 5 && head.length === 500 ? await pages(base, "/products.json", 16) : head;
      for (const p of all) byId.set(p.id, p);
    }
    const sealed = [...byId.values()].filter(isSealedSports);
    r.scanned = byId.size;
    r.sealed = sealed.length;
    r.items = sealed.map((p) => {
      const vs = p.variants ?? [];
      const prices = vs.map((v) => Number(v.price)).filter((x) => x > 0);
      return { k: key(p.title), t: p.title, v: p.vendor, p: prices.length ? Math.min(...prices) : null, a: vs.some((v) => v.available), e: vs.map((v) => ean(v.sku) ?? ean(v.barcode)).find(Boolean) ?? null };
    });
    r.inStock = r.items.filter((i) => i.a).length;
    return r;
  } catch (e) {
    return { ...r, shopify: base ? true : null, error: String(e.message ?? e) };
  }
}

const out = [];
for (const h of hosts) {
  const t = Date.now();
  const res = await probe(h).catch((e) => ({ host: h, error: String(e) }));
  out.push(res);
  const { items, ...log } = res;
  console.log(JSON.stringify(log), `${Math.round((Date.now() - t) / 1000)}s`);
  fs.writeFileSync(new URL(`./out-${SHARD}.json`, import.meta.url), JSON.stringify(out));
}
