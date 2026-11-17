import test from "node:test";
import assert from "node:assert/strict";
import { makeLine, addLine, type CartLine } from "../src/lib/cart-list";
import { buildCheckout, openAll } from "../src/lib/cart-checkout";

const mk = (href: string, store: string, title: string, productUrl: string): CartLine =>
  makeLine({ href, productUrl, storeName: store, title, priceCents: 5000, currency: "USD" })!;

test("lines from one Shopify store become ONE permalink; others keep their own tagged link", () => {
  let lines: CartLine[] = [];
  lines = addLine(lines, mk("https://shop.example/cart/11111111:1?utm_source=x", "Shop", "Box A", "https://shop.example/products/a?variant=11111111"));
  lines = addLine(lines, mk("https://shop.example/cart/22222222:1?utm_source=x", "Shop", "Box B", "https://shop.example/products/b?variant=22222222"));
  lines = addLine(lines, mk("https://rover.ebay.com/rover/1/x?customid=tcg-1", "eBay", "Box A", "https://www.ebay.com/itm/1"));
  lines = addLine(lines, mk("https://awin.example/cread.php?awinmid=1&ued=y", "Awin Store", "Box A", "https://awinstore.example/products/a"));
  lines = addLine(lines, lines[0]); // qty 2
  const items = buildCheckout(lines, {}, "tcgprices.app", "ref1");
  assert.equal(items.length, 3);
  const shop = items.find((i) => i.kind === "store")!;
  assert.match(shop.url, /^https:\/\/shop\.example\/cart\/11111111:2,22222222:1\?/);
  assert.equal(shop.units, 3);
  assert.equal(items.find((i) => i.storeName === "eBay")!.url, "https://rover.ebay.com/rover/1/x?customid=tcg-1");
  assert.match(items.find((i) => i.storeName === "Awin Store")!.rel, /sponsored/);
});

test("sold-out lines are left out; one click opens what the browser allows and the rest wait", () => {
  const l = mk("https://shop.example/cart/11111111:1", "Shop", "Box A", "https://shop.example/products/a?variant=11111111");
  assert.equal(buildCheckout([l], { [l.id]: { status: "soldout", priceCents: null } }, "s", "r").length, 0);
  const items = [1, 2, 3].map((n) => ({ key: String(n), storeName: "s", label: "s", url: `https://x/${n}`, kind: "line" as const, units: 1, cents: 1, currency: "USD", rel: "" }));
  // Chrome / Safari: the click is spent on the first tab, so the rest wait for the steps, and nothing blocked is ever attempted.
  const urls: string[] = [];
  let spent = false;
  const r = openAll(items, (u) => (urls.push(u), spent = true, { opener: 1 }), () => !spent);
  assert.deepEqual(urls, ["https://x/1"]);
  assert.equal(r.opened.length, 1);
  assert.equal(r.pending.length, 2);
  // Firefox with its tab allowance: every tab opens from the one click.
  const all = openAll(items, () => ({ opener: 1 }), () => true);
  assert.equal(all.opened.length, 3);
  assert.equal(all.pending.length, 0);
  // A blocker that refuses mid-way: the rest are pending, in order.
  let n = 0;
  const part = openAll(items, () => (++n === 1 ? { opener: 1 } : null), () => true);
  assert.deepEqual(part.pending.map((i) => i.key), ["2", "3"]);
});
