// The last known price (DECISIONS.md, "Last known price", 2026-10-18): a unit with no current price in the visitor's market
// shows the most recent price ITS OWN history holds, muted and dated. These tests pin the selection (same unit, same market,
// the headline's series), the eligibility (no current price of any kind; a THIN row only when the whole card lost its price)
// and the guard: the value is display-only, so no ranking, JSON-LD, metadata, plane or alert code may ever read it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PRICE_MASK, unitKey } from "../src/lib/constants";
import type { HistoryPoint, Quote } from "../src/lib/data";
import { usdCentsToCountry } from "../src/lib/fx";
import { lastKnownEligible, lastKnownPrice, visitorHistory } from "../src/lib/price-history-view";
import { LAST_KNOWN_DAYS, QUICKVIEW_HISTORY_DAYS, lastKnownPoints, quickViewHistory, quickViewLastKnownOk } from "../src/lib/quick-view";
import { encodeRuns } from "../src/lib/data/plane/history-codec";
import { memTree } from "../src/lib/data/plane/tree";
import { bucketPath, histBucket, tailBucket } from "../src/lib/data/plane/shards";
import { resetPlaneForTests } from "../src/lib/data/plane/runtime";
import { addDays } from "../src/lib/history";
import * as hist from "../src/lib/data/history";
import { MINI_CUT, dayOf, isoOf, miniCards, miniFull } from "./helpers/plane-tree";
import { writePlaneDir } from "./helpers/data-source";

const NONE = { kind: "none" } as const;
const pt = (day: string, marketUsd: number | null, lows?: (number | null)[]): HistoryPoint => ({ day, marketUsd, lowUsd: null, ...(lows ? { lows } : {}) });

// ── selection ─────────────────────────────────────────────────────────────────────────────────────────────────────────
test("the most recent day with a price wins, whatever the order of the points; a day without one is skipped", () => {
  const h = [pt("2026-09-10", 400), pt("2026-09-12", 412), pt("2026-09-14", null)];
  assert.deepEqual(lastKnownPrice(NONE, visitorHistory(h, "US")), { cents: 412, day: "2026-09-12", kind: "reference" });
  assert.deepEqual(lastKnownPrice(NONE, visitorHistory([...h].reverse(), "US")), { cents: 412, day: "2026-09-12", kind: "reference" });
});

test("the headline's series and currency: TCGplayer's market converted at the indicative rate, shown as a reference (≈)", () => {
  const h = [pt("2026-09-10", 400), pt("2026-09-12", 412)];
  for (const c of ["US", "AU", "UK", "SG", "CA", "EU"] as const) assert.deepEqual(lastKnownPrice(NONE, visitorHistory(h, c)), { cents: usdCentsToCountry(412, c), day: "2026-09-12", kind: "reference" }, c);
});

test("another market's low is never borrowed; the visitor market's own low beats the reference on the same day, as in the live headline", () => {
  const h = [pt("2026-09-01", 300), pt("2026-09-05", null, [null, 1500, null, null, null, null]), pt("2026-09-03", 320, [null, null, 250, null, null, null])];
  // US: no US low on any day, so the newest TCGplayer market (09-03); AU's low of 09-05 is not the US price
  assert.deepEqual(lastKnownPrice(NONE, visitorHistory(h, "US")), { cents: 320, day: "2026-09-03", kind: "reference" });
  // AU: its own low of 09-05 is the newest AU price
  assert.deepEqual(lastKnownPrice(NONE, visitorHistory(h, "AU")), { cents: 1500, day: "2026-09-05", kind: "listing" });
  // UK: on 09-03 the UK low and TCGplayer's market both exist; the market's own low comes first
  assert.deepEqual(lastKnownPrice(NONE, visitorHistory(h, "UK")), { cents: 250, day: "2026-09-03", kind: "listing" });
});

test("nothing when the unit has a current price, or when its history holds none", () => {
  const h = [pt("2026-09-12", 412)];
  assert.equal(lastKnownPrice({ kind: "listing" }, visitorHistory(h, "US")), null);
  assert.equal(lastKnownPrice({ kind: "reference" }, visitorHistory(h, "US")), null);
  assert.equal(lastKnownPrice(NONE, visitorHistory([], "US")), null);
  assert.equal(lastKnownPrice(NONE, visitorHistory([pt("2026-09-12", null), pt("2026-09-13", 0)], "AU")), null);
});

