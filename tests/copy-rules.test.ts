// BANNED_COPY (src/lib/copy-rules.ts): the history, urgency and value claims generated copy must never make.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BANNED_COPY, findBannedCopy } from "../src/lib/copy-rules";
import { money } from "../src/lib/format";

test("BANNED_COPY: every banned phrase matches, in any case", () => {
  const banned = [
    "Price dropped overnight",
    "a price drop at Pokebox",
    "Big price drops this week",
    "PRICE CUT on booster boxes",
    "price-cut ETBs",
    "Now only A$59.95",
    "Lowest ever price",
    "lowest-ever",
    "an all-time low",
    "All time lows",
    "alltime low",
    "Booster boxes on sale",
    "below the usual price",
    "normally A$70",
    "Normally sells out",
    "Restocked today",
    "back in stock at 3 stores",
    "Back In Stock",
    "Trending now",
    "Selling fast",
    "for a limited time",
    "Limited-time offer",
    "a great investment",
    "Investments that grow",
    "the best pull rate",
    "pull rates explained",
    "Pull-rates",
    "was $49.99",
    "was A$59.95",
    "was NZ$ 80",
    "was US$24.99",
    "Was £39.99",
    "was €45,90",
    "was 45,90 €",
    "was 59.95 AUD",
    "was AUD 59.95",
    "was C$80",
    "was S$100",
    `was ${money(5995, "AU")}`,
    `was ${money(5995, "EU")}`,
    `was ${money(5995, "UK")}`,
  ];
  for (const s of banned) assert.ok(BANNED_COPY.test(s), `should be banned: ${s}`);
  // not a /g regex: test() is stateless, so the same text gives the same answer twice
  assert.equal(BANNED_COPY.flags.includes("g"), false);
  assert.ok(BANNED_COPY.test("on sale") && BANNED_COPY.test("on sale"));
  assert.equal(findBannedCopy("Cheaper than most stores — was A$59.95 last week"), "was A$59.95");
});

test("BANNED_COPY: the site's honest current-state copy passes", () => {
  const clean = [
    "Pokémon sealed cheaper than most Australian stores today",
    "Products where the cheapest in-stock price is at least 10% under the median of 3 or more Australian stores that have it, checked 3 h ago.",
    "Today's prices only: we keep no price history.",
    "18% below the median",
    "In stock · 4 stores",
    "Pre-order · out 6 Nov 2026",
    "Released 17 Jul 2026",
    "At A$7.50 a pack this is the cheapest way to buy Chaos Rising packs in Australia today (ETB A$9.80, bundle A$9.16 a pack)",
    "A booster box holds 36 booster packs.",
    "It was released on 16 September 2026.",
    "The set was 36 packs a box",
    "wasabi $5",
    "Prices exclude shipping; the store's own page is final.",
    "checked 2 h ago",
    "Saleable",
    "salesperson",
    "Dropbox",
    "price dropdown",
    "invest",
    "drop-in",
    "the box is in stock",
    "Shop Scarlet & Violet sealed on eBay",
  ];
  for (const s of clean) assert.equal(findBannedCopy(s), null, `should pass: ${s}`);
});
