// Release-day blast: "the set is out, the card database and live prices are up" to the opt-in newsletter list (parity P36).
// RiftCompare sends this from a Vercel route; MTG Compare sends every email script-side from GitHub Actions
// (.github/workflows/release-day-email.yml -> scripts/send-release-day.ts), only once both mail secrets exist (isEmailEnabled()),
// and nothing under src/app imports this module (tests/no-email-api.test.ts).
//
// Honest by construction: every figure is read from the published files and passed in; a figure that cannot be read is left out of the copy,
// never guessed. A set that is not out yet, or came out more than RELEASE_DAY_WINDOW_DAYS ago, is refused: this is an announcement, not a
// newsletter. The audience is the newsletter list only (people who opted in); there is no announcement list of account holders.
//
// Resumable: a run is capped (DEFAULT_BATCH) and paced for the provider's rate limit, and each subscriber is stamped with the campaign
// (NewsletterSubscriber.lastEditionKey = "release-<slug>") only after a successful send, so a rerun carries on and nobody is emailed twice.
// The weekly digest writes the same column with its ISO week, so the blast is meant to be finished the day it starts (the window keeps it short).
import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { getCatalogStats, getSealedBySet, getSetBySlug } from "./data";
import { EMAIL_COLORS as C, emailShell, escapeHtml, isEmailEnabled, sendEmail, SITE_LINE } from "./email";
import { SITE_NAME, SITE_URL } from "./site";
import { COUNTRIES } from "./country";
import type { SetLite } from "./data/types";

/** A set is announced only while it is this new. */
export const RELEASE_DAY_WINDOW_DAYS = 7;
export const RELEASE_DAY_DEFAULT_BATCH = 200;
const THROTTLE_MS = 600;

export interface ReleaseDayStats {
  cardCount: number | null;
  pricedCount: number | null; // cards of the set with a price we track
  storeCount: number | null;
  marketCount: number;
  sealedAvailable: boolean;
}

export interface ReleaseDayResult {
  ok: boolean;
  error?: string;
  dryRun: boolean;
  set?: string;
  stats?: ReleaseDayStats;
  subscribers?: number;
  pending?: number;
  sent?: number;
  failed?: number;
  remaining?: number;
}

export const releaseDayCampaign = (setSlug: string): string => `release-${setSlug}`;