test("the popup picks what the card page picks: the few points it is sent give the same last known price as the page's year of history, even when the price left more than 90 days ago", () => {
  assert.equal(LAST_KNOWN_DAYS, 365);
  const today = "2026-10-18";
  const h = [
    pt("2026-03-02", 280, [null, null, 210, null, null, null]),
    pt("2026-04-20", 300, [null, 1450, null, null, null, null]),
    pt("2026-05-30", 310, [295, null, null, null, null, null]),
    pt("2026-06-10", null, [null, null, null, 520, null, null]),
    pt("2026-06-12", 0),
  ];
  assert.equal(quickViewHistory(h, today, QUICKVIEW_HISTORY_DAYS).length, 0, "the popup's 90-day chart window holds none of these days");
  const sent = lastKnownPoints(h);
  assert.ok(sent.length <= 7 && sent.every((p) => h.includes(p)), "whole original points, at most one per market plus the reference");
  for (const c of ["US", "AU", "UK", "SG", "CA", "EU"] as const) assert.deepEqual(lastKnownPrice(NONE, visitorHistory(sent, c)), lastKnownPrice(NONE, visitorHistory(h, c)), c);
  assert.deepEqual(lastKnownPrice(NONE, visitorHistory(sent, "SG")), { cents: 520, day: "2026-06-10", kind: "listing" });
  assert.deepEqual(lastKnownPrice(NONE, visitorHistory(sent, "US")), { cents: 295, day: "2026-05-30", kind: "listing" });
  assert.deepEqual(lastKnownPoints([]), []);
});

// ── eligibility ───────────────────────────────────────────────────────────────────────────────────────────────────────
test("eligible only with no current price of any kind: no listing in the market, no TCGplayer market, no TCGplayer low", () => {
  const q = (market: number | null, low: number | null): Quote => ({ market, low });
  const card = (thin: boolean, n: Quote | null, f: Quote | null) => ({ thin, n, f });
  assert.equal(lastKnownEligible(card(false, null, q(900, 800)), "N", NONE, false), true, "a relevant row whose Normal unit lost its price");
  assert.equal(lastKnownEligible(card(false, q(null, null), q(900, 800)), "N", NONE, true), true, "a live listing in ANOTHER market does not price this one");
  assert.equal(lastKnownEligible(card(false, null, null), "N", { kind: "listing" }, true), false, "a listing in the market is a price");
  assert.equal(lastKnownEligible(card(false, q(500, 450), null), "N", { kind: "reference" }, false), false, "TCGplayer's market is a price");
  assert.equal(lastKnownEligible(card(false, q(null, 20_306_770), null), "N", NONE, false), false, "a low-only unit has a current (thin) price: it keeps its own display rule");
  assert.equal(lastKnownEligible(card(false, q(500, 450), q(null, null)), "F", NONE, false), true, "the OTHER finish's price does not price this unit");
});

test("a THIN row qualifies only when the whole card lost its price: never where the page withholds a current one (2026-10-17)", () => {
  const q = (market: number | null, low: number | null): Quote => ({ market, low });
  assert.equal(lastKnownEligible({ thin: true, n: null, f: null }, "N", NONE, false), true);
  assert.equal(lastKnownEligible({ thin: true, n: q(null, null), f: q(null, null) }, "F", NONE, false), true);
  assert.equal(lastKnownEligible({ thin: true, n: q(null, null), f: q(120, 100) }, "N", NONE, false), false, "the Foil's current price is withheld on a THIN page: no older Normal price beside it");
  assert.equal(lastKnownEligible({ thin: true, n: q(null, 90), f: null }, "N", NONE, false), false);
  assert.equal(lastKnownEligible({ thin: true, n: null, f: null }, "N", NONE, true), false, "a live listing anywhere is a withheld current price");
});

