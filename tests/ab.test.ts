// The quick view's A/B tests (src/lib/ab.ts, DECISIONS.md 2026-11-14): fixed dates, a fair split, one-property keys, and the rules
// the tests must never break: only inside the quick view (nothing in a page's server HTML changes), both paid rows stay pinned.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AB_END, AB_EVENTS, AB_START, abActive, armOfKey, armsString, compare, normalCdf, outcomeOf, parseArms, splitByArm, tossArms, visitOf } from "../src/lib/ab";

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

test("the tests run for fourteen whole days and start after the 19 Nov rechecks", () => {
  assert.equal(new Date(AB_START).toISOString(), "2026-11-20T00:00:00.000Z");
  assert.equal(AB_END - AB_START, 14 * 86_400_000);
  assert.equal(abActive(AB_START - 1), false);
  assert.equal(abActive(AB_START), true);
  assert.equal(abActive(AB_END - 1), true);
  assert.equal(abActive(AB_END), false);
});

test("three independent fair coins, kept as three letters", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 8; i++) seen.add(armsString(tossArms([i & 1, (i >> 1) & 1, (i >> 2) & 1])));
  assert.equal(seen.size, 8);
  assert.deepEqual(parseArms("aba"), { order: "a", mini: "b", cta: "a" });
  for (const bad of [null, "", "ab", "abc", "abab", "a-b"]) assert.equal(parseArms(bad), null);
});

test("a visit carries an arm only where the test applies: order in the US, mini on a phone", () => {
  const arms = { order: "b", mini: "b", cta: "a" } as const;
  assert.deepEqual(visitOf(arms, "us", true), { order: "b", mini: "b", cta: "a", k: "us:bba" });
  assert.deepEqual(visitOf(arms, "uk", true), { order: "-", mini: "b", cta: "a", k: "uk:-ba" });
  assert.deepEqual(visitOf(arms, "us", false), { order: "b", mini: "-", cta: "a", k: "us:b-a" });
});

test("a click's event comes from what the link already says", () => {
  assert.equal(outcomeOf("TCGplayer", "quickview-table"), "ab_tcg");
  assert.equal(outcomeOf("eBay (ebay.com)", "listings-offer-row"), "ab_ebay");
  assert.equal(outcomeOf("Amazon US", "amazon-table"), "ab_amazon");
  assert.equal(outcomeOf("Pokebox (AU)", "quickview-table"), "ab_store");
  assert.equal(outcomeOf("eBay (ebay.com)", "listings-quickview-mini"), "ab_mini_ebay");
  assert.equal(outcomeOf("TCGplayer", "tcgplayer-strip-quickview"), "ab_mini_tcg");
  assert.equal(AB_EVENTS.length, 8);
  // each event once a visit, and ab_paid beside every paid one: counts are visits, so the read-out is a share of ab_seen
  const c = src("lib/ab-client.tsx");
  assert.match(c, /const paid = outcome !== "ab_store" \|\| \/\\bsponsored\\b\/\.test\(rel\);/);
  assert.match(c, /if \(window\.sessionStorage\.getItem\(key\) === v\.k\) continue;/);
});

test("the wording arm is no wider than the control: \"Buy now\" on TCGplayer's priced, open row only", () => {
  const s = src("components/OfferRows.tsx");
  assert.match(s, /const buyNow = useAb\(\)\?\.cta === "b" && tcg && d\.open && !d\.search;/);
  assert.match(s, /\{buyNow \? "Buy now" : d\.kind === "amazon" \?/);
});

test("the read-out sums keys into arms and leaves out visits a test did not apply to", () => {
  const counts = { "us:aba": 10, "us:bba": 7, "uk:-ba": 5, "us:a-b": 3, "nonsense": 99 };
  assert.deepEqual(splitByArm(counts, "order"), { a: 13, b: 7 });
  assert.deepEqual(splitByArm(counts, "mini"), { a: 0, b: 22 });
  assert.deepEqual(splitByArm(counts, "cta"), { a: 22, b: 3 });
  assert.equal(armOfKey("uk:-ba", "order"), null);
});

test("the two-proportion test", () => {
  assert.ok(Math.abs(normalCdf(1.96) - 0.975) < 1e-3);
  const r = compare({ hits: 100, n: 1000 }, { hits: 130, n: 1000 });
  assert.ok(r);
  assert.ok(Math.abs(r.z - 2.103) < 0.01);
  assert.ok(r.p > 0.03 && r.p < 0.04);
  assert.ok(Math.abs((r.lift ?? 0) - 0.3) < 1e-9);
  assert.equal(compare({ hits: 0, n: 0 }, { hits: 1, n: 5 }), null);
});

test("only the quick view provides the test: the product page's own table and every server render draw the control", () => {
  const providers = ["components/QuickView.tsx"];
  for (const f of ["components/OfferTable.tsx", "components/BestPriceCard.tsx", "components/StickyBuyBar.tsx", "app/layout.tsx"]) {
    assert.doesNotMatch(src(f), /AbContext|abVisit/, `${f} must not start a test`);
  }
  for (const f of providers) assert.match(src(f), /<AbContext\.Provider value=\{ab\}>/);
  // the split reads the browser only: no cookie, header or server call
  assert.doesNotMatch(src("lib/ab-client.tsx"), /cookies\(|headers\(|document\.cookie/);
  // every event goes through lib/track.ts's list, never straight to Vercel
  assert.match(src("lib/ab-client.tsx"), /import \{ track \} from "\.\/track";/);
  assert.match(src("lib/ab-client.tsx"), /return visitOf\(arms, region, false\);/, "no small ad pair in this quick view: the mini test applies to nobody");
});

test("arm b of `order` still pins both paid rows above the stores, and only for a real TCGplayer offer", () => {
  const s = src("components/EbayStrip.tsx");
  assert.match(s, /const tcgFirst = useAb\(\)\?\.order === "b" && !!tcg && tcg\.open && !tcg\.search && tcg\.comparable !== false;/);
  const slots = s.slice(s.indexOf("const slots: Slot[] = ["), s.indexOf("const { shown, moreOpen, moreClosed } = splitRows(slots);"));
  const order = ["...(tcgFirst ? tcgSlot : [])", "{ key: EBAY_ROW_KEY", "...(amazon ?", "...(tcgFirst ? [] : tcgSlot)", "...rows.map("].map((x) => slots.indexOf(x));
  assert.ok(order.every((i) => i >= 0), "every slot is there");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "paid rows first, stores after");
});
