// Referral ATTRIBUTION only (RiftCompare's lib/referral.ts, ported in wave 2,
// 2026-10-03; the reward removed 2026-10-04). A link like
// mtgcompare.app/?ref=<userId> drops a cookie (components/ReferralCapture), read
// here when the referred visitor creates an account.
//
// THERE IS NO REWARD. RiftCompare credits the referrer with days of their own
// tier. On MTG Compare that would be an entitlement write from the public OAuth
// sign-up path, and CLAUDE.md allows User.premiumUntil to be written only by the
// Stripe webhook, the daily reconcile and the admin grant/revoke routes. The
// first port gated it behind an env var, which left it one setting away from
// being live with no abuse control (anyone can mint accounts, and the referrer
// code is a public User.id). It is gone, not off: bringing a reward back means
// the owner approves the program, CLAUDE.md names the writer, and the grant gets
// per-referrer and per-day caps and an account-age check first.
//
// Server-only. Best-effort — it must never block or fail signup.
import { cookies } from "next/headers";
import { REFERRAL_COOKIE } from "./referral-cookie";

export { REFERRAL_COOKIE };

/** Pure: is this referral code worth a lookup? (cuid-shaped, not the new account itself). */
export function referralCandidate(code: string | null | undefined, newUserId: string): string | null {
  if (!code || !/^[a-z0-9]{6,40}$/i.test(code) || code === newUserId) return null;
  return code;
}

/** Clears the referral cookie when an account is created, and logs the attribution. Writes nothing to the database. */
export async function applyReferral(newUserId: string): Promise<void> {
  try {
    const jar = cookies();
    const code = jar.get(REFERRAL_COOKIE)?.value;
    // Clear immediately so this browser can't attribute a second account.
    if (code) jar.set(REFERRAL_COOKIE, "", { path: "/", maxAge: 0 });
    const referrerId = referralCandidate(code ? decodeURIComponent(code) : null, newUserId);
    if (referrerId) console.log("[referral]", "attributed", JSON.stringify({ referrerId, newUserId }));
  } catch {
    // Attribution is a bonus, never a gate — swallow everything.
  }
}