test("the QuickView payload asks the same question for its unit, with the market left to the popup", () => {
  const offer = { finish: "N" as const, inStock: true };
  assert.equal(quickViewLastKnownOk({ thin: false, n: null, f: { market: 900, low: 800 }, offers: [] }, "N"), true);
  assert.equal(quickViewLastKnownOk({ thin: false, n: { market: 500, low: 450 }, f: null, offers: [] }, "N"), false);
  assert.equal(quickViewLastKnownOk({ thin: true, n: null, f: null, offers: [offer] as never }, "N"), false);
  assert.equal(quickViewLastKnownOk({ thin: true, n: null, f: null, offers: [{ ...offer, finish: "F" }] as never }, "N"), true, "a listing of the other finish is not this unit's");
});

// ── same unit only, through the real loader ───────────────────────────────────────────────────────────────────────────
test("through getUnitHistory: the unit's own series only; the other finish and the other printings of the same history file are never read into it", async () => {
  const cs = miniCards({ day: 3 });
  const both = cs.find((c) => c.mask & PRICE_MASK.TRACKN && c.mask & PRICE_MASK.TRACKF && cs.some((x) => x.id !== c.id && histBucket(x.id) === histBucket(c.id) && x.mask & PRICE_MASK.TRACKN))!;
  assert.ok(both, "the golden tree has a card with both finishes tracked and a tracked neighbour in its history file");
  const nb = cs.find((x) => x.id !== both.id && histBucket(x.id) === histBucket(both.id) && x.mask & PRICE_MASK.TRACKN)!;
  const tree = miniFull({ day: 3 }), base = bucketPath("hist/p", histBucket(both.id)), tail = bucketPath("hist/t", tailBucket(both.id));
  const start = addDays(MINI_CUT, -9);
  const b = JSON.parse(tree.read(base)) as { v: number; p: Record<string, unknown> }, t = JSON.parse(tree.read(tail)) as { v: number; cut: number; p: Record<string, unknown> };
  // Normal: priced until MINI_CUT - 7 (US$5.20), then no price; Foil and the neighbour keep later, dearer prices
  b.p[unitKey(both.id, "N")] = encodeRuns(start, [500, 510, 520, null, null, null, null, null, null, null]);
  b.p[unitKey(both.id, "F")] = encodeRuns(start, [9000, 9100, 9200, 9300, 9400, 9500, 9600, 9700, 9800, 9900]);
  b.p[unitKey(nb.id, "N")] = encodeRuns(start, [7000, 7000, 7000, 7000, 7000, 7000, 7000, 7000, 7000, 7777]);
  delete t.p[unitKey(both.id, "N")]; delete t.p[unitKey(both.id, "F")]; delete t.p[unitKey(nb.id, "N")];
  const t2 = memTree(tree.files().map((f) => [f, f === base ? JSON.stringify(b) : f === tail ? JSON.stringify(t) : tree.read(f)] as [string, string]));
  process.env.PLANE_DIR = writePlaneDir(t2, { priceDay: isoOf(dayOf(3)) }); resetPlaneForTests();
  try {
    const n = await hist.getUnitHistory({ id: both.id, finish: "N" }, 365);
    assert.deepEqual(lastKnownPrice(NONE, visitorHistory(n, "US")), { cents: 520, day: isoOf(addDays(MINI_CUT, -7)), kind: "reference" });
    assert.deepEqual(lastKnownPrice(NONE, visitorHistory(n, "AU")), { cents: usdCentsToCountry(520, "AU"), day: isoOf(addDays(MINI_CUT, -7)), kind: "reference" });
    const f = await hist.getUnitHistory({ id: both.id, finish: "F" }, 365);
    assert.deepEqual(lastKnownPrice(NONE, visitorHistory(f, "US")), { cents: 9900, day: isoOf(MINI_CUT), kind: "reference" }, "the Foil unit has its own last price");
    assert.equal(lastKnownPrice(NONE, visitorHistory(await hist.getUnitHistory({ id: 3_999_999, finish: "N" }), "US")), null, "no series, no last known price");
  } finally { delete process.env.PLANE_DIR; resetPlaneForTests(); }
});

