import type { prisma } from "./db";
import { isEmailEnabled } from "./email";

// WHAT THE SITE IS ALLOWED TO PROMISE ABOUT EMAIL (wave 2, 2026-10-03).
//
// The mail keys live only in GitHub Actions, so the site cannot ask
// isEmailEnabled() itself. Every email runner (scripts/alerts.ts,
// scripts/email-hourly.ts, scripts/newsletter.ts) records what it found in
// Meta key "email" — "on" or "off" — at the start of each run, and the site
// reads it through the cached getEmailStatus() (lib/data.ts, foundation): no
// copy promises an email, and no email field renders, while it says "off".
//
// "on" is recorded only when both secrets are set. A key the provider then
// REFUSES flips it back to "off" (recordEmailRefused) before the run fails red,
// so a broken key never leaves the site promising mail nobody will receive.

export type EmailMetaDb = { meta: Pick<typeof prisma.meta, "upsert"> };

export const EMAIL_META_KEY = "email";

export async function recordEmailStatus(db: EmailMetaDb, on: boolean = isEmailEnabled()): Promise<"on" | "off"> {
  const value = on ? "on" : "off";
  await db.meta.upsert({ where: { key: EMAIL_META_KEY }, create: { key: EMAIL_META_KEY, value }, update: { value } });
  return value;
}

/** The provider refused the key: stop promising email until a run succeeds again. */
export function recordEmailRefused(db: EmailMetaDb): Promise<"on" | "off"> {
  return recordEmailStatus(db, false);
}
