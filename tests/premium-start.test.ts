// Sign-in is a step inside checkout (lib/premium-start.ts, /premium/start,
// CheckoutLauncher) — RiftCompare's tests/premium-start.test.ts for MTG Compare.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { goParamToStart, parseCheckoutSelection, parseStartSrc, premiumStartHref, sanitizeBackPath, PREMIUM_START_PATH } from "../src/lib/premium-start";
import { CHECKOUT_SOON, PricingCards } from "../src/components/PricingCards";

// The components are compiled with the classic JSX transform here (tsconfig "jsx": "preserve"), which wants React in scope.
(globalThis as { React?: unknown }).React = React;

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
  // A TEST key is not open checkout (lib/stripe.ts checkoutOpen): the start step sends the visitor back to /premium's "Checkout opens soon".
  assert.match(src, /if \(!checkoutOpen\(\)\) redirect\("\/premium"\)/);
  assert.doesNotMatch(src, /stripeEnabled/);
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

// Until 2026-10-09 /premium asked only "is a Stripe key set?", and the site runs on a TEST key: two clickable buy buttons
// leading to a checkout nobody could pay. The server now decides with checkoutOpen() (a LIVE key), and the cards render
// disabled buttons with "Checkout opens soon" (PricingCards, server-rendered, exactly what a signed-out visitor first sees).
test("checkout closed: both buy buttons are disabled with 'Checkout opens soon', and nothing links to the start step", () => {
  assert.equal(CHECKOUT_SOON, "Checkout opens soon");
  const html = renderToStaticMarkup(createElement(PricingCards, { checkoutOpen: false }));
  for (const tier of ["Plus", "Premium"]) {
    assert.match(html, new RegExp(`<button type="button" disabled="" aria-describedby="checkout-soon-${tier.toLowerCase()}"[^>]*>Get ${tier}</button>`), `${tier}: a disabled button`);
    assert.match(html, new RegExp(`id="checkout-soon-${tier.toLowerCase()}"[^>]*>Checkout opens soon</p>`), `${tier}: the note under it`);
  }
  assert.doesNotMatch(html, /\/premium\/start|href="\/login/, "no link into a checkout that cannot take a payment");
  assert.doesNotMatch(html, /secure checkout by Stripe|Cancel anytime/);
  assert.match(html, /Checkout opens soon\. Nothing can be charged until it does\./);
  assert.match(html, /\$2\.99/, "the prices still show");
});

test("checkout open: the same cards link signed-out visitors to the start step, as before", () => {
  const html = renderToStaticMarkup(createElement(PricingCards, { checkoutOpen: true }));
  assert.match(html, /href="\/premium\/start\?tier=plus&amp;plan=monthly&amp;src=premium-page">Get Plus\u00a0→<\/a>/, "the &nbsp; before the arrow");
  assert.match(html, /href="\/premium\/start\?tier=premium&amp;plan=monthly&amp;src=premium-page">Get Premium\u00a0→<\/a>/);
  assert.doesNotMatch(html, /disabled=""|Checkout opens soon/);
});

test("every buy surface asks checkoutOpen() (a live key), and the checkout route refuses a test-mode checkout to everyone but an admin", () => {
  const page = code("src/app/premium/page.tsx");
  assert.match(page, /const open = checkoutOpen\(\);/);
  assert.match(page, /<PremiumPlans checkoutOpen=\{open\} billing=\{stripeEnabled\(\)\}/, "an existing subscription is still managed on a test key");
  assert.match(page, /availability: open \? "https:\/\/schema\.org\/InStock" : "https:\/\/schema\.org\/PreOrder"/);
  assert.match(code("src/app/layout.tsx"), /<PlanProvider checkoutOpen=\{checkoutOpen\(\)\}/, "the plan dialog, slide-in and annual nudge follow the same switch");
  assert.match(code("src/app/dashboard/page.tsx"), /const canUpgrade = isFree \? checkoutOpen\(\) : isPlus && checkoutOpen\(\) && !billing\.trialing;/);
  const route = code("src/app/api/premium/checkout/route.ts");
  assert.match(route, /if \(!checkoutAllowed\(stripeMode\(\), user\.isAdmin\)\) return NextResponse\.json\(\{ error: "Checkout opens soon\." \}, \{ status: 503 \}\);/);
  assert.ok(route.indexOf("checkoutAllowed(") < route.indexOf("checkout.sessions.create"), "refused before any session is created");
  assert.doesNotMatch(route, /stripeEnabled/);
  // No secret reaches the browser: the client components take a boolean.
  for (const f of ["src/components/PricingCards.tsx", "src/app/premium/PremiumPlans.tsx", "src/components/PlanDialog.tsx"]) assert.doesNotMatch(code(f), /STRIPE_SECRET_KEY|process\.env|@\/lib\/stripe"/, f);
});

test("the launch promotion stays reachable from /premium while checkout is closed: signed out, live counter, never a promise without a slot", () => {
  const cards = code("src/components/PricingCards.tsx");
  assert.match(cards, /<LaunchOffer providers=\{providers\} \/>/);
  assert.ok(cards.indexOf("<LaunchOffer") > cards.indexOf(") : ("), "only in the closed branch");
  assert.match(cards, /fetch\("\/api\/promo"\)/, "the popup's own counter");
  assert.match(cards, /if \(!signedOut \|\| !status \|\| status\.left <= 0 \|\| providers\.length === 0\) return null;/);
  assert.match(cards, /source=\{PROMO_SOURCE\}/, "the sign-up is stamped as the promotion's");
  assert.match(code("src/app/premium/page.tsx"), /providers=\{enabledProviders\(\)\}/);
  // Server-rendered (before the counter answers) it shows nothing.
  assert.doesNotMatch(renderToStaticMarkup(createElement(PricingCards, { checkoutOpen: false, providers: ["google"] })), /data-launch-offer|Launch offer/);
});