// ── the guard: display only ───────────────────────────────────────────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, "..");
const walk = (d: string): string[] => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(ts|tsx|js|mjs|cjs|json)$/.test(e.name) ? [path.join(d, e.name)] : [])) : []);
const rel = (f: string): string => path.relative(ROOT, f).split(path.sep).join("/");
/** The ONLY files that may name a last known price: the selection, the component that draws it, and the two price spots that show it (the card page and the QuickView, with its payload and route). */
const ALLOWED = new Set(["src/lib/price-history-view.ts", "src/components/LastKnownPrice.tsx", "src/app/card/[slug]/page.tsx", "src/components/QuickView.tsx", "src/lib/quick-view.ts", "src/app/api/card/[slug]/route.ts"]);
const NAME = /last[-_ ]?known/i;

test("no ranking, sort, filter, index, deal, alert, basket, deck, collection, eBay, sitemap, share image, JSON-LD helper or plane file names the last known price", () => {
  const hits = [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "scripts"))].map(rel).filter((f) => NAME.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
  const outside = hits.filter((f) => !ALLOWED.has(f));
  assert.deepEqual(outside, [], "a last known price is display-only (DECISIONS \"Last known price\"): it must never reach a ranking, a total, an alert, an eBay reference, JSON-LD, metadata, a share image, a sitemap or the published plane");
  for (const f of ALLOWED) assert.ok(hits.includes(f), `${f} draws or selects the last known price`);
});

/** The text of the JSX element or call that starts at `from` (`<Tag ... />` or `name(...)`), balanced on (), {} and []. */
function segment(src: string, from: number): string {
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    const c = src[i]!;
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") { depth--; if (depth === 0 && c === ")" && src[from] !== "<") return src.slice(from, i + 1); }
    else if (depth === 0 && src[from] === "<" && c === "/" && src[i + 1] === ">") return src.slice(from, i + 2);
  }
  return src.slice(from);
}
const all = (src: string, needle: string): number[] => { const out: number[] = []; for (let i = src.indexOf(needle); i >= 0; i = src.indexOf(needle, i + 1)) out.push(i); return out; };

test("the card page: JSON-LD, the title and description, the FAQ, the prose, the buy bars, the alert and the eBay panel never read it", () => {
  const src = fs.readFileSync(path.join(ROOT, "src/app/card/[slug]/page.tsx"), "utf8");
  const meta = src.slice(src.indexOf("export async function generateMetadata"), src.indexOf("export default async function CardPage"));
  assert.ok(meta.length > 200 && !NAME.test(meta), "generateMetadata (title, description, robots, Open Graph)");
  const blocks = ["<JsonLd", "ebayJsonLdOffers(", "buildCardFaqs(", "buildNarrative(", "<CardStickyBuyBar", "<CardTopBuy", "<CardBuyPair", "<PriceDropAlertCta", "<PriceBoard", "<TcgMarketPrice", "<EbayCardPanel", "<CardMarketsTable", "<CardNoListings", "priceState(", "priceToolChips("];
  for (const b of blocks) {
    const at = all(src, b); assert.ok(at.length > 0, `${b} is on the page`);
    for (const i of at) assert.ok(!NAME.test(segment(src, i)), `${b} must not read the last known price`);
  }
  const ld = all(src, "<JsonLd").map((i) => segment(src, i)).join("\n");
  assert.ok(/AggregateOffer/.test(ld) && /inMarket/.test(ld) && !/history|pastHistory|\bvh\b/.test(ld), "the structured data prices only the live listings in the market");
});

test("the component is muted, labelled and not a buy surface", () => {
  const src = fs.readFileSync(path.join(ROOT, "src/components/LastKnownPrice.tsx"), "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/^import .*$/gm, "");
  assert.match(src, /Last known price ·/, "the label is text, not colour alone");
  assert.doesNotMatch(src, /text-accent|text-brand|text-gold/, "the secondary text colour, never the price accent");
  assert.doesNotMatch(src, /href|<a\b|<button|Buy|[Cc]heapest|[Ss]ave|[Ff]rom\b/, "no buy button, no cheapest or from claim, no savings maths");
});
