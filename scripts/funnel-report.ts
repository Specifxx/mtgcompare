/**
 * THE WEEKLY PREMIUM FUNNEL REPORT: read-only, aggregate-only. RiftCompare's
 * scripts/funnel-report.ts (parity P24) for MTG Compare's plans (Plus and
 * Premium, no trial).
 *
 * WHY THIS EXISTS. "Why did we have more sign-ups before?" needs a time
 * dimension, and no admin page has one: /admin/subscriptions is an all-time
 * view and /admin/accounts looks back a fixed 30 days. So this buckets
 * everything by ISO week, joins the Postgres side (accounts, sign-up source,
 * Plus/Premium interest) to the Stripe side (subscriptions created by tier,
 * cancellations) and prints one table you can read week over week.
 *
 * NEVER WRITES. No prisma create/update/upsert/delete, no Stripe mutation.
 * Aggregate only: no e-mails, names or customer ids reach the log, because this
 * runs in CI where the output is retained.
 *
 * Usage:
 *   npx tsx scripts/funnel-report.ts          # last 8 weeks
 *   npx tsx scripts/funnel-report.ts 12       # last 12 weeks
 */
import type Stripe from "stripe";
import { prisma } from "../src/lib/db";
import { stripe, stripeEnabled } from "../src/lib/stripe";
import { isActive, monthlyValueCents, ourRows, type SubRow } from "../src/lib/subscription-metrics";

const WEEKS = Math.max(1, Math.min(52, Math.floor(Number(process.argv[2] ?? 8)) || 8));
const MAX_SUBSCRIPTION_PAGES = 20;
const DAY = 86_400_000;
const WEEK = 7 * DAY;

/** Monday 00:00 UTC of the week containing `ms`. */
function weekStart(ms: number): number {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  // getUTCDay(): 0=Sun..6=Sat. Shift so Monday is the first day.
  const back = (d.getUTCDay() + 6) % 7;
  return d.getTime() - back * DAY;
}
const label = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function emptyRow() {
  return { accounts: 0, premiumClicks: 0, checkoutStarts: 0, expiries: 0, subsCreated: 0, plusCreated: 0, premiumCreated: 0, annualCreated: 0, cancellations: 0 };
}
type Row = ReturnType<typeof emptyRow>;