/** Pure: may this set be announced on `today` (YYYY-MM-DD)? null = yes, else the reason. */
export function releaseDayRefusal(set: Pick<SetLite, "name" | "releasedOn">, today: string): string | null {
  if (!set.releasedOn) return `${set.name} has no release date`;
  const out = set.releasedOn.slice(0, 10);
  if (out > today) return `${set.name} is not out yet (${out})`;
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${out}T00:00:00Z`)) / 86_400_000);
  if (days > RELEASE_DAY_WINDOW_DAYS) return `${set.name} came out ${days} days ago: past the ${RELEASE_DAY_WINDOW_DAYS}-day announcement window`;
  return null;
}

export interface ReleaseDayEmail {
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
}

/** Pure: the email, from facts. A stat that is null is omitted from the copy. */
export function buildReleaseDayEmail(setName: string, setSlug: string, stats: ReleaseDayStats, unsubUrl: string): ReleaseDayEmail {
  const facts: string[] = [];
  if (stats.cardCount) facts.push(`${stats.cardCount.toLocaleString("en-US")} cards are in the database`);
  if (stats.pricedCount) facts.push(`${stats.pricedCount.toLocaleString("en-US")} already have a tracked price`);
  if (stats.storeCount) facts.push(`prices are compared across ${stats.storeCount} stores in ${stats.marketCount} markets`);
  if (stats.sealedAvailable) facts.push("sealed products are priced too");
  const setUrl = `${SITE_URL}/sets/${setSlug}`;
  const subject = `${setName} is out: card prices are up`;
  const lead = `${setName} is out, and its cards are on ${SITE_NAME}.`;
  const list = facts.length ? `<ul style="margin:10px 0 0;padding-left:18px">${facts.map((f) => `<li style="margin:4px 0">${escapeHtml(f)}.</li>`).join("")}</ul>` : "";
  const inner = `
    <tr><td style="padding:8px 32px 8px;font-size:14px;line-height:1.6;color:${C.text}">${escapeHtml(lead)}${list}</td></tr>
    <tr><td style="padding:14px 32px 24px"><a href="${escapeHtml(setUrl)}" style="display:inline-block;background:${C.button};color:${C.buttonInk};font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px">See ${escapeHtml(setName)} prices</a></td></tr>`;
  const footer = `<tr><td style="padding:16px 32px 26px;border-top:1px solid ${C.border};font-size:12px;color:${C.muted}">
    You're getting this because you signed up for the ${escapeHtml(SITE_NAME)} newsletter.<br/>
    <a href="${escapeHtml(unsubUrl)}" style="color:${C.link};text-decoration:underline">Unsubscribe</a> · ${escapeHtml(SITE_LINE)}
  </td></tr>`;
  const text = [lead, ...facts.map((f) => `- ${f}.`), "", `${setName} prices: ${setUrl}`, "", `Unsubscribe: ${unsubUrl}`].join("\n");
  return {
    subject,
    html: emailShell(`${setName} is out`, inner, footer, lead),
    text,
    headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

/** Where the run reads its facts and sends from; tests pass stand-ins. */
export interface ReleaseDayDeps {
  now?: Date;
  getSet?: (slug: string) => Promise<SetLite | null>;
  stats?: (set: SetLite) => Promise<ReleaseDayStats>;
  send?: (to: string, e: ReleaseDayEmail) => Promise<boolean>;
  emailEnabled?: boolean;
  db?: Pick<typeof prisma, "newsletterSubscriber">;
  sleep?: (ms: number) => Promise<void>;
}

async function liveStats(set: SetLite): Promise<ReleaseDayStats> {
  const [catalog, sealed] = await Promise.all([getCatalogStats().catch(() => null), getSealedBySet(set.id).catch(() => null)]);
  return {
    cardCount: set.cardCount || null,
    pricedCount: set.trackedCount || null,
    storeCount: null, // the store count of the whole site is not a fact about this set; left out rather than guessed
    marketCount: Object.keys(COUNTRIES).length,
    sealedAvailable: !!sealed && sealed.length > 0 && catalog != null,
  };
}

export async function runReleaseDayBlast(opts: { setSlug: string; dryRun: boolean; limit?: number }, deps: ReleaseDayDeps = {}): Promise<ReleaseDayResult> {
  const { setSlug, dryRun } = opts;
  const db = deps.db ?? prisma;
  const limit = opts.limit && opts.limit > 0 ? opts.limit : RELEASE_DAY_DEFAULT_BATCH;
  const campaign = releaseDayCampaign(setSlug);
  const set = await (deps.getSet ?? getSetBySlug)(setSlug);
  if (!set) return { ok: false, dryRun, error: `Unknown set slug "${setSlug}"` };
  const refusal = releaseDayRefusal(set, (deps.now ?? new Date()).toISOString().slice(0, 10));
  if (refusal) return { ok: false, dryRun, set: set.name, error: refusal };
  if (!dryRun && !(deps.emailEnabled ?? isEmailEnabled())) return { ok: false, dryRun, set: set.name, error: "Email is off (both mail secrets are needed): nothing would send" };

  const stats = await (deps.stats ?? liveStats)(set);
  // Never announce an empty database.
  if (!stats.cardCount) return { ok: false, dryRun, set: set.name, stats, error: "Zero cards tracked for this set" };

  const rows = await db.newsletterSubscriber.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, email: true, unsubToken: true, lastEditionKey: true }, take: 20000 });
  const pendingRows = rows.filter((r) => r.lastEditionKey !== campaign);
  const base = { ok: true, dryRun, set: set.name, stats, subscribers: rows.length, pending: pendingRows.length };
  if (dryRun) return { ...base, sent: 0, failed: 0, remaining: pendingRows.length };

  const send = deps.send ?? ((to, e) => sendEmail(to, e.subject, e.html, { text: e.text, headers: e.headers }));
  const sleep = deps.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const batch = pendingRows.slice(0, limit);
  let sent = 0;
  let failed = 0;
  for (const r of batch) {
    let token = r.unsubToken;
    if (!token) {
      token = randomUUID();
      await db.newsletterSubscriber.update({ where: { id: r.id }, data: { unsubToken: token } });
    }
    const unsubUrl = `${SITE_URL}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
    if (await send(r.email, buildReleaseDayEmail(set.name, setSlug, stats, unsubUrl))) {
      sent++;
      // Stamp ONLY on success, so a failure is retried by the next run rather than skipped for good.
      await db.newsletterSubscriber.update({ where: { id: r.id }, data: { lastEditionKey: campaign } });
    } else failed++;
    if (batch.length > 1) await sleep(THROTTLE_MS);
  }
  return { ...base, sent, failed, remaining: pendingRows.length - sent };
}
