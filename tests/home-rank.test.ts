import { test } from "node:test";
import assert from "node:assert/strict";
import { rankHome, rankItems, valueOf, demandOf, MIN_SIGNAL } from "../src/lib/home-rank";

const today = "2026-11-18";
type It = { id: string; price: number; stock: number; rel?: string; paid?: number };
const f = (x: It) => ({ paths: [`/us/p/${x.id}`], pathSuffix: `/p/${x.id}`, clickKey: x.id, priceCents: x.price, inStock: x.stock, releaseDate: x.rel ?? null, paidRows: x.paid ?? 0 });

test("no data at all keeps the list's own order when the items are alike", () => {
  const items: It[] = ["a", "b", "c", "d"].map((id) => ({ id, price: 5000, stock: 3 }));
  assert.deepEqual(rankItems(items, f, null, { today }).map((x) => x.id), ["a", "b", "c", "d"]);
});

test("demand leads once there is enough of it; clicks weigh more than views", () => {
  const items: It[] = ["a", "b", "c"].map((id) => ({ id, price: 5000, stock: 3 }));
  const d = { views: { "/us/p/c": [40, 10] as [number, number], "/au/p/b": [30, 0] as [number, number] }, clicks: { b: [2, 1] as [number, number] } };
  assert.deepEqual(rankItems(items, f, d, { today }).map((x) => x.id), ["b", "c", "a"]);
});

test("thin data is ignored: value alone decides", () => {
  const items: It[] = [{ id: "a", price: 1000, stock: 1 }, { id: "b", price: 20000, stock: 8, paid: 2 }];
  const d = { views: { "/us/p/a": [3, 1] as [number, number] } };
  assert.ok(4 < MIN_SIGNAL);
  assert.deepEqual(rankItems(items, f, d, { today }).map((x) => x.id), ["b", "a"]);
});

test("value: in stock, paid rows, new release and price raise it; out of stock lowers it", () => {
  const base = { priceCents: 5000, inStock: 2 };
  assert.ok(valueOf({ ...base, paidRows: 2 }, today) > valueOf(base, today));
  assert.ok(valueOf({ ...base, releaseDate: "2026-11-10" }, today) > valueOf({ ...base, releaseDate: "2025-01-01" }, today));
  assert.ok(valueOf({ ...base, inStock: 0 }, today) < valueOf(base, today));
  assert.ok(valueOf({ ...base, priceCents: 30000 }, today) > valueOf(base, today));
});

test("exploration: the 4th slot goes to the best item with no demand yet", () => {
  const items: It[] = Array.from({ length: 10 }, (_, i) => ({ id: `x${i}`, price: 5000, stock: 3 }));
  const views: Record<string, [number, number]> = {};
  for (let i = 0; i < 8; i++) views[`/us/p/x${i}`] = [100 - i * 10, 5];
  const out = rankHome(items, f, { views }, { today });
  assert.equal(out[3].explore, true);
  assert.equal(out[3].views, 0);
  assert.equal(out.length, 10);
  assert.equal(new Set(out.map((r) => (r.item as It).id)).size, 10);
});

test("the off switch returns the list as it came", () => {
  const items: It[] = [{ id: "a", price: 100, stock: 0 }, { id: "b", price: 90000, stock: 9, paid: 3 }];
  assert.deepEqual(rankItems(items, f, null, { today, enabled: false }).map((x) => x.id), ["a", "b"]);
});

test("demandOf counts the 7-day window twice and matches every region by suffix once", () => {
  const d = { views: { "/us/p/a": [10, 4] as [number, number], "/au/p/a": [5, 1] as [number, number] }, clicks: { a: [1, 1] as [number, number] } };
  assert.deepEqual(demandOf({ paths: ["/us/p/a"], pathSuffix: "/p/a", clickKey: "a" }, d), [20, 2]);
});
