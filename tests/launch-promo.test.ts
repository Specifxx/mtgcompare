import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  PROMO_DAYS,
  PROMO_MAX_DISMISSALS,
  PROMO_MIN_VIEWS,
  PROMO_SKIP_PATHS,
  PROMO_SLOTS,
  promoLeft,
  promoPopupEligible,
  promoStatus,
} from "../src/lib/launch-promo-shared";

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the offer is the first 50 accounts, 30 days", () => {
  assert.equal(PROMO_SLOTS, 50);
  assert.equal(PROMO_DAYS, 30);
});

test("promoLeft and promoStatus never go negative or past the cap", () => {
  assert.equal(promoLeft(0), 50);
  assert.equal(promoLeft(37), 13);
  assert.equal(promoLeft(50), 0);
  assert.equal(promoLeft(51), 0);
  assert.equal(promoLeft(-3), 50);
  assert.equal(promoLeft(Number.NaN), 50);
  assert.deepEqual(promoStatus(12), { slots: 50, claimed: 12, left: 38, days: 30 });
  assert.deepEqual(promoStatus(999), { slots: 50, claimed: 50, left: 0, days: 30 });
});

const base = { loaded: true, signedIn: false, left: 20, views: PROMO_MIN_VIEWS, pathname: "/browse" };

test("the popup shows to a signed-out visitor from the second page view", () => {
  assert.equal(promoPopupEligible(base), true);
  assert.equal(promoPopupEligible({ ...base, views: PROMO_MIN_VIEWS - 1 }), false);
});

test("the popup never shows to a signed-in account, before /api/me answers, or once the 50 are gone", () => {
  assert.equal(promoPopupEligible({ ...base, signedIn: true }), false);
  assert.equal(promoPopupEligible({ ...base, loaded: false }), false);
  assert.equal(promoPopupEligible({ ...base, left: 0 }), false);
  assert.equal(promoPopupEligible({ ...base, left: null }), true, "unknown counter: still allowed to fetch it");
});

test("the popup skips sign-in, account and legal pages by whole path segment", () => {
  for (const p of PROMO_SKIP_PATHS) {
    assert.equal(promoPopupEligible({ ...base, pathname: p }), false, p);
    assert.equal(promoPopupEligible({ ...base, pathname: `${p}/x` }), false, `${p}/x`);
  }
  assert.equal(promoPopupEligible({ ...base, pathname: "/cards" }), true, "/c must not swallow /cards");
  assert.equal(promoPopupEligible({ ...base, pathname: null }), false);
  assert.equal(PROMO_MAX_DISMISSALS, 3);
});

test("the grant is atomic, capped, in one transaction and extend-only", () => {
  const src = read("src/lib/launch-promo.ts");
  assert.match(src, /\$transaction/);
  assert.match(src, /ON CONFLICT \("key"\) DO UPDATE SET "value" = "Counter"\."value" \+ 1\s+WHERE "Counter"\."value" < \$\{PROMO_SLOTS\}/);
  assert.match(src, /grantedUntil\(user\.premiumUntil, PROMO_DAYS, now\)/);
  const code = src.replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /stripe/i, "the promo never touches Stripe");
});

