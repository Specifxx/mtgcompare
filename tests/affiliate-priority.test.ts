// AFFILIATE LINKS ARE BUILT ONCE, TAGGED FOR THIS SITE, AND NEVER PAY ANOTHER (owner WP19, parity P08; RiftCompare's affiliate-priority test pinned the EPN tagging, the eBay call order and the auction caps of ITS import).
// What carries over is the policy underneath: revenue is attributed correctly or it is lost, and it is lost silently. Here that means
//   1. one module builds the revenue URLs (src/lib/affiliate.ts, with the eBay modules for the script side): a hand-typed `campid=` or a literal partner link in a component is a second place to forget the tag;
//   2. the attribution prefix of the EPN `customid` and the Impact `sharedid` is this site's own (`mc-`): an `oc-` (OP Compare) or `rc-` (RiftCompare) prefix books MTG traffic as another site in the networks' reports
//      (brand/rename-table.md: "an oc- EPN customid on MTG traffic would be booked as OP Compare");
//   3. an outbound revenue link says so to search engines (rel nofollow sponsored) and an unconfigured site links PLAIN, not to someone else's account (Annex B: both NEXT_PUBLIC_ ids default to none);
//   4. eBay and TCGplayer are both offered wherever a price is (requirements 4, "Buy on eBay highlighted next to the TCGplayer buy link on every surface that has one").
// Rules 1, 2 and 4 are RATCHETS per owner: they read the files of other packages, which are still the One Piece code. Rule 3 is behaviour, and waits for WP06's rewrite of affiliate.ts (it is skipped, with the reason, while
// that file still reads OP's variables; tests/env-names.test.ts is red for the same reason).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, ratchet, stripComments, summary, walk } from "./helpers/ratchet";

