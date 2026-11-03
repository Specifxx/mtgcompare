import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ASK_AFTER_MS, MAX_ASKS, SNOOZE_MS, freshState, parseState, reviewsFeedUrl, shouldAsk } from "../src/lib/site-reviews";
import { SITE_REVIEWS } from "../src/lib/site-reviews-config";

// Rate us + "What people say" (owner, 2026-11-03): RiftCompare's shared
// review service keeps the ratings and reviews; this site keeps nothing.

const T0 = Date.UTC(2026, 10, 3);

test("the card never asks on arrival, only after real use", () => {
  const fresh = { ...freshState(T0), pages: 1 };
  assert.equal(shouldAsk(fresh, T0 + 1000, "/", { pages: 1 }), false);
  const used = { ...freshState(T0), pages: 4 };
  assert.equal(shouldAsk(used, T0 + ASK_AFTER_MS - 1, "/", { pages: 4 }), false, "not before three minutes");
  assert.equal(shouldAsk(used, T0 + ASK_AFTER_MS, "/", { pages: 1 }), false, "not on the first page of a visit");
  assert.equal(shouldAsk(used, T0 + ASK_AFTER_MS, "/", { pages: 2 }), true);
  assert.equal(shouldAsk({ ...freshState(T0), pages: 2 }, T0 + 5000, "/", { pages: 2, intent: true }), true, "back from a store tab");
  assert.equal(shouldAsk({ ...freshState(T0), pages: 1 }, T0 + 5000, "/", { pages: 1, intent: true }), false);
});

test("at most three asks, 14 days apart, never after rating or opting out, never on legal pages", () => {
  const used = { ...freshState(T0), pages: 9 };
  const now = T0 + ASK_AFTER_MS;
  assert.equal(shouldAsk({ ...used, asks: MAX_ASKS }, now, "/", { pages: 3 }), false);
  assert.equal(shouldAsk({ ...used, snoozedAt: now - 1000 }, now, "/", { pages: 3 }), false);
  assert.equal(shouldAsk({ ...used, snoozedAt: now - SNOOZE_MS }, now, "/", { pages: 3 }), true);
  assert.equal(shouldAsk({ ...used, rated: true }, now, "/", { pages: 3 }), false);
  assert.equal(shouldAsk({ ...used, optedOut: true }, now, "/", { pages: 3 }), false);
  for (const p of ["/privacy", "/terms", "/contact", "/admin/x"]) assert.equal(shouldAsk(used, now, p, { pages: 3 }), false, p);
  assert.deepEqual(parseState("not json", T0), freshState(T0));
});

test("ratings go to RiftCompare's shared service for this site, and nothing here stores them", () => {
  assert.match(SITE_REVIEWS.key, /^[a-z]+$/);
  assert.equal(reviewsFeedUrl(), `https://riftcompare.com/api/site-reviews/${SITE_REVIEWS.key}`);
  // No route of this site receives a rating: the form posts cross-origin.
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((f) => {
      const p = join(d, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  const form = readFileSync("src/components/site-reviews/RatingForm.tsx", "utf8");
  assert.match(form, /REVIEWS_SERVICE/);
  assert.doesNotMatch(form, /type="email"|email:/, "the form asks for no email address");
  const routes = walk("src/app").filter((p) => /route\.tsx?$/.test(p));
  for (const r of routes) assert.doesNotMatch(readFileSync(r, "utf8"), /site-reviews/, `${r} must not handle reviews`);
});
