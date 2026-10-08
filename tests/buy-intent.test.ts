// P43: where the buy is, and whether it has happened yet (src/lib/buy-intent.ts), and the two small conversion components of P28
// (TierBadge, StripeErrorNotice). The popup rule is pure; the browser half is exercised with a stand-in window and sessionStorage.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BUY_CLICK_EVENT, BUY_LINKS_EVENT, buyLinksOnPage, buyPathClear, hasBoughtThisSession, markBuyClick, registerBuyLink } from "../src/lib/buy-intent";
import { checkoutErrorText, stripeUrlIn } from "../src/lib/checkout-params";
import { StripeErrorNotice } from "../src/components/StripeErrorNotice";
import { TierBadge } from "../src/components/TierBadge";

// The components are compiled with the classic JSX transform here (tsconfig "jsx": "preserve"), which wants React in scope.
(globalThis as { React?: unknown }).React = React;

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const g = globalThis as unknown as { window?: EventTarget; sessionStorage?: Storage };

/** A tab: a window that records the events it is sent, and a sessionStorage that works (or throws, as in a private window). */
function browser(storage: "ok" | "throws" = "ok"): { events: string[]; restore: () => void } {
  const had = { window: g.window, sessionStorage: g.sessionStorage };
  const events: string[] = [];
  const win = new EventTarget();
  for (const n of [BUY_CLICK_EVENT, BUY_LINKS_EVENT]) win.addEventListener(n, () => events.push(n));
  g.window = win;
  const mem = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: storage === "ok"
      ? { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
      : { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } },
  });
  return {
    events,
    restore: () => {
      if (had.window) g.window = had.window; else delete g.window;
      if (had.sessionStorage) Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: had.sessionStorage }); else delete g.sessionStorage;
    },
  };
}

test("buy links are counted on mount and uncounted on unmount, never below zero, and each unregister counts once", () => {
  const b = browser();
  try {
    assert.equal(buyLinksOnPage(), false);
    const a = registerBuyLink(), c = registerBuyLink();
    assert.equal(buyLinksOnPage(), true);
    a(); a();                                  // a double cleanup (StrictMode, a re-mount) must not steal the other link's count
    assert.equal(buyLinksOnPage(), true, "one link is still on the page");
    c();
    assert.equal(buyLinksOnPage(), false);
    assert.equal(b.events.filter((e) => e === BUY_LINKS_EVENT).length, 4, "two registers and two real unregisters announced themselves");
  } finally { b.restore(); }
});

test("a buy click is remembered for the session and announced; private mode fails to 'not bought' but still announces", () => {
  const ok = browser();
  try {
    assert.equal(hasBoughtThisSession(), false);
    markBuyClick();
    assert.equal(hasBoughtThisSession(), true);
    assert.deepEqual(ok.events, [BUY_CLICK_EVENT]);
  } finally { ok.restore(); }
  const priv = browser("throws");
  try {
    assert.equal(hasBoughtThisSession(), false, "unknown is 'not yet bought': the safe direction for buy_click");
    markBuyClick();
    assert.equal(hasBoughtThisSession(), false);
    assert.deepEqual(priv.events, [BUY_CLICK_EVENT], "a listener still hears the click");
  } finally { priv.restore(); }
  assert.doesNotThrow(() => markBuyClick(), "no window and no storage at all (server, old engine): a no-op");
  assert.equal(hasBoughtThisSession(), false);
});

test("the popup rule: a page with no buy link may be asked on; a page with one only after a buy click", () => {
  assert.equal(buyPathClear(false, false), true, "home, price guide: nothing to cover");
  assert.equal(buyPathClear(true, false), false, "a card page: stay off the buy path");
  assert.equal(buyPathClear(true, true), true, "they bought: the best moment to ask");
  assert.equal(buyPathClear(false, true), true);
});

test("the launch popup obeys the rule and the storage names are this site's", () => {
  const popup = read("src/components/LaunchPromoPopup.tsx");
  assert.match(popup, /import \{ useBuyPathClear \} from "@\/lib\/buy-intent"/);
  assert.match(popup, /const eligible = buyPathClear && promoPopupEligible\(/);
  const src = read("src/lib/buy-intent.ts");
  assert.match(src, /mc_bought_this_session/);
  assert.match(src, /"mc:buy_click"/);
  assert.doesNotMatch(src, /\brc_|\brc:|oc_|op_/, "no RiftCompare or OP key survives the port");
});

test("StripeErrorNotice links only a stripe.com address found in the message, without trailing punctuation", () => {
  const dash = "https://dashboard.stripe.com/settings/connect/platform-profile";
  assert.equal(stripeUrlIn(`Please review your platform profile at ${dash}.`), dash);
  assert.equal(stripeUrlIn(`See (${dash}), then retry`), dash);
  assert.equal(stripeUrlIn("Your card was declined."), null);
  for (const bad of ["https://evil.example/stripe.com", "https://stripe.com.evil.example/x", "http://dashboard.stripe.com/x", "https://notstripe.com/x", "javascript:alert(1)"]) assert.equal(stripeUrlIn(`Fix it at ${bad}`), null, bad);
  const html = renderToStaticMarkup(createElement(StripeErrorNotice, { message: `Complete setup: ${dash}` }));
  assert.match(html, /Open Stripe settings/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.doesNotMatch(renderToStaticMarkup(createElement(StripeErrorNotice, { message: "Your card was declined." })), /<a /);
});

test("a Stripe message that names a Dashboard step reaches an admin only; everyone else gets the generic line", () => {
  const dash = "https://dashboard.stripe.com/account";
  const boom = new Error(`In order to use Checkout, you must set an account or business name at ${dash}.`);
  assert.equal(checkoutErrorText(boom, true, "Checkout could not start."), boom.message);
  assert.equal(checkoutErrorText(boom, false, "Checkout could not start."), "Checkout could not start.", "a visitor never sees the owner's setup step");
  assert.equal(checkoutErrorText(new Error("Invalid API Key provided: sk_test_x"), true, "Checkout could not start."), "Checkout could not start.", "an admin gets only messages that carry a Dashboard link, never a key fragment");
  assert.equal(checkoutErrorText("not an Error", true, "generic"), "generic");
  for (const f of ["src/app/api/premium/checkout/route.ts", "src/app/api/premium/portal/route.ts"]) assert.match(read(f), /checkoutErrorText\(e, user\.isAdmin,/, f);
  assert.doesNotMatch(read("src/components/StripeErrorNotice.tsx"), /^"use client"/, "pure presentation: a server or a client tree may render it");
});

test("TierBadge names the plan: Free ink, Plus slate, Premium brass; children replace the label", () => {
  const badge = (tier: "plus" | "premium" | null, children?: string) => renderToStaticMarkup(createElement(TierBadge, { tier }, children));
  assert.match(badge(null), /data-tier="free"[^>]*>Free</);
  assert.match(badge("plus"), /data-tier="plus"[^>]*>Plus</);
  assert.match(badge("premium"), /data-tier="premium"[^>]*>Premium</);
  assert.match(badge("premium"), /bg-gold\/15 text-gold/);
  assert.doesNotMatch(badge(null) + badge("plus"), /text-gold/, "brass marks Premium only");
  assert.match(badge("plus", "Plus · ad-free"), />Plus · ad-free</);
});
