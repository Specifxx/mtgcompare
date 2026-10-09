// Accounts, Stripe entitlement and the paid tiers (ported from RiftCompare's
// premium-entitlement / premium-tiers / checkout-params / oauth-next tests).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { planBasket } from "../src/lib/basket";
import { checkoutParams } from "../src/lib/checkout-params";
import { sanitizeNextPath } from "../src/lib/next-param";
import { normaliseProfile } from "../src/lib/oauth";
import { dealAccess, lookupKey, PLAN_CENTS } from "../src/lib/plans";
import { accessFor, rowLimit } from "../src/lib/premium-gates";
import { isEntitlement, viewerOf } from "../src/lib/data/plane/entitlement";
import { entitlementOf, entitlementOfRead, isPremium, tierOf } from "../src/lib/premium";
import {
  entitledUntilFromSubscription,
  extendedPremiumUntil,
  isOurSubscription,
  periodEndFromSubscription,
  subscriptionIdFromInvoice,
  tierOfSubscription,
} from "../src/lib/stripe-entitlement";
import { checkoutAllowed, checkoutOpen, stripeEnabled, stripeModeOf } from "../src/lib/stripe";

const T = 1_900_000_000; // epoch seconds
const price = (tier: string, site = "mtgcompare") => ({ id: "price_1", metadata: { site, tier } });

test("invoices name their subscription in both payload generations", () => {
  assert.equal(subscriptionIdFromInvoice({ subscription: "sub_old" }), "sub_old");
  assert.equal(subscriptionIdFromInvoice({ subscription: { id: "sub_obj" } }), "sub_obj");
  assert.equal(subscriptionIdFromInvoice({ parent: { subscription_details: { subscription: "sub_basil" } } }), "sub_basil");
  assert.equal(subscriptionIdFromInvoice({ lines: { data: [{ parent: { subscription_item_details: { subscription: "sub_line" } } }] } }), "sub_line");
  assert.equal(subscriptionIdFromInvoice({ lines: { data: [] } }), null);
});

test("the period end is read from the subscription or its items", () => {
  assert.equal(periodEndFromSubscription({ current_period_end: T })?.getTime(), T * 1000);
  assert.equal(periodEndFromSubscription({ items: { data: [{ current_period_end: T - 10 }, { current_period_end: T }] } })?.getTime(), T * 1000);
  assert.equal(periodEndFromSubscription({}), null);
});

test("only active and trialing subscriptions earn time; past_due never does", () => {
  const sub = (status: string) => ({ status, items: { data: [{ current_period_end: T, price: price("plus") }] } });
  assert.ok(entitledUntilFromSubscription(sub("active")));
  assert.ok(entitledUntilFromSubscription(sub("trialing")));
  for (const s of ["past_due", "canceled", "unpaid", "incomplete", "incomplete_expired"]) assert.equal(entitledUntilFromSubscription(sub(s)), null, s);
});

test("stamping is extend-only", () => {
  const later = new Date(T * 1000);
  const earlier = new Date(T * 1000 - 86400000);
  assert.equal(extendedPremiumUntil(null, later), later);
  assert.equal(extendedPremiumUntil(earlier, later), later);
  assert.equal(extendedPremiumUntil(later, earlier), null);
  assert.equal(extendedPremiumUntil(later, later), null);
  assert.equal(extendedPremiumUntil(earlier, null), null);
});

test("only MTG Compare's subscriptions count, and the live Price names the tier", () => {
  assert.equal(isOurSubscription({ items: { data: [{ price: price("plus") }] } }), true);
  assert.equal(isOurSubscription({ metadata: { site: "mtgcompare" }, items: { data: [{ price: "price_x" }] } }), true);
  // RiftCompare's (or anything else's) subscription in the same account: ignored.
  assert.equal(isOurSubscription({ metadata: { userId: "u1", kind: "premium" }, items: { data: [{ price: { id: "p", metadata: {} } }] } }), false);
  assert.equal(tierOfSubscription({ items: { data: [{ price: price("plus") }] }, metadata: { tier: "premium" } }), "plus");
  assert.equal(tierOfSubscription({ items: { data: [{ price: "price_x" }] }, metadata: { tier: "plus" } }), "plus");
  assert.equal(tierOfSubscription({}), "premium");
});

