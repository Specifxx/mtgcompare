// The store identity bridge (src/lib/stores.ts, section 9.1): every store has a hand-assigned, never-reused integer id. Owner WP04.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { STORES, RETIRED_STORE_IDS, storeById, storeByKey, sourceOfStoreId, offerUrl } from "../src/lib/stores";
import { STORE_ID } from "../src/lib/constants";

const fx = JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures/store-ids.json"), "utf8")) as { stores: { id: number; key: string; kind: string }[] };

test("ids are unique, integers in range, and registry stores start at STORE_ID.REGISTRY_MIN", () => {
  const ids = STORES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate id");
  for (const s of STORES) { assert.ok(Number.isInteger(s.id) && s.id <= STORE_ID.MAX, s.key); if (s.platform !== "feed") assert.ok(s.id >= STORE_ID.REGISTRY_MIN, `${s.key}: ${s.id}`); }
  assert.equal(new Set(STORES.map((s) => s.key)).size, STORES.length, "duplicate key");
});
test("append-only: every id of the committed fixture still names the same store, or is retired", () => {
  for (const f of fx.stores) {
    const s = storeById(f.id);
    if (s) assert.equal(s.key, f.key, `id ${f.id} was ${f.key}`);
    else assert.ok(RETIRED_STORE_IDS.includes(f.id), `id ${f.id} (${f.key}) disappeared without being retired`);
  }
  const max = Math.max(...fx.stores.map((f) => f.id));
  for (const s of STORES) if (!fx.stores.some((f) => f.id === s.id)) assert.ok(s.id > max, `a new store (${s.key}) takes max+1, not a gap: ${s.id}`);
  for (const r of RETIRED_STORE_IDS) assert.equal(storeById(r), undefined, `retired id ${r} is reused`);
});
test("lookups and URLs", () => {
  const s = STORES.find((x) => x.platform !== "feed")!;
  assert.equal(storeByKey(s.key)?.id, s.id);
  assert.equal(sourceOfStoreId(s.id), `store:${s.key}`);
  assert.equal(sourceOfStoreId(STORE_ID.TCGPLAYER_VIRTUAL), "tcgplayer");
  assert.ok(offerUrl(s.id, s.country, "/products/x")!.startsWith(s.base));
  assert.equal(offerUrl(32000, "US", "/x"), null, "an unknown (retired) id is dropped, never rendered broken");
});
test("every seed store is unverified until the production probe admits it (10.26)", () => {
  for (const s of STORES) if (fx.stores.some((f) => f.key === s.key && f.kind !== "feed")) assert.ok(s.status === "unverified" || s.verifiedAt, s.key);
});
