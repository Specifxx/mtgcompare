// WHAT THE SITE SAYS ABOUT ITSELF HAS TO BE TRUE (owner WP19, parity P08; ported from RiftCompare's site-claims test, which exists because a reviewer who reads "every price is ranked by total delivered cost, shipping
// included" and then opens a card page showing "postage at checkout" marks the whole site down). Scoped to claims ABOUT THE SITE: general buying advice ("compare the total including shipping") is true and allowed.
//
// The facts these patterns defend, each checkable in code:
//   * comparisons sort by ITEM price; postage only breaks ties and is shown where a store publishes it. Only Best Basket prices whole orders with measured postage;
//   * six markets: US, Australia, UK, Singapore, Canada and the EU;
//   * prices are SNAPSHOTS: one import a day (src/lib/schedule.ts), store listings with it, never real-time lookups, never twice a day (that was OP Compare's cadence);
//   * the headline price is TCGplayer's market price and store listings: we hold no sold or completed sales;
//   * we are an unofficial fan site: nothing may say or imply that Wizards of the Coast, Hasbro, Scryfall or TCGplayer endorse, approve, license or sponsor it (the notice itself says the opposite, and is allowed);
//   * Premium sells OUR analytics (Deal Finder, Rising Cards, Demand Finder, alert limits, no ads), never Scryfall's data: no copy may say that a paid tier unlocks card data, card images or the card database;
//   * only tracked printings have store offers (the track policy): no copy may say that every printing is compared in every store; and nothing guarantees a price.
// The scan is a RATCHET per owner: it reads the copy of every package, most of it still the One Piece text; each owner may only reduce its count (RATCHET_STRICT=1 at M2 requires zero).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, ratchet, stripComments, summary, walk } from "./helpers/ratchet";