test("tiers: admins are Premium, an expired date is nothing, Plus is below Premium", () => {
  const now = T * 1000;
  const future = new Date(now + 86400000);
  assert.equal(tierOf({ isAdmin: true, premiumUntil: null, premiumTier: "plus" }, now), "premium");
  // An admin whose Plus has lapsed still reads as Premium (admin port).
  assert.equal(tierOf({ isAdmin: true, premiumUntil: new Date(now - 1), premiumTier: "plus" }, now), "premium");
  assert.equal(tierOf({ isAdmin: false, premiumUntil: new Date(now - 1), premiumTier: "premium" }, now), null);
  assert.equal(isPremium({ isAdmin: false, premiumUntil: future, premiumTier: "plus" }, "plus", now), true);
  assert.equal(isPremium({ isAdmin: false, premiumUntil: future, premiumTier: "plus" }, "premium", now), false);
  assert.equal(isPremium({ isAdmin: false, premiumUntil: future, premiumTier: "premium" }, "premium", now), true);
  assert.equal(isPremium(null), false);
});

test("Deal Finder: nothing signed out, three rows free, everything with a plan", () => {
  assert.equal(dealAccess(false, null), "none");
  assert.equal(dealAccess(true, null), "top3");
  assert.equal(dealAccess(true, "plus"), "full");
  assert.equal(dealAccess(true, "premium"), "full");
});

test("entitlementOf mints the opaque Entitlement from the stored date, never from anything a request can say", () => {
  const now = T * 1000;
  const future = new Date(now + 86400000);
  const user = (o: { isAdmin?: boolean; until?: Date | null; tier?: string }) => ({ isAdmin: o.isAdmin ?? false, premiumUntil: o.until ?? null, premiumTier: o.tier ?? "premium" });
  const access = (u: ReturnType<typeof user> | null, f: "deal-finder" | "rising" | "demand") => accessFor(f, viewerOf(entitlementOf(u, now)));
  // signed out, or a failed read of the user (null): the narrowest end of every gate, never Premium
  assert.deepEqual(["deal-finder", "rising", "demand"].map((f) => access(null, f as "rising")), ["none", "none", "preview"]);
  assert.deepEqual(["deal-finder", "rising", "demand"].map((f) => access(undefined as never, f as "rising")), ["none", "none", "preview"]);
  // a free account, Plus, Premium, an admin: the matrix of 14.3
  const free = user({});
  assert.deepEqual(["deal-finder", "rising", "demand"].map((f) => access(free, f as "rising")), ["preview", "preview", "preview"]);
  const plus = user({ until: future, tier: "plus" });
  assert.deepEqual(["deal-finder", "rising", "demand"].map((f) => access(plus, f as "rising")), ["full", "preview", "preview"]);
  const premium = user({ until: future, tier: "premium" });
  assert.deepEqual(["deal-finder", "rising", "demand"].map((f) => access(premium, f as "rising")), ["full", "full", "full"]);
  assert.deepEqual(["deal-finder", "rising", "demand"].map((f) => access(user({ isAdmin: true }), f as "rising")), ["full", "full", "full"], "an admin counts as Premium");
  // a lapsed entitlement is nothing; the rows follow from premium-gates, not from a second rule here
  assert.equal(access(user({ until: new Date(now - 1), tier: "premium" }), "rising"), "preview");
  assert.equal(rowLimit("rising", access(plus, "rising"), viewerOf(entitlementOf(plus, now))), 3);
  assert.ok(isEntitlement(entitlementOf(null)));
});

test("a failed read of the user is a signed-out viewer, never Premium and never an error", async () => {
  const now = T * 1000;
  const premium = { isAdmin: false, premiumUntil: new Date(now + 86400000), premiumTier: "premium" };
  const boom = async () => { throw new Error("Neon is down"); };
  for (const f of ["deal-finder", "rising", "demand"] as const) {
    assert.equal(accessFor(f, viewerOf(await entitlementOfRead(boom, now))), accessFor(f, viewerOf(entitlementOf(null))), f);
    assert.equal(accessFor(f, viewerOf(await entitlementOfRead(async () => null, now))), accessFor(f, { signedIn: false, tier: null }), f);
    assert.equal(accessFor(f, viewerOf(await entitlementOfRead(async () => premium, now))), "full", f);
  }
  assert.equal(accessFor("rising", viewerOf(await entitlementOfRead(boom, now))), "none", "not even the free preview: signed out reads as signed out");
  assert.match(fs.readFileSync(path.resolve(__dirname, "../src/lib/auth.ts"), "utf8"), /entitlementOfRead\(getCurrentUser\)/, "the session's Entitlement is the guarded read");
  assert.equal(isEntitlement({ tier: "premium", viewer: { signedIn: true, tier: "premium" } }), false, "a plain object is not an Entitlement");
});