const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), "utf8");
/** The modules that may assemble a revenue URL: the link builder, and the script-side eBay modules (the affiliate header of a Browse call, the tag on a stored item URL). */
export const BUILDERS = (f: string): boolean => f === "src/lib/affiliate.ts" || /^src\/lib\/ebay[\w-]*\.ts$/.test(f) || f === "src/lib/listing-panel.ts" || f === "scripts/ebay.ts";
/** What only a builder may contain: an EPN parameter being SET, a partner link, an eBay storefront URL typed by hand. */
const ASSEMBLY: [string, RegExp][] = [
  ["an EPN parameter", /["'`&?](?:campid|customid|mkcid|mkrid|toolid|mkevt)=/],
  ["a partner link", /partner\.tcgplayer\.com\/c\/\d+|\bimpact\.com\/c\/\d+|rover\.ebay\.com/],
  ["an eBay storefront URL", /https?:\/\/(?:www\.)?ebay\.(?:com|co\.uk|com\.au|ca|es|de|fr|it|com\.sg)\/(?:sch|itm|b|str|usr)\b/],
];
const SRC = [...walk("src", (f) => /\.tsx?$/.test(f)), ...walk("scripts", (f) => /\.tsx?$/.test(f))].filter((f) => !BUILDERS(f));
const TEXT = new Map(SRC.map((f) => [f, stripComments(read(f))]));

test("RATCHET: revenue URLs are assembled in affiliate.ts and the eBay modules alone", () => {
  const offenders: string[] = [], why: string[] = [];
  for (const [f, t] of TEXT) for (const [what, re] of ASSEMBLY) if (re.test(t)) { offenders.push(f); why.push(`${f}: ${what}`); }
  const r = ratchet("affiliate-priority:assembly", [...new Set(offenders)]);
  if (offenders.length) console.log(`affiliate-priority assembly: ${summary(r)}: ${why.slice(0, 6).join("; ")}`);
  assert.ok(r.ok, r.failures.join("\n"));
});
test("RATCHET: no code attributes revenue to OP Compare or RiftCompare (the customid and sharedid prefix is mc-)", () => {
  const WRONG = /(?:customid|sharedid|subId|subid|source)\b[^\n]{0,60}["'`](?:oc|rc)-/i, DEFAULT_SUB = /subId\s*=\s*["'](?:opcompare|riftcompare|rc|oc)["']/;
  const files = [...TEXT].filter(([, t]) => WRONG.test(t) || DEFAULT_SUB.test(t)).map(([f]) => f);
  for (const f of walk("src/lib", (x) => BUILDERS(x))) { const t = stripComments(read(f)); if (/customid:\s*["'`](?:oc|rc)-|["'`]oc-(?:au|us|uk|ca|sg|eu)["'`]|subId\s*=\s*["'](?:opcompare|riftcompare)["']/.test(t)) files.push(f); }
  const r = ratchet("affiliate-priority:attribution", [...new Set(files)]);
  if (files.length) console.log(`affiliate-priority attribution: ${summary(r)}: ${[...new Set(files)].slice(0, 6).join(", ")}`);
  assert.ok(r.ok, r.failures.join("\n"));
});
test("the detectors can fail", () => {
  assert.ok(ASSEMBLY[0]![1].test('const u = base + "&campid=123"'));
  assert.ok(ASSEMBLY[0]![1].test("`${u}?customid=mc-us`"));
  assert.ok(!ASSEMBLY[0]![1].test("const campid = process.env.X;"), "reading a campaign id is not assembling a URL");
  assert.ok(ASSEMBLY[1]![1].test('href="https://partner.tcgplayer.com/c/7385758/1780961/21018"'));
  assert.ok(ASSEMBLY[2]![1].test('<a href="https://www.ebay.com/sch/i.html?_nkw=sol+ring">'));
  assert.ok(!ASSEMBLY[2]![1].test("https://help.ebay.com/"), "help and policy pages are not storefront URLs");
  assert.ok(BUILDERS("src/lib/ebay-client.ts") && BUILDERS("src/lib/affiliate.ts") && !BUILDERS("src/components/EbayBuyCta.tsx"));
});

// ── the behaviour of the builder (waits for WP06) ────────────────────────────────────────────────────────────────────────────
const AFFILIATE = read("src/lib/affiliate.ts");
const REWRITTEN = /NEXT_PUBLIC_EBAY_CAMPAIGN_ID/.test(AFFILIATE) && !/process\.env\.(?:EBAY_AFFILIATE_CAMPAIGN|TCGPLAYER_IMPACT_LINK)/.test(AFFILIATE);
const SKIP = REWRITTEN ? false : "src/lib/affiliate.ts still reads the One Piece variables (WP06 renames them to NEXT_PUBLIC_EBAY_CAMPAIGN_ID and NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK)";
async function withEnv<T>(env: Record<string, string | undefined>, fn: (m: typeof import("../src/lib/affiliate")) => T): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) { saved[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  try {
    const file = require.resolve("../src/lib/affiliate");
    delete require.cache[file];                                              // the ids are read at import time: a fresh module per environment
    return fn(await import(`../src/lib/affiliate?${Math.random()}`) as typeof import("../src/lib/affiliate"));
  } finally { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}
test("with no campaign id an eBay link is a PLAIN search link: no campid, no customid", { skip: SKIP }, async () => {
  await withEnv({ NEXT_PUBLIC_EBAY_CAMPAIGN_ID: undefined, NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK: undefined }, (m) => {
    const u = new URL(m.ebaySearchUrl("US", "sol ring"));
    assert.match(u.hostname, /ebay\.com$/);
    assert.equal(u.searchParams.get("campid"), null);
    assert.equal(u.searchParams.get("customid"), null);
    assert.equal(m.affiliateUrl("https://www.tcgplayer.com/product/1"), "https://www.tcgplayer.com/product/1", "no Impact link configured: the plain TCGplayer URL, never someone else's partner link");
  });
});
test("with a campaign id every eBay market is tagged for THIS site, and a TCGplayer link goes through the Impact link", { skip: SKIP }, async () => {
  await withEnv({ NEXT_PUBLIC_EBAY_CAMPAIGN_ID: "1234567890", NEXT_PUBLIC_TCGPLAYER_IMPACT_LINK: "https://partner.example.test/c/1/2/3" }, (m) => {
    for (const c of ["US", "AU", "UK", "CA", "SG", "EU"] as const) {
      const u = new URL(m.ebaySearchUrl(c, "lightning bolt", "card"));
      assert.equal(u.searchParams.get("campid"), "1234567890", c);
      assert.match(u.searchParams.get("customid") ?? "", /^mc-/, `${c}: attribution prefix`);
    }
    const t = m.affiliateUrl("https://www.tcgplayer.com/product/1", "card", "/card/x");
    assert.ok(t.startsWith("https://partner.example.test/c/1/2/3"), t);
    assert.match(decodeURIComponent(t), /mc-|mtg/i, "the shared id names this site");
  });
});
test("an outbound revenue link says so: rel is nofollow sponsored noopener noreferrer", async () => {
  const { outboundRel } = await import("../src/lib/affiliate");
  const rel = outboundRel().split(/\s+/);
  for (const t of ["nofollow", "sponsored", "noopener", "noreferrer"]) assert.ok(rel.includes(t), t);
});

// ── both marketplaces wherever a price is (requirements 4) ───────────────────────────────────────────────────────────────────
test("RATCHET: a page that builds a TCGplayer buy link also reaches an eBay link (a Buy on eBay beside Buy on TCGplayer)", async () => {
  const { appRoutes, closure } = await import("./helpers/import-graph");
  const TCG = /\b(?:tcgplayerUrl|tcgProductUrl)\s*\(|affiliateUrl\(\s*[`"']https?:\/\/(?:www\.)?tcgplayer\.com\/product/;
  const EBAY = /\b(?:ebaySearchUrl|ebayAffiliateUrl|EbayBuyCta|EbaySearchPanel|EbayCardSearchRow|EbayChaseStrip|EbayPicksLive|EbayCardBanner|EbayChase|BuyOnEbay)\b/;
  const offenders: string[] = [];
  for (const f of appRoutes(ROOT).filter((x) => /\/page\.tsx$/.test(x))) {
    if (/\/(admin|api|account|login|dashboard|profile)\//.test(f)) continue;
    const texts = [...closure(f, ROOT).files].map((g) => stripComments(fs.readFileSync(g, "utf8")));
    if (texts.some((t) => TCG.test(t)) && !texts.some((t) => EBAY.test(t))) offenders.push(path.relative(ROOT, f).split(path.sep).join("/"));
  }
  const r = ratchet("affiliate-priority:both-marketplaces", offenders);
  if (offenders.length) console.log(`affiliate-priority both-marketplaces: ${summary(r)}: ${offenders.slice(0, 6).join(", ")}`);
  assert.ok(r.ok, r.failures.join("\n"));
});
