// Checkout attribution and the return path (lib/checkout-params.ts and the
// checkout route): the surface and `back` ride on the Session and the
// subscription, and every started checkout is a PremiumClick{source:"checkout"}.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkoutParams } from "../src/lib/checkout-params";

const base = { priceId: "price_p", tier: "plus" as const, interval: "month" as const, user: { id: "u1", email: "a@b.c", stripeCustomerId: null }, siteUrl: "https://opcompare.app" };

test("surface and back are stamped on the Session AND the subscription metadata", () => {
  const p = checkoutParams({ ...base, surface: "gate:deal-finder", back: "/card/x" });
  for (const m of [p.metadata, p.subscription_data.metadata]) {
    assert.equal(m.surface, "gate:deal-finder");
    assert.equal(m.back, "/card/x");
    assert.equal(m.kind, "oc_premium");
    assert.equal(m.site, "opcompare");
  }
  assert.equal(p.success_url, "https://opcompare.app/premium/welcome?session_id={CHECKOUT_SESSION_ID}&back=%2Fcard%2Fx");
  assert.equal(p.cancel_url, "https://opcompare.app/card/x");
});

test("without them: the plain welcome URL and a cancel back to /premium, no empty keys", () => {
  const p = checkoutParams(base);
  assert.equal(p.success_url, "https://opcompare.app/premium/welcome?session_id={CHECKOUT_SESSION_ID}");
  assert.equal(p.cancel_url, "https://opcompare.app/premium");
  assert.equal("surface" in p.metadata, false);
  assert.equal("back" in p.metadata, false);
});

test("the route validates both before Stripe sees them, and records the start", () => {
  const src = readFileSync(join(process.cwd(), "src/app/api/premium/checkout/route.ts"), "utf8");
  assert.match(src, /isPlanClickSurface\(body\.surface\)/);
  assert.match(src, /sanitizeBackPath\(body\.back\)/);
  assert.match(src, /recordCheckoutStart\(surface, tier, user\.id\)/);
  assert.doesNotMatch(src, /@\/lib\/db"/);
  const beacons = readFileSync(join(process.cwd(), "src/lib/beacons.ts"), "utf8");
  assert.match(beacons, /source: "checkout"/);
  const admin = readFileSync(join(process.cwd(), "src/app/admin/premium/page.tsx"), "utf8");
  assert.match(admin, /Started checkout by surface/);
});
