// The launch promotion's ONE entitlement writer: the first PROMO_SLOTS NEW
// accounts get PROMO_DAYS of Premium free (owner's request, 2026-10-04).
//
// This is an amendment to the entitlement-writer rule in CLAUDE.md, alongside
// the Stripe webhook, the daily reconcile and the admin grant/revoke routes:
//   • called from exactly one place, upsertOAuthUser, at the moment a NEW
//     account row is created — never for an existing account, never from a
//     route a visitor can call, so a slot cannot be claimed twice or by
//     replaying a request;
//   • the slot is taken with ONE atomic upsert-with-cap on the Counter row, in
//     the same transaction as the grant, so 50 simultaneous sign-ups can never
//     hand out a 51st month and a failed grant gives its slot back;
//   • extend-only: the date stacks on max(now, current), exactly like an admin
//     grant, and it never touches Stripe, so a real subscription is unaffected.
import { prisma } from "./db";
import { grantedUntil } from "./admin-billing";
import { LAUNCH_PROMO_ENABLED, PROMO_DAYS, PROMO_KEY, PROMO_SLOTS } from "./launch-promo-shared";

/** Take a slot for `userId` and grant the month. True when granted, false when the slots are gone (or the promo is off). */
export async function claimLaunchPromo(userId: string, now = new Date()): Promise<boolean> {
  if (!LAUNCH_PROMO_ENABLED) return false;
  try {
    return await prisma.$transaction(async (tx) => {
      // Insert the row at 1, or bump it — but only while it is under the cap.
      // No row comes back once the cap is reached, so the grant is skipped.
      const taken = await tx.$queryRaw<{ value: number }[]>`
        INSERT INTO "Counter" ("key", "value") VALUES (${PROMO_KEY}, 1)
        ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1
        WHERE "Counter"."value" < ${PROMO_SLOTS}
        RETURNING "value"`;
      if (taken.length === 0) return false;
      const user = await tx.user.findUnique({ where: { id: userId }, select: { premiumUntil: true, premiumTier: true } });
      if (!user) throw new Error("promo: unknown user"); // rolls the slot back
      const active = Boolean(user.premiumUntil && user.premiumUntil.getTime() > now.getTime());
      await tx.user.update({
        where: { id: userId },
        data: { premiumUntil: grantedUntil(user.premiumUntil, PROMO_DAYS, now), ...(active ? {} : { premiumTier: "premium" }) },
        select: { id: true },
      });
      return true;
    });
  } catch {
    return false; // a failed promo must never fail a sign-in
  }
}