test("?next= stays on this site and off the API", () => {
  for (const ok of ["/premium?go=plus-year", "/card/counterspell-mh2-267", "/account"]) assert.equal(sanitizeNextPath(ok), ok);
  for (const bad of ["//evil.com", "/\\evil.com", "/\t/evil.com", "https://evil.com", "/api/me", "", null, "premium"]) assert.equal(sanitizeNextPath(bad as string), null, String(bad));
});

test("only a provider-verified email is trusted", () => {
  assert.equal(normaliseProfile("google", { sub: "1", email: "A@B.com", email_verified: "true" }).emailVerified, true);
  assert.equal(normaliseProfile("google", { sub: "1", email: "a@b.com" }).emailVerified, false);
  assert.equal(normaliseProfile("google", { sub: "1", email: "A@B.com" }).email, "a@b.com");
  assert.equal(normaliseProfile("discord", { id: "9", email: "x@y.z", verified: false }).emailVerified, false);
  assert.equal(normaliseProfile("discord", { id: "9", avatar: "abc" }).avatar, "https://cdn.discordapp.com/avatars/9/abc.png");
});

test("the checkout session carries the site, the user and the tier", () => {
  const base = { priceId: "price_p", tier: "plus" as const, interval: "year" as const, siteUrl: "https://mtgcompare.app" };
  const a = checkoutParams({ ...base, user: { id: "u1", email: "a@b.c", stripeCustomerId: null } });
  assert.equal(a.mode, "subscription");
  assert.deepEqual(a.line_items, [{ price: "price_p", quantity: 1 }]);
  assert.equal((a as { customer_email?: string }).customer_email, "a@b.c");
  assert.equal(a.client_reference_id, "u1");
  assert.deepEqual(a.subscription_data.metadata, { site: "mtgcompare", kind: "mc_premium", userId: "u1", tier: "plus", interval: "year" });
  assert.equal(a.success_url, "https://mtgcompare.app/premium/welcome?session_id={CHECKOUT_SESSION_ID}");
  const b = checkoutParams({ ...base, user: { id: "u1", email: "a@b.c", stripeCustomerId: "cus_1" } });
  assert.equal((b as { customer?: string }).customer, "cus_1");
  assert.equal((b as { customer_email?: string }).customer_email, undefined);
});

test("prices: RiftCompare's, and each tier × interval has its own lookup key", () => {
  assert.deepEqual(PLAN_CENTS, { plus: { month: 299, year: 2399 }, premium: { month: 499, year: 3999 } });
  assert.equal(new Set(["plus", "premium"].flatMap((t) => ["month", "year"].map((i) => lookupKey(t as "plus", i as "month")))).size, 4);
});

test("Best Basket: the cheapest split beats buying each card where it is cheapest once postage counts", () => {
  const flat = (cents: number) => ({ name: "", postage: () => ({ cents, label: "Standard", tracked: true, basis: "measured" as const, free: false, upTo: false }) });
  const stores = { x: { ...flat(500), name: "X" }, y: { ...flat(500), name: "Y" } };
  const { plan, alternatives } = planBasket(
    [
      { cardId: "1", name: "A", slug: "a", qty: 1, listings: [{ retailer: "x", priceCents: 100, url: "https://x.example/a" }, { retailer: "y", priceCents: 120, url: "https://y.example/a" }] },
      { cardId: "2", name: "B", slug: "b", qty: 1, listings: [{ retailer: "y", priceCents: 200, url: "https://y.example/b" }] },
    ],
    stores,
  );
  assert.equal(plan.storeCount, 1); // both from Y: 320 + 500 postage, not 300 + 1000
  assert.equal(plan.totalCents, 820);
  assert.equal(plan.naiveTotalCents, 1300);
  assert.equal(alternatives.singleStore?.stores[0].key, "y");
});

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "..", p), "utf8");

