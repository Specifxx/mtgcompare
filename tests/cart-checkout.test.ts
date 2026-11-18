import test from "node:test";
import assert from "node:assert/strict";
import { makeLine, addLine, type CartLine } from "../src/lib/cart-list";
import { browserKind, buildCheckout, openAll, popupSteps } from "../src/lib/cart-checkout";

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

test("sold-out lines are left out; one click opens every store or none", () => {
  const l = mk("https://shop.example/cart/11111111:1", "Shop", "Box A", "https://shop.example/products/a?variant=11111111");
  assert.equal(buildCheckout([l], { [l.id]: { status: "soldout", priceCents: null } }, "s", "r").length, 0);
  const items = [1, 2, 3].map((n) => ({ key: String(n), storeName: "s", label: "s", url: `https://x/${n}`, kind: "line" as const, units: 1, cents: 1, currency: "USD", rel: "" }));
  const mkWin = (log: string[], closed: string[]) => {
    const w = { opener: 1 as unknown, closed: false, close() { closed.push("x"); }, location: { set href(u: string) { log.push(u); }, get href() { return ""; } } };
    return w;
  };
  // Pop-ups blocked after the first tab: NOTHING stays open and nothing is visited; every store comes back pending.
  const log: string[] = [];
  const closed: string[] = [];
  let tries = 0;
  const r = openAll(items, () => (tries++ === 0 ? mkWin(log, closed) : null));
  assert.equal(r.opened.length, 0);
  assert.deepEqual(r.pending.map((i) => i.key), ["1", "2", "3"]);
  assert.equal(closed.length, 1, "the one tab that did open is closed again");
  assert.deepEqual(log, [], "no store was sent anywhere");
  // Pop-ups allowed: every tab opens from the one click and goes to its own tagged link.
  const log2: string[] = [];
  const all = openAll(items, () => mkWin(log2, []));
  assert.equal(all.opened.length, 3);
  assert.equal(all.pending.length, 0);
  assert.deepEqual(log2, ["https://x/1", "https://x/2", "https://x/3"]);
  // A throwing open is a refusal.
  assert.equal(openAll(items, () => { throw new Error("x"); }).pending.length, 3);
});

test("pop-up help names the right browser and the site", () => {
  assert.equal(browserKind("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36"), "chrome");
  assert.equal(browserKind("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/157.0 Safari/537.36 Edg/157.0"), "chrome");
  assert.equal(browserKind("Mozilla/5.0 (Windows NT 10.0; rv:130.0) Gecko/20100101 Firefox/130.0"), "firefox");
  assert.equal(browserKind("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"), "safari");
  assert.equal(browserKind("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"), "ios");
  assert.equal(browserKind("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/120.0 Mobile/15E148 Safari/604.1"), "ios");
  assert.equal(browserKind("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36"), "android");
  assert.match(popupSteps("chrome", "tcgprices.app").join(" "), /Always allow pop-ups and redirects from tcgprices\.app/);
  assert.match(popupSteps("firefox", "tcgprices.app").join(" "), /Allow pop-ups for tcgprices\.app/);
  assert.match(popupSteps("safari", "x.app").join(" "), /Pop-up Windows to Allow/);
});
