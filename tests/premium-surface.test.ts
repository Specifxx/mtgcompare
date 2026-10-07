// The surface vocabulary's wave-2 additions (lib/nudge-surface.ts) and the
// remember/recall that carries a surface into checkout (lib/premium-surface.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { isPlanClickSurface } from "../src/lib/nudge-surface";
import { isPremiumSurface, recallPremiumSurface, rememberPremiumSurface } from "../src/lib/premium-surface";

const session = new Map<string, string>();
(globalThis as unknown as Record<string, unknown>).window = {
  sessionStorage: { getItem: (k: string) => session.get(k) ?? null, setItem: (k: string, v: string) => void session.set(k, v) },
};

test("limit: surfaces (the free-limit panel) and the checklist are valid surfaces", () => {
  for (const s of ["limit:watchlist", "limit:portfolio", "gate:target-alert", "gate:target-limit", "gate:sealed-watch", "nudge:watchlist", "tip:watching", "nav:dashboard", "checklist"]) {
    assert.equal(isPlanClickSurface(s), true, s);
  }
  for (const s of ["limit:", "limit:WATCH", "exploit:x", "limit:" + "a".repeat(40)]) assert.equal(isPlanClickSurface(s), false, s);
});

test("purchase steps are never remembered as the surface that sent someone", () => {
  for (const s of ["checkout", "premium-page", "dialog"]) assert.equal(isPremiumSurface(s), false, s);
  assert.equal(isPremiumSurface("gate:deal-finder"), true);
});

test("remember then recall, validated both ways", () => {
  rememberPremiumSurface("limit:watchlist");
  assert.equal(recallPremiumSurface(), "limit:watchlist");
  rememberPremiumSurface("checkout");
  assert.equal(recallPremiumSurface(), "limit:watchlist", "a purchase step never overwrites it");
  session.set("oc_premium_surface", "<b>");
  assert.equal(recallPremiumSurface(), null, "a tampered value reads as none");
});