test("the session is never read by the layout, and the three paid pages take their rows from the gate module", () => {
  assert.doesNotMatch(read("src/app/layout.tsx"), /getCurrentUser|@\/lib\/auth/);
  // One gate (src/lib/premium-gates.ts): a page computes accessFor() and asks its loader for rowLimit() rows; the loader cuts the
  // ranking once more with the opaque Entitlement. tests/premium-gates-pages.test.ts walks the same pages for the rest.
  for (const page of ["deal-finder", "rising", "demand"]) {
    const src = read(`src/app/tools/${page}/page.tsx`);
    assert.match(src, /from "@\/lib\/premium-gates"/, `${page} imports the gate module`);
    assert.doesNotMatch(src, /blur-/, `${page}: rows are limited in the query, never hidden with CSS`);
  }
  assert.match(read("src/app/api/basket/route.ts"), /isPremium\(user, "premium"\)/);
});

test("the proof line and the proof route agree on the count's key", () => {
  const root = path.resolve(__dirname, "..");
  const route = fs.readFileSync(path.join(root, "src/app/api/premium/proof/route.ts"), "utf8");
  const line = fs.readFileSync(path.join(root, "src/components/PremiumProofLine.tsx"), "utf8");
  // The route answers {country, deals, dealCount}; the consumer reads `deals`
  // (falling back to `dealCount`), so neither side can drift alone.
  assert.match(route, /deals: dealCountValue/);
  assert.match(line, /\.deals \?\? o\.dealCount/);
});

// MTG Compare runs on a Stripe TEST key until the owner takes payments (docs/SETUP.md section 6). Until 2026-10-09 every buy
// surface asked only "is a key set?", so /premium showed clickable Get Plus / Get Premium buttons that opened a test-mode
// checkout: nobody could pay, and a test card (4242 ...) would have bought a real entitlement through the webhook.
// The key's own prefix decides now. The fake keys below are short on purpose: real key formats trip secret scanners.
test("the Stripe mode is read from the key's prefix: sk_/rk_ live or test, nothing else counts as live", () => {
  assert.equal(stripeModeOf("sk_test_FAKE"), "test");
  assert.equal(stripeModeOf("rk_test_FAKE"), "test", "a restricted test key");
  assert.equal(stripeModeOf("sk_live_FAKE"), "live");
  assert.equal(stripeModeOf("rk_live_FAKE"), "live", "a restricted live key");
  assert.equal(stripeModeOf("  sk_live_FAKE\n"), "live", "a pasted key's whitespace is not part of it");
  assert.equal(stripeModeOf(undefined), "off");
  assert.equal(stripeModeOf(""), "off");
  assert.equal(stripeModeOf("pk_test_FAKE"), "unknown", "a publishable key in the secret's place is not a live checkout");
  assert.equal(stripeModeOf("pk_live_FAKE"), "unknown");
  assert.equal(stripeModeOf("whsec_FAKE"), "unknown");
  assert.equal(stripeModeOf("SK_LIVE_FAKE"), "unknown", "Stripe's prefixes are lower case");
});

test("a new checkout opens to everyone only on a live key; a test key admits an admin only; no key or a strange one, no one", () => {
  assert.equal(checkoutAllowed("live", false), true);
  assert.equal(checkoutAllowed("live", true), true);
  assert.equal(checkoutAllowed("test", false), false, "a visitor never reaches a test-mode checkout");
  assert.equal(checkoutAllowed("test", true), true, "the owner can still test the flow");
  for (const m of ["off", "unknown"] as const) {
    assert.equal(checkoutAllowed(m, false), false, m);
    assert.equal(checkoutAllowed(m, true), false, m);
  }
});

test("checkoutOpen() follows STRIPE_SECRET_KEY: closed on the test key, open on the live one; billing for an existing subscription only needs a key", () => {
  const saved = process.env.STRIPE_SECRET_KEY;
  try {
    process.env.STRIPE_SECRET_KEY = "sk_test_FAKE";
    assert.equal(checkoutOpen(), false);
    assert.equal(stripeEnabled(), true, "the portal and plan changes of an existing (test) subscription keep working");
    process.env.STRIPE_SECRET_KEY = "sk_live_FAKE";
    assert.equal(checkoutOpen(), true, "it switches itself on when the live key arrives");
    delete process.env.STRIPE_SECRET_KEY;
    assert.equal(checkoutOpen(), false);
    assert.equal(stripeEnabled(), false);
  } finally {
    if (saved === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = saved;
  }
});
