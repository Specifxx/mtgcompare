import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// "Replacement cost" on /portfolio: RiftCompare's panel, delivered. What it pins:
//   • the headline stays an item price: the replacement figure is a separate
//     panel and never folded into "Collection value";
//   • the heavy listing read stays behind a button, scoped and rate-limited;
//   • the total is free, the store-by-store plan is Premium;
//   • the route runs the SAME optimiser as Best Basket (lib/basket.ts), over the
//     same listing reader as /api/basket's binder source: postage once per
//     store, never eBay. (The optimiser's own cases are in tests/basket*.test.ts.)

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const readCode = (p: string) => read(p).replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

test("the route: signed in, rate-limited, Premium gets the plan, and the headline value is untouched", () => {
  const route = readCode("src/app/api/portfolio/replacement/route.ts");
  assert.match(route, /rateLimit\(`replacement:\$\{user\.id\}`, 12, 3_600_000\)/);
  assert.match(route, /const full = isPremium\(user, "premium"\)/);
  assert.match(route, /\.\.\.\(full \? \{ plan \} : \{\}\)/);
  assert.match(route, /valuedCents: wanted\.reduce/);
  assert.match(route, /optimizeBasket\(basketCards, stores/);
  assert.match(route, /loadStoreListings\(/);
  assert.doesNotMatch(route, /ebay/i, "eBay is never a basket store");
  const lib = readCode("src/lib/collection-server.ts");
  assert.match(lib, /REPLACEMENT_MAX_HOLDINGS = 200/);
  // The panel runs it behind a button, and says delivered.
  const panel = readCode("src/components/PortfolioReplacementCost.tsx");
  assert.match(panel, /onClick=\{run\}/);
  assert.doesNotMatch(panel, /useEffect\(/, "never on load");
  assert.match(panel, /Total delivered/);
  // The headline is the item price; nothing adds postage to it.
  const page = readCode("src/app/portfolio/page.tsx");
  assert.match(page, /money\(portfolio\.totalCents, country\)/);
  assert.doesNotMatch(page, /shippingCents/);
});
