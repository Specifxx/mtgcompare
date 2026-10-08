// The shared live-offer reader over a PlaneSource (contract 7.6; critique budget 5): freshness from ss/runs.json, the synthesised TCGplayer row, one reader for the site and for Actions jobs. Owner WP02.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OFFER_STALE_MS, liveOffersFrom, readLiveOffers, type StoreRegistry } from "../src/lib/offer-read";
import { fsSource } from "../src/lib/data/plane/source";
import type { OfferTuple, PxRow } from "../src/lib/data/plane/formats";
import { fsTree } from "../src/lib/data/plane/tree";
import { trackedOf, miniFull } from "./helpers/plane-tree";

const fx = JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures/store-ids.json"), "utf8")) as { stores: { id: number; key: string; kind: string }[] };
const registry: StoreRegistry = {
  sourceOfStoreId: (id) => { const s = fx.stores.find((x) => x.id === id); return s ? (s.kind === "feed" ? `feed:${s.key}` : `store:${s.key}`) : null; },
  offerUrl: (id, market, p) => { const s = fx.stores.find((x) => x.id === id); return s ? `https://${s.key}.example${p}${market === "US" ? "" : `?country=${market}`}` : null; },
};
const NOW = Date.parse("2026-10-08T09:00:00Z");
const runs = (at: string, ok: 0 | 1 = 1) => ({ v: 1 as const, at, r: [[10, 0, at, ok, 1, 1, 1, 0, 0], [11, 0, at, ok, 1, 1, 1, 0, 0]] as never });
const offers: OfferTuple[] = [[2000, 0, 10, 1000, 0, 1, "/p/1000"], [2000, 0, 11, 1100, 1, 1, "/q/1000"], [2000, 0, 999, 900, 0, 1, "/gone"], [2001, 0, 10, 5000, null, 0, "/out"], [4000, 1, 10, 1200, 0, 1, "/au"]];
const px = new Map<number, PxRow>([[1000, [1000, 1500, null, 1300, null, 0]]]);

test("a fresh run keeps inStock; a stale run or a failed run turns in-stock rows to out of stock (rows are never dropped); a retired store id drops the row", () => {
  const byUnit = (xs: ReturnType<typeof liveOffersFrom>) => xs.map((o) => `${o.productId}.${o.finish}@${o.storeId}:${o.inStock ? 1 : 0}`);
  const u2 = [{ id: 1000, finish: "N" as const }];
  assert.deepEqual(byUnit(liveOffersFrom(u2, [[1000 * 2, 0, 10, 1000, 0, 1, "/p"], [1000 * 2, 0, 11, 1100, 1, 1, "/q"], [1000 * 2, 0, 999, 900, 0, 1, "/gone"]], px, runs("2026-10-08T07:00:00Z"), { now: NOW, registry })), ["1000.N@10:1", "1000.N@11:1"], "store 999 is not in the registry: dropped");
  assert.deepEqual(byUnit(liveOffersFrom(u2, [[2000, 0, 10, 1000, 0, 1, "/p"]], px, runs("2026-10-05T07:00:00Z"), { now: NOW, registry })), ["1000.N@10:0"], "a run older than STALE_HOURS (72 h): out of stock, still returned");
  assert.deepEqual(byUnit(liveOffersFrom(u2, [[2000, 0, 10, 1000, 0, 1, "/p"]], px, runs("2026-10-08T07:00:00Z", 0), { now: NOW, registry })), ["1000.N@10:0"], "a failed run: out of stock");
  assert.deepEqual(byUnit(liveOffersFrom(u2, [[2000, 0, 10, 1000, 0, 1, "/p"]], px, null, { now: NOW, registry })), ["1000.N@10:0"], "no ss/runs.json at all: nothing is believed in stock");
  assert.equal(OFFER_STALE_MS, 72 * 3_600_000);
});
test("the unit filter, the market filter, the condition index and the url come from the tuple; the TCGplayer row is synthesised from px for the US only", () => {
  const u = [{ id: 1000, finish: "N" as const }, { id: 2000, finish: "F" as const }];
  const all = liveOffersFrom(u, [[2000, 0, 10, 1000, 2, 1, "/p/1000"], [4001, 0, 11, 7000, 0, 1, "/f"], [2000, 1, 10, 1200, 0, 1, "/au"]], px, runs("2026-10-08T07:00:00Z"), { now: NOW, registry, includeTcgplayer: true });
  assert.deepEqual(all.map((o) => [o.productId, o.finish, o.market, o.source, o.priceCents, o.condition]), [[1000, "N", "US", "store:" + fx.stores.find((s) => s.id === 10)!.key, 1000, "MP"], [2000, "F", "US", "store:" + fx.stores.find((s) => s.id === 11)!.key, 7000, "NM"], [1000, "N", "AU", "store:" + fx.stores.find((s) => s.id === 10)!.key, 1200, "NM"], [1000, "N", "US", "tcgplayer", 1300, null]]);
  assert.match(all[2]!.url, /\?country=AU$/); assert.equal(all[2]!.currency, "AUD"); assert.equal(all[3]!.storeId, 0);
  const au = liveOffersFrom(u, [[2000, 1, 10, 1200, 0, 1, "/au"]], px, runs("2026-10-08T07:00:00Z"), { now: NOW, registry, market: "AU", includeTcgplayer: true }); assert.deepEqual(au.map((o) => o.source.startsWith("store:")), [true], "no TCGplayer row in another market");
});
test("readLiveOffers reads the `of` and `px` buckets of the units and ss/runs.json from a source; an untracked unit and a missing file yield nothing and never throw", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "offer-read-")); const t = fsTree(path.join(dir, "v1")); const src0 = miniFull({ day: 2 }); for (const f of src0.files()) t.write(f, src0.read(f)); t.write("ss/runs.json", JSON.stringify(runs(new Date().toISOString())));
  try {
    const tracked = [...trackedOf({ day: 2 })].slice(0, 6).map((uid) => ({ id: Math.floor(uid / 2), finish: (uid % 2 ? "F" : "N") as "N" | "F" }));
    const live = await readLiveOffers(fsSource(dir), { units: tracked, includeTcgplayer: true, now: Date.now(), registry });
    assert.ok(live.length >= tracked.length * 2, `two store offers per tracked unit (got ${live.length})`); assert.ok(live.some((o) => o.inStock), "a fresh run keeps the offers in stock"); assert.ok(live.every((o) => tracked.some((u) => u.id === o.productId && u.finish === o.finish)));
    assert.deepEqual(await readLiveOffers(fsSource(dir), { units: [{ id: 99_999_999, finish: "N" }], registry }), [], "an unknown product has no bucket");
    fs.rmSync(path.join(dir, "v1/ss/runs.json")); const stale = await readLiveOffers(fsSource(dir), { units: tracked.slice(0, 1), registry, now: Date.now() }); assert.ok(stale.length > 0 && stale.every((o) => !o.inStock), "without ss/runs.json nothing is believed in stock");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
