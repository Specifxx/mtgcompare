// Sign-in is a step inside checkout (lib/premium-start.ts, /premium/start,
// CheckoutLauncher) — RiftCompare's tests/premium-start.test.ts for MTG Compare.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { goParamToStart, parseCheckoutSelection, parseStartSrc, premiumStartHref, sanitizeBackPath, PREMIUM_START_PATH } from "../src/lib/premium-start";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("parseCheckoutSelection applies the checkout route's own rules; anything unknown is the safe default", () => {
  assert.deepEqual(parseCheckoutSelection("plus", "annual"), { tier: "plus", plan: "annual" });
  assert.deepEqual(parseCheckoutSelection("premium", "year"), { tier: "premium", plan: "annual" });
  assert.deepEqual(parseCheckoutSelection("gold", "weekly"), { tier: "premium", plan: "monthly" });
  assert.deepEqual(parseCheckoutSelection(undefined, undefined), { tier: "premium", plan: "monthly" });
  assert.equal(parseStartSrc("dialog"), "dialog");
  assert.equal(parseStartSrc("<script>"), "premium-page");
});

test("sanitizeBackPath keeps next-param's rules AND adds the funnel loop guards", () => {
  assert.equal(sanitizeBackPath("//evil.com"), null);
  assert.equal(sanitizeBackPath("https://evil.com"), null);
  assert.equal(sanitizeBackPath("/api/premium/checkout"), null);
  assert.equal(sanitizeBackPath("/\\evil.com"), null);
  assert.equal(sanitizeBackPath(null), null);
  assert.equal(sanitizeBackPath("/premium/start?tier=plus"), null);
  assert.equal(sanitizeBackPath("/premium/welcome"), null);
  assert.equal(sanitizeBackPath("/login?next=/x"), null);
  assert.equal(sanitizeBackPath("/card/counterspell-mh2-267"), "/card/counterspell-mh2-267");
  assert.equal(sanitizeBackPath("/tools/deal-finder?mine=watch"), "/tools/deal-finder?mine=watch");
});

test("premiumStartHref carries the selection and a sanitized back path", () => {
  assert.equal(premiumStartHref({ tier: "plus", plan: "annual", src: "dialog", back: "/card/x" }), `${PREMIUM_START_PATH}?tier=plus&plan=annual&src=dialog&back=%2Fcard%2Fx`);
  assert.equal(premiumStartHref({ tier: "premium", plan: "monthly", src: "premium-page", back: "//evil" }), `${PREMIUM_START_PATH}?tier=premium&plan=monthly&src=premium-page`);
});

test("the old /premium?go= links forward to the start step", () => {
  assert.equal(goParamToStart("plus-year"), `${PREMIUM_START_PATH}?tier=plus&plan=annual&src=premium-page`);
  assert.equal(goParamToStart("premium-month"), `${PREMIUM_START_PATH}?tier=premium&plan=monthly&src=premium-page`);
  assert.equal(goParamToStart("gold-week"), null);
  assert.equal(goParamToStart(null), null);
});

test("the page: signed out it IS the sign-in step (next= itself), members go to /premium, never indexed", () => {
  const src = code("src/app/premium/start/page.tsx");
  assert.match(src, /<AuthForm providers=\{enabledProviders\(\)\} bare compact[^>]*next=\{selfHref\}/);
  assert.match(src, /if \(isPremium\(user\)\) redirect\("\/premium"\)/);
  assert.match(src, /if \(!stripeEnabled\(\)\) redirect\("\/premium"\)/);
  assert.match(src, /robots: \{ index: false, follow: true \}/);
  assert.match(src, /<CheckoutLauncher/);
});

test("checkout opens from the API route only — the launcher is one session per mount", () => {
  const src = code("src/components/CheckoutLauncher.tsx");
  assert.match(src, /fetch\("\/api\/premium\/checkout"/);
  assert.match(src, /launched\.current/);
  assert.match(src, /recallPremiumSurface\(\)/);
  assert.doesNotMatch(code("src/app/premium/start/page.tsx"), /checkout\.sessions\.create/);
});

test("every signed-out buy button goes through the start step", () => {
  assert.match(code("src/components/PricingCards.tsx"), /premiumStartHref\(/);
  assert.match(code("src/components/PlanDialog.tsx"), /premiumStartHref\(/);
  assert.doesNotMatch(code("src/components/PlanDialog.tsx"), /\/login\?next=/);
  assert.doesNotMatch(code("src/components/PricingCards.tsx"), /\/login\?next=/);
});

test("the welcome page proves the session is this viewer's before confirming anything", () => {
  const src = code("src/app/premium/welcome/page.tsx");
  assert.match(src, /s\.metadata\?\.kind !== "mc_premium" \|\| ownerId !== user\.id/);
  assert.match(src, /TIER_COMPARISON\.filter/, "'Just unlocked' is derived from the table");
  assert.match(src, /Open your \$\{tierName\} tools →/);
  assert.match(src, /<PremiumActivationPoller>/);
});
