import { test } from "node:test";
import assert from "node:assert/strict";
import { cheapestStore, sealedLines, storeCoverage, storesVsTcgplayer, type ReportRow } from "../src/lib/market-report";
import type { Offer, Product } from "../src/lib/site-types";

const prod = (id: number, kind: "card" | "sealed" = "card"): Product => ({ id, slug: `p${id}`, name: `P${id}`, kind, setId: 1, number: null, rarity: null, attrs: {}, sealedType: null, image: null, tcgUrl: "", printings: [] });
const offer = (source: string, cents: number, market: Offer["market"] = "US", extra: Partial<Offer> = {}): Offer => ({ source, market, currency: market === "US" ? "USD" : "AUD", cents, inStock: true, url: "", title: "", ...extra });
const row = (id: number, ref: number | null, best: Offer[], kind: "card" | "sealed" = "card"): ReportRow => ({ p: prod(id, kind), ref, best, change30d: null });

test("cheapestStore ignores TCGplayer, eBay, Amazon, out-of-stock and pre-orders", () => {
  const best = [offer("tcgplayer", 100), offer("ebay", 90), offer("amazon", 80), offer("a", 70, "US", { inStock: false }), offer("b", 60, "US", { preorder: true }), offer("c", 150), offer("d", 140)];
  assert.equal(cheapestStore(best, "US")?.source, "d");
  assert.equal(cheapestStore(best, "AU"), null);
});

test("storesVsTcgplayer counts only USD store prices against TCGplayer, from $5", () => {
  const rows = [row(1, 1000, [offer("s", 800)]), row(2, 1000, [offer("s", 1200)]), row(3, 1000, [offer("s", 900)]), row(4, 400, [offer("s", 100)]), row(5, 1000, [offer("s", 500, "AU")])];
  assert.deepEqual(storesVsTcgplayer(rows), { compared: 3, storeCheaper: 2, medianSaving: 15 });
});

test("storeCoverage and sealedLines read each market on its own", () => {
  const rows = [row(1, 5000, [offer("s", 4500), offer("t", 7000, "AU")], "sealed"), row(2, 9000, [offer("s", 9900)], "sealed"), row(3, 100, [offer("s", 90)]), row(4, 99000, [offer("s", 90000)], "sealed"), row(5, 20000, [offer("t", 1, "AU")], "sealed")];
  rows[3].p.name = "Booster Box Case";
  assert.deepEqual(storeCoverage(rows, ["US", "AU"]), { US: 4, AU: 2 });
  const lines = sealedLines(rows, ["US", "AU"]);
  assert.deepEqual(lines.map((l) => [l.p.id, l.vsRef, l.marketsInStock]), [[2, -10, 1], [1, 10, 2]]);
});
