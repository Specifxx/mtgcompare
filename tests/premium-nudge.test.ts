// The personal nudge (lib/premium-nudge.ts): counts against the Deal Finder
// ranking, never prices; nothing to say means nothing rendered.
import test from "node:test";
import assert from "node:assert/strict";
import { buildNudge, nudgeCopy, tally, memberNudgeHref, FREE_PREVIEW_ROWS } from "../src/lib/premium-nudge";

const deals = new Map([
  [10, 1],
  [20, 2],
  [30, 9],
]);

test("tally counts watched cards in the ranking, and which sit in the free top 3", () => {
  assert.equal(FREE_PREVIEW_ROWS, 3);
  assert.deepEqual(tally([10, 30, 99], deals, new Map()), { deals: 2, dealsFree: 1, rising: 0, risingFree: 0 });
});

test("no watched card in the ranking: no nudge at all", () => {
  assert.equal(buildNudge(new Set([99]), new Set(), deals, new Map(), () => "x"), null);
  assert.equal(buildNudge(new Set(), new Set(), deals, new Map(), () => "x"), null);
});

test("the example prefers a card the free account cannot already see; the copy reveals counts, not prices", () => {
  const n = buildNudge(new Set([10, 30]), new Set(), deals, new Map(), (id) => (id === 30 ? "Trafalgar Law" : "Luffy"))!;
  assert.deepEqual(n.example, { name: "Trafalgar Law", kind: "deal", set: "watched" });
  const free = nudgeCopy(n, "watched", "free", false)!;
  assert.equal(free.heading, "2 cards you watch are underpriced right now");
  assert.match(free.line, /including Trafalgar Law/);
  assert.match(free.line, /1 is in your free top 3\./);
  assert.match(free.line, /flags one when it hits your price/, "email off: no email promise");
  assert.doesNotMatch(free.line, /\$|email/);
  const on = nudgeCopy(n, "watched", "free", true)!;
  assert.match(on.line, /can email you when one hits your price/);
  const member = nudgeCopy(n, "watched", "member")!;
  assert.doesNotMatch(member.line, /Plus shows/);
  assert.equal(memberNudgeHref("deal"), "/tools/deal-finder?mine=watch");
});
