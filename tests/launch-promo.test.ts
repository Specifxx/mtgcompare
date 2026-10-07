import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  PROMO_DAYS,
  PROMO_MAX_DISMISSALS,
  PROMO_MIN_VIEWS,
  PROMO_SKIP_PATHS,
  PROMO_SLOTS,
  promoLeft,
  promoPopupEligible,
  promoStatus,
} from "../src/lib/launch-promo-shared";

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the offer is the first 50 accounts, 30 days", () => {
  assert.equal(PROMO_SLOTS, 50);
  assert.equal(PROMO_DAYS, 30);
});

test("promoLeft and promoStatus never go negative or past the cap", () => {
  assert.equal(promoLeft(0), 50);
  assert.equal(promoLeft(37), 13);
  assert.equal(promoLeft(50), 0);
  assert.equal(promoLeft(51), 0);
  assert.equal(promoLeft(-3), 50);
  assert.equal(promoLeft(Number.NaN), 50);
  assert.deepEqual(promoStatus(12), { slots: 50, claimed: 12, left: 38, days: 30 });
  assert.deepEqual(promoStatus(999), { slots: 50, claimed: 50, left: 0, days: 30 });
});

const base = { loaded: true, signedIn: false, left: 20, views: PROMO_MIN_VIEWS, pathname: "/browse" };

test("the popup shows to a signed-out visitor from the second page view", () => {
  assert.equal(promoPopupEligible(base), true);
  assert.equal(promoPopupEligible({ ...base, views: PROMO_MIN_VIEWS - 1 }), false);
});

test("the popup never shows to a signed-in account, before /api/me answers, or once the 50 are gone", () => {
  assert.equal(promoPopupEligible({ ...base, signedIn: true }), false);
  assert.equal(promoPopupEligible({ ...base, loaded: false }), false);
  assert.equal(promoPopupEligible({ ...base, left: 0 }), false);
  assert.equal(promoPopupEligible({ ...base, left: null }), true, "unknown counter: still allowed to fetch it");
});

test("the popup skips sign-in, account and legal pages by whole path segment", () => {
  for (const p of PROMO_SKIP_PATHS) {
    assert.equal(promoPopupEligible({ ...base, pathname: p }), false, p);
    assert.equal(promoPopupEligible({ ...base, pathname: `${p}/x` }), false, `${p}/x`);
  }
  assert.equal(promoPopupEligible({ ...base, pathname: "/cards" }), true, "/c must not swallow /cards");
  assert.equal(promoPopupEligible({ ...base, pathname: null }), false);
  assert.equal(PROMO_MAX_DISMISSALS, 3);
});

test("the grant is atomic, capped, in one transaction and extend-only", () => {
  const src = read("src/lib/launch-promo.ts");
  assert.match(src, /\$transaction/);
  assert.match(src, /ON CONFLICT \("key"\) DO UPDATE SET "value" = "Counter"\."value" \+ 1\s+WHERE "Counter"\."value" < \$\{PROMO_SLOTS\}/);
  assert.match(src, /grantedUntil\(user\.premiumUntil, PROMO_DAYS, now\)/);
  const code = src.replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /stripe/i, "the promo never touches Stripe");
});

test("only upsertOAuthUser claims a slot, and only for the row it just created", () => {
  const users = fs
    .readdirSync(new URL("../src", import.meta.url), { recursive: true })
    .map(String)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .filter((f) => read(`src/${f}`).includes("claimLaunchPromo"))
    .sort();
  assert.deepEqual(users, ["lib/accounts.ts", "lib/launch-promo.ts"]);
  const accounts = read("src/lib/accounts.ts");
  const afterCreate = accounts.slice(accounts.indexOf("prisma.user.create"));
  assert.match(afterCreate, /claimLaunchPromo\(created\.id\)/);
  assert.equal((accounts.match(/claimLaunchPromo\(/g) ?? []).length, 1);
});

test("the popup is client-only, mounted once in the layout, and reads the counter through /api/promo", () => {
  const popup = read("src/components/LaunchPromoPopup.tsx");
  assert.match(popup, /fetch\("\/api\/promo"\)/);
  assert.doesNotMatch(popup, /from "@\/lib\/db"|from "@\/lib\/launch-promo"/);
  const layout = read("src/app/layout.tsx");
  assert.equal((layout.match(/<LaunchPromoPopup/g) ?? []).length, 1);
  assert.match(read("src/app/api/promo/route.ts"), /getLaunchPromo/);
});

test("a closed, aria-hidden nav menu never reads as an open dialog (it silenced every corner nudge)", () => {
  const src = read("src/lib/nudge-runtime.ts");
  assert.match(src, /closest\('\[aria-hidden="true"\], \[inert\]'\)/);
});