export const CLAIMS: [string, RegExp][] = [
  ["ranked by delivered cost", /\b(rank|sort)\w*\b[^.\n]{0,60}\b(delivered|total cost|including (postage|shipping)|shipping included|what you(?:'d| would) actually pay)/i],
  ["shipping included", /(mtg ?compare|\bwe\b|\bour\b|every (figure|price))[^.\n]{0,90}(shipping included|including shipping|with shipping|postage included|total cost[^.\n]{0,20}shipping)|\bno hidden fees\b/i],
  ["five markets", /\b(five|5) (markets|countries)\b|\bUS, UK, AU, CA,? (and|&) SG\b|\bAU, US, UK, Singapore (&|and) Canada\b|\bUS\/UK\/AU\/CA\/SG\b(?!\/EU)/i],
  ["sold listings", /(mtg ?compare|\bour\b|\bwe\b|the index)[^.\n]{0,90}\b(completed sales|sold listings|completed listings)/i],
  ["real-time", /(mtg ?compare|\bour\b|\bwe\b)[^.\n]{0,60}\b(real[- ]time|updated hourly|checked hourly|live lookups?)\b/i],
  ["delivered-cost comparison", /\bwith (\w+ )?delivered cost\b|\bon (total )?delivered cost\b|\bcheapest delivered (first|price)\b/i],
  // the cadence is daily (one publish a day) and is quoted from schedule.ts; "twice a day" is OP Compare's old figure
  ["wrong cadence", /\b(?:prices?|listings?|stores?|data|catalogue|import)\b[^.\n]{0,60}\b(?:twice (?:a|per) day|twice daily|every (?:12|six|6|four|4|two|2) hours|several times (?:a|per) day|hourly|every hour)\b/i],
  // the unofficial-fan-site rule: an endorsement is claimed by "official", "licensed", "approved by", "endorsed by", "sponsored by" in front of a rights holder
  ["affiliation", /\b(?:officially|official (?:price guide|prices|partner|retailer|site|app)|licen[sc]ed (?:by|from)|(?:endorsed|approved|sponsored|authori[sz]ed|certified) (?:by|from))\b[^.\n]{0,40}\b(?:Wizards|Hasbro|Scryfall|TCGplayer)/i],
  // Scryfall's rule: nothing paywalls its data. Premium sells analysis
  ["paid card data", /\b(?:Plus|Premium|subscribers?|members?)\b[^.\n]{0,70}\b(?:unlock|get|gain|include|access|see|view)\w*\b[^.\n]{0,40}\b(?:card data|card images|card database|Scryfall|oracle text|card prices)\b|\b(?:pay|subscribe|upgrade)\b[^.\n]{0,40}\bto (?:see|view|unlock) (?:card prices|prices|card data)\b/i],
  ["every printing in every store", /\bevery (?:printing|card|single)\b[^.\n]{0,60}\b(?:in|at|across) (?:every|all)(?: \d+)? (?:store|retailer)s?\b/i],
  ["guaranteed", /\bguarantee[sd]?\b[^.\n]{0,40}\b(?:lowest|cheapest|best) price|\b(?:lowest|cheapest|best) price (?:is )?guaranteed|\b100% accurate\b|\balways accurate\b/i],
];
/** True sentences that match a pattern, with the reason each is true. */
export const ALLOW = [
  "with delivered cost shown where",                         // the corrected wording itself: sorted by price, postage shown where known
  "whole order, shipping included",                           // eBay's final value fee base (the selling-fees tool)
  "not endorsed", "Not endorsed", "not approved", "Not approved", "not affiliated", "Not affiliated", "unofficial", "Unofficial", "does not endorse", "do not endorse", "not sponsored", "no affiliation",   // the disclaimers say the opposite of the claim
  "permitted under the Fan Content Policy",                   // Wizards' own wording for fan content (src/lib/site.ts)
  "we do not guarantee", "does not guarantee", "not guaranteed", "no guarantee",
];
const allowed = (s: string): boolean => ALLOW.some((a) => s.includes(a));
export function findings(text: string, where: string): string[] {
  const out: string[] = [];
  for (const piece of text.split("\n")) {
    if (allowed(piece)) continue;
    for (const [name, re] of CLAIMS) if (re.test(piece)) out.push(`${where} [${name}]: ${piece.trim().slice(0, 160)}`);
  }
  return out;
}
const SCOPE = [...walk("src/app", (f) => /\.tsx?$/.test(f)), ...walk("src/components", (f) => /\.tsx?$/.test(f)), ...walk("src/lib/blog", (f) => /\.tsx?$/.test(f)), ...walk("src/lib/content", (f) => /\.tsx?$/.test(f)), "src/lib/seo.ts", "src/lib/site.ts", "src/lib/card-seo.ts", "src/lib/gallery-seo.ts"].filter((f) => fs.existsSync(path.join(ROOT, f)));

test("the patterns catch the claims they exist for, and pass the true sentences", () => {
  const hit = (s: string): boolean => CLAIMS.some(([, re]) => re.test(s)) && !allowed(s);
  for (const s of [
    "Every comparison ranks stores by total delivered cost.",
    "MTG Compare shows the true all-in price with shipping included.",
    "It tracks stores in five markets.",
    "Live prices across US, UK, AU, CA and SG stores.",
    "The index is built from tracked listings and completed sales.",
    "MTG Compare shows real-time prices.",
    "1,101 cards compared across 24 UK stores in GBP, with UK delivered cost.",
    "MTG Compare compares every store, cheapest delivered first.",
    "Prices are refreshed twice a day.",
    "Store listings are updated hourly.",
    "The official price guide of Wizards of the Coast.",
    "MTG Compare is licensed by Wizards of the Coast.",
    "Premium unlocks card data and Scryfall images.",
    "Subscribe to see card prices.",
    "Every printing is compared in every store.",
    "We guarantee the lowest price.",
  ]) assert.ok(hit(s), `should be caught: ${s}`);
  for (const s of [
    "Best Basket's store-by-store plan for the cheapest delivered order.",
    "Compare the total cost including shipping before you buy from a new store.",
    "Every store's price, ranked by price, with delivered cost shown where the store publishes postage.",
    "eBay's fee is charged on the whole order, shipping included, so the eBay tab reads higher.",
    "Stores in six markets: Australia, the US, the UK, Singapore, Canada and the EU.",
    "MTG Compare is an independent, unofficial fan site. It is not endorsed, sponsored or approved by Wizards of the Coast, Hasbro or Scryfall.",
    "Unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards.",
    "Prices are refreshed once a day, after TCGplayer publishes its market data.",
    "Premium unlocks the Deal Finder, Rising Cards and the Demand Finder; card data and prices stay free.",
    "We do not guarantee that a store will have stock.",
  ]) assert.ok(!hit(s), `should pass: ${s}`);
});
test("RATCHET: no page, component, article or content library claims something about the site that the code does not do", () => {
  const bad: string[] = [], files = new Set<string>();
  for (const f of SCOPE) {
    const hits = findings(stripComments(fs.readFileSync(path.join(ROOT, f), "utf8")), f);
    if (hits.length) { files.add(f); bad.push(...hits.map((h) => h.replace(/^[^:]+/, f))); }
  }
  const r = ratchet("site-claims", [...files]);
  if (files.size) console.log(`site-claims: ${summary(r)}\n  ${bad.slice(0, 8).join("\n  ")}`);
  assert.ok(r.ok, `${r.failures.join("\n")}\n${bad.slice(0, 12).join("\n")}`);
});
test("the facts behind the claims: six markets, one publish a day, a weekly release", async () => {
  const { COUNTRY_LIST } = await import("../src/lib/country");
  assert.deepEqual([...COUNTRY_LIST.map((c: { code: string }) => c.code)].sort(), ["AU", "CA", "EU", "SG", "UK", "US"].sort(), "six markets");
  const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/import-prices.yml"), "utf8").replace(/^\s*#.*$/gm, "");
  const crons = [...wf.matchAll(/-\s*cron:\s*"([^"]+)"/g)].map((m) => m[1]!);
  const days = new Set(crons.map((c) => c.split(" ").slice(2).join(" ")));
  assert.ok(crons.length >= 1 && days.size === 1 && [...days][0] === "* * *", `the import runs every day (retries of the same publish are not a second price day): ${crons.join(" | ")}`);
  assert.ok(!/\*\/[0-9]+ \* \* \*/.test(crons.join(" ")), "no sub-daily price cadence in the import schedule");
});