test("only upsertOAuthUser claims a slot, and only for the row it just created", () => {
  const users = fs
    .readdirSync(new URL("../src", import.meta.url), { recursive: true })
    .map(String)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .filter((f) => read(`src/${f}`).includes("claimLaunchPromo"))
    .sort();
  assert.deepEqual(users, ["lib/accounts.ts", "lib/launch-promo.ts"]);
  const accounts = read("src/lib/accounts.ts");
  const afterCreate = accounts.slice(accounts.indexOf("prisma.user.create"));
  assert.match(afterCreate, /claimLaunchPromo\(created\.id\)/);
  assert.equal((accounts.match(/claimLaunchPromo\(/g) ?? []).length, 1);
});

test("the popup is client-only, mounted once in the layout, and reads the counter through /api/promo", () => {
  const popup = read("src/components/LaunchPromoPopup.tsx");
  assert.match(popup, /fetch\("\/api\/promo"\)/);
  assert.doesNotMatch(popup, /from "@\/lib\/db"|from "@\/lib\/launch-promo"/);
  const layout = read("src/app/layout.tsx");
  assert.equal((layout.match(/<LaunchPromoPopup/g) ?? []).length, 1);
  assert.match(read("src/app/api/promo/route.ts"), /getLaunchPromo/);
});

test("a closed, aria-hidden nav menu never reads as an open dialog (it silenced every corner nudge)", () => {
  const src = read("src/lib/nudge-runtime.ts");
  assert.match(src, /closest\('\[aria-hidden="true"\], \[inert\]'\)/);
});

// ── src/lib/data/site.ts: the launch promotion's counter and the other site-wide facts (owner WP18) ──────────────────────────────────────────
// Store sizes are the probe's collection counts (stores-brief, store-probe-results.json: rhysticnostalgiagaming 113,011, goodgames 114,004, mysterymtg 2,316);
// the catalogue counts are the contract's (98,991 listed rows, 98,796 of them class-0 singles priced in the US).
import { MARKETS } from "../src/lib/country";
import { homeStatsFrom } from "../src/lib/home";
import { MIN_REVIEWS_TO_DISPLAY, siteStatsFrom, tcgplayerRow } from "../src/lib/data/site";

const CAT = { pricedByMarket: { US: 98_796, AU: 0, UK: 0, SG: 0, CA: 0, EU: 0 }, pricesAt: "2026-10-07T20:06:09Z" };
const RUNS = [
  { source: "store:rhysticnostalgiagaming", market: "AU", offers: 113_011, inStock: 113_011 },
  { source: "store:goodgames", market: "AU", offers: 114_004, inStock: 0 },
  { source: "store:mysterymtg", market: "US", offers: 2_316, inStock: 2_316 },
  { source: "ebay", market: "US", offers: 40, inStock: 40 },
];

test("site stats: the published store rows plus TCGplayer as the US store, never eBay, stamped with the publish time", () => {
  const s = siteStatsFrom(RUNS, CAT, "2026-10-08T07:41:00Z");
  assert.deepEqual(s.storeOffers.map((r) => `${r.source}|${r.market}`), ["store:rhysticnostalgiagaming|AU", "store:goodgames|AU", "store:mysterymtg|US", "tcgplayer|US"]);
  assert.deepEqual(tcgplayerRow(CAT), { source: "tcgplayer", market: "US", offers: 98_796, inStock: 98_796 });
  assert.equal(s.lastImportAt, "2026-10-08T07:41:00Z");
  assert.equal(siteStatsFrom(RUNS, CAT, null).lastImportAt, CAT.pricesAt, "no status.json: the price day of the catalogue counts");
  assert.equal(siteStatsFrom([], { pricedByMarket: CAT.pricedByMarket, pricesAt: "" }, null).lastImportAt, null);
});

test("home stats count a store only while it has stock, TCGplayer counts once in the US, and the hero numbers come from the published counts", () => {
  const s = siteStatsFrom(RUNS, CAT, "2026-10-08T07:41:00Z");
  const h = homeStatsFrom(s.storeOffers, CAT.pricedByMarket, 98_991, s.lastImportAt);
  assert.equal(h.totalCards, 98_991);
  assert.deepEqual(Object.fromEntries(MARKETS.map((m) => [m, h.statsByCountry[m].stores])), { US: 2, AU: 1, UK: 0, SG: 0, CA: 0, EU: 0 }, "mysterymtg + TCGplayer in the US; rhysticnostalgiagaming in AU (goodgames has no stock)");
  assert.equal(h.statsByCountry.US.inStock, 2_316 + 98_796, "eBay is not a store and adds nothing");
  assert.equal(h.liveStoresAll, 3, "mysterymtg, rhysticnostalgiagaming (goodgames has no stock) and TCGplayer; the same store in two markets would count once");
  assert.equal(h.updatedAt, "2026-10-08T07:41:00Z");
});

test("the three Neon bits fail quiet and never store a failure; the reviews strip needs three; no plane module is imported here", () => {
  assert.equal(MIN_REVIEWS_TO_DISPLAY, 3);
  const src = read("src/lib/data/site.ts");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /from "\.\/plane|@\/lib\/data\/plane/, "a module that reads the plane may not hold an unstable_cache (nested-cache RULE 5)");
  assert.match(code, /loadEbayLive\(\)\.catch\(\(\) => false\)/, "Neon down: ebayLive false");
  assert.match(code, /catch \{\s*return \[\];/, "Neon down: no reviews");
  assert.match(code, /catch \{\s*return promoStatus\(PROMO_SLOTS\);/, "Neon down or unreadable counter: none left, so the popup hides");
  assert.match(code, /select: \{ id: true, rating: true, message: true, displayName: true \}/, "never widen the reviews select to the reply email");
  assert.doesNotMatch(code, /email/);
});