/** Every subscription of this site, paged (100 a page, at most 20 pages); `capped` when older ones are missing. */
async function ourSubscriptions(): Promise<{ rows: SubRow[]; capped: boolean }> {
  const subs: Stripe.Subscription[] = [];
  let startingAfter: string | undefined;
  for (let i = 0; i < MAX_SUBSCRIPTION_PAGES; i++) {
    const page: Stripe.ApiList<Stripe.Subscription> = await stripe().subscriptions.list({
      status: "all",
      limit: 100,
      expand: ["data.items.data.price"],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    subs.push(...page.data);
    if (!page.has_more || page.data.length === 0) return { rows: ourRows(subs), capped: false };
    startingAfter = page.data[page.data.length - 1]!.id;
  }
  return { rows: ourRows(subs), capped: true };
}

async function main() {
  const now = Date.now();
  const thisWeek = weekStart(now);
  const firstWeek = thisWeek - (WEEKS - 1) * WEEK;
  const weeks: number[] = Array.from({ length: WEEKS }, (_, i) => firstWeek + i * WEEK);
  const buckets = new Map<number, Row>(weeks.map((w) => [w, emptyRow()]));
  const bump = (ms: number | null | undefined, f: (r: Row) => void) => {
    if (ms == null) return;
    const row = buckets.get(weekStart(ms));
    if (row) f(row);
  };

  // ── Postgres side ─────────────────────────────────────────────────────────
  const since = new Date(firstWeek);
  const users = await prisma.user.findMany({ where: { createdAt: { gte: since } }, select: { id: true, createdAt: true, signupSource: true } });
  for (const u of users) bump(u.createdAt.getTime(), (r) => r.accounts++);

  const sources = new Map<string, number>();
  for (const u of users) {
    const k = u.signupSource ?? "(untracked)";
    sources.set(k, (sources.get(k) ?? 0) + 1);
  }

  const clicks = await prisma.premiumClick.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, source: true, surface: true, tier: true } });
  for (const c of clicks) {
    bump(c.createdAt.getTime(), (r) => {
      r.premiumClicks++;
      if (c.source === "checkout") r.checkoutStarts++;
    });
  }

  // Entitlements that ran out in the window: the database's own view of churn (admin grants and the launch promotion included).
  const expired = await prisma.user.findMany({ where: { premiumUntil: { gte: since, lt: new Date(now) } }, select: { premiumUntil: true } });
  for (const u of expired) bump(u.premiumUntil?.getTime() ?? null, (r) => r.expiries++);

  // ── Stripe side ───────────────────────────────────────────────────────────
  let stripeNote = "";
  let mrrNowCents = 0;
  let mrrCurrency = "";
  if (!stripeEnabled()) {
    stripeNote = "Stripe is not configured in this environment, so the subscription columns are blank.";
  } else {
    const { rows, capped } = await ourSubscriptions();
    if (capped) stripeNote = "WARNING: hit the subscription page cap, so older subscriptions are missing.";
    for (const s of rows) {
      bump(s.createdMs, (r) => {
        r.subsCreated++;
        if (s.tier === "plus") r.plusCreated++;
        else r.premiumCreated++;
        if (s.interval === "year") r.annualCreated++;
      });
      bump(s.endedAtMs ?? (s.status === "canceled" ? s.canceledAtMs : null), (r) => r.cancellations++);
    }
    const byCur = new Map<string, number>();
    for (const s of rows.filter((x) => isActive(x.status))) byCur.set(s.currency, (byCur.get(s.currency) ?? 0) + monthlyValueCents(s));
    const top = [...byCur.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) {
      mrrCurrency = top[0].toUpperCase();
      mrrNowCents = top[1];
    }
  }

  // ── Output ────────────────────────────────────────────────────────────────
  console.log("MTG Compare Plus and Premium funnel, by ISO week (Monday start, UTC)\n");
  console.log("HOW TO READ THIS. Two things inside any window are not demand:");
  console.log("  - the launch promotion: the first 50 NEW accounts get 30 days of Premium with");
  console.log("    no Stripe subscription, so they show in accts and, 30 days later, in expired,");
  console.log("    and never in subs;");
  console.log("  - there is no trial: a subscription is revenue from the day it is created.\n");
  if (stripeNote) console.log(`${stripeNote}\n`);

  const head = ["week", "accts", "clicks", "chkout", "subs", "plus", "prem", "ann", "canc", "expired"];
  const w = (s: string | number, n: number) => String(s).padStart(n);
  console.log(head.map((h, i) => w(h, i === 0 ? 10 : 7)).join(" "));
  for (const wk of weeks) {
    const r = buckets.get(wk)!;
    console.log([label(wk).padStart(10), w(r.accounts, 7), w(r.premiumClicks, 7), w(r.checkoutStarts, 7), w(r.subsCreated, 7), w(r.plusCreated, 7), w(r.premiumCreated, 7), w(r.annualCreated, 7), w(r.cancellations, 7), w(r.expiries, 7)].join(" "));
  }

  console.log("\nColumns: accts=accounts created / clicks=PremiumClick rows / chkout=of those,");
  console.log("source 'checkout' / subs, plus, prem, ann=Stripe subscriptions created (tier, and how");
  console.log("many annual) / canc=subscriptions ended / expired=premiumUntil ran out.\n");

  if (mrrCurrency) console.log(`MRR now: ${(mrrNowCents / 100).toFixed(2)} ${mrrCurrency}\n`);

  console.log(`Signup source, last ${WEEKS} week(s) (${users.length} account${users.length === 1 ? "" : "s"}):`);
  for (const [k, n] of [...sources.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${k}`);

  await printActivation(users, now);
  printSurfaces(clicks);
}

// ── Activation by signup source ─────────────────────────────────────────────
// A source that produces accounts nobody uses is not a win, so each source is
// also read by how many of its accounts did the thing an account is FOR within
// 7 days: a price watch or a card in the collection. Only accounts at least 7
// days old are judged (a newer one has not had its chance yet).
//
// Bounded reads: the ids are this window's sign-ups (tens a week), and each
// groupBy returns at most one row per id, never the alert or collection table.
async function printActivation(users: { id: string; createdAt: Date; signupSource: string | null }[], nowMs: number) {
  const matured = users.filter((u) => u.createdAt.getTime() <= nowMs - WEEK);
  console.log(`\nActivation by signup source: a watch or a collected card within 7 days`);
  console.log(`(accounts at least 7 days old: ${matured.length}):`);
  if (!matured.length) {
    console.log("  (none yet)");
    return;
  }
  const ids = matured.map((u) => u.id);
  const [watches, cards] = await Promise.all([
    prisma.priceAlert.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _min: { createdAt: true } }),
    prisma.collectionCard.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _min: { createdAt: true } }),
  ]);
  const firstAct = new Map<string, number>();
  for (const r of [...watches, ...cards]) {
    const t = r._min.createdAt?.getTime();
    if (r.userId == null || t == null) continue;
    firstAct.set(r.userId, Math.min(firstAct.get(r.userId) ?? Infinity, t));
  }
  const bySource = new Map<string, { n: number; active: number }>();
  for (const u of matured) {
    const k = u.signupSource ?? "(untracked)";
    const row = bySource.get(k) ?? { n: 0, active: 0 };
    row.n++;
    const t = firstAct.get(u.id);
    if (t != null && t <= u.createdAt.getTime() + WEEK) row.active++;
    bySource.set(k, row);
  }
  console.log(`  ${"accts".padStart(5)} ${"active".padStart(6)} ${"rate".padStart(5)}  source`);
  for (const [k, v] of [...bySource.entries()].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${String(v.n).padStart(5)} ${String(v.active).padStart(6)} ${`${Math.round((100 * v.active) / v.n)}%`.padStart(5)}  ${k}`);
  }
}

// ── Which surfaces produce interest and checkouts ───────────────────────────
// Every plan button records its own surface (lib/nudge-surface.ts), and a
// checkout start records the surface that led to it, so the two lists answer
// "what makes people look" and "what makes people pay" separately.
function printSurfaces(clicks: { source: string; surface: string; tier: string | null }[]) {
  const count = (rows: { surface: string; tier: string | null }[]) => {
    const m = new Map<string, number>();
    for (const c of rows) m.set(`${c.surface}${c.tier ? ` (${c.tier})` : ""}`, (m.get(`${c.surface}${c.tier ? ` (${c.tier})` : ""}`) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  console.log(`\nPlan clicks by surface, last ${WEEKS} week(s) (checkout starts excluded):`);
  for (const [k, n] of count(clicks.filter((c) => c.source !== "checkout"))) console.log(`  ${String(n).padStart(5)}  ${k}`);
  console.log(`\nCheckout starts by the surface that led to them:`);
  const starts = count(clicks.filter((c) => c.source === "checkout"));
  if (!starts.length) console.log("  (none)");
  for (const [k, n] of starts) console.log(`  ${String(n).padStart(5)}  ${k}`);
}

main()
  .catch((e) => {
    console.error("funnel-report failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
