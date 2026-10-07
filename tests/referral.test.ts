// Referral capture and the (off-by-default) reward (lib/referral.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { referralCandidate } from "../src/lib/referral";
import { REFERRAL_COOKIE } from "../src/lib/referral-cookie";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("there is no referral reward: no entitlement writer, no env switch, no profile card", () => {
  const src = read("src/lib/referral.ts");
  assert.doesNotMatch(src, /REFERRAL_PREMIUM_DAYS|grantReferralDays|premiumUntil:|prisma/);
  assert.doesNotMatch(read("src/lib/admin-billing.ts"), /grantReferralDays|REFERRAL_PREMIUM_DAYS/);
  assert.doesNotMatch(read("src/app/profile/page.tsx"), /ReferralLinkCard|referralPremiumDays/);
  // premiumUntil keeps its writers (CLAUDE.md): nothing under the OAuth routes sets it.
  assert.doesNotMatch(read("src/app/api/auth/oauth/[provider]/callback/route.ts"), /premiumUntil|premiumTier/);
});

test("self-referral and junk codes are ignored before any lookup", () => {
  assert.equal(referralCandidate("cmabc12345", "cmabc12345"), null, "an account cannot refer itself");
  assert.equal(referralCandidate("../../etc", "u1"), null);
  assert.equal(referralCandidate("", "u1"), null);
  assert.equal(referralCandidate(null, "u1"), null);
  assert.equal(referralCandidate("cmreferrer01", "u1"), "cmreferrer01");
});

test("the cookie is cleared on use and capture stays", () => {
  assert.equal(REFERRAL_COOKIE, "oc_ref");
  const src = read("src/lib/referral.ts");
  assert.match(src, /jar\.set\(REFERRAL_COOKIE, "", \{ path: "\/", maxAge: 0 \}\)/);
  assert.match(read("src/components/ReferralCapture.tsx"), /captureEntrySource\(\)/);
});
