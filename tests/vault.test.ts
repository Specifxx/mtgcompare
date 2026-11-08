import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { addItem, itemKey, lastLook, parseVault, recordDay, setItemQty, shareText, sinceAdded, totalsByMarket, valueItems, type PriceFile, type VaultItem } from "../src/lib/vault";

// My collection (competitor scan, 2026-11-08): kept in the browser, valued from /prices.json, never converted.
const base = { id: "p1", name: "Box", href: "/us/p/box", market: "US", currency: "USD", addedCents: 10000 };

test("adding twice raises the quantity; qty 0 removes", () => {
  let v: VaultItem[] = addItem([], base);
  v = addItem(v, base);
  assert.equal(v.length, 1);
  assert.equal(v[0].qty, 2);
  v = addItem(v, { ...base, market: "AU", currency: "AUD", href: "/au/p/box", addedCents: 15000 });
  assert.equal(v.length, 2, "the same product in another market is its own item");
  v = setItemQty(v, itemKey(base), 0);
  assert.deepEqual(v.map((i) => i.market), ["AU"]);
});

test("values each item in its own market and totals per market, never mixing currencies", () => {
  const v = addItem(addItem(addItem([], { ...base, qty: 2 }), { ...base, id: "p2", addedCents: 0 }), { ...base, id: "p3", market: "AU", currency: "AUD", addedCents: 5000 });
  const file: PriceFile = { products: [{ id: "p1", prices: { US: { cents: 12000 }, AU: { cents: 1 } } }, { id: "p3", prices: { AU: { cents: 4000 } } }] };
  const valued = valueItems(v, file);
  const totals = totalsByMarket(valued);
  const us = totals.find((t) => t.market === "US")!;
  assert.equal(us.nowCents, 24000);
  assert.equal(us.unpriced, 1, "p2 has no US price today");
  assert.deepEqual(sinceAdded(valued, "US"), { from: 20000, to: 24000 });
  assert.equal(totals.find((t) => t.market === "AU")!.nowCents, 4000);
  assert.match(shareText("DexCompare", "Pokémon sealed", us, sinceAdded(valued, "US")), /3 items worth .*240.* \(up 20% since I added them\)/);
});

test("the last look is the newest day before today, one entry per market and day", () => {
  const now = new Date("2026-11-08T12:00:00Z");
  let d = recordDay([], "US", 100, new Date("2026-11-01T00:00:00Z"));
  d = recordDay(d, "US", 150, new Date("2026-11-05T00:00:00Z"));
  d = recordDay(d, "US", 170, now);
  d = recordDay(d, "US", 180, now);
  assert.equal(d.filter((x) => x.d === "2026-11-08").length, 1);
  assert.deepEqual(lastLook(d, "US", now), { d: "2026-11-05", m: "US", c: 150 });
  assert.equal(lastLook(d, "AU", now), null);
});

test("stored lists are untrusted: malformed rows are dropped", () => {
  assert.deepEqual(parseVault("not json"), []);
  assert.deepEqual(parseVault(JSON.stringify([{ id: 1 }, null])), []);
  assert.equal(parseVault(JSON.stringify([{ ...base, qty: 5000, addedAt: "" }]))[0].qty, 99);
});

test("the collection page is a static, noindex shell that reads only /prices.json", () => {
  const page = fs.readFileSync("src/app/(site)/collection/page.tsx", "utf8");
  assert.match(page, /export const dynamic = "force-static";/);
  assert.match(page, /index: false/);
  const view = fs.readFileSync("src/components/vault/VaultView.tsx", "utf8");
  assert.deepEqual(view.match(/fetch\("[^"]+"/g), ['fetch("/prices.json"']);
});
