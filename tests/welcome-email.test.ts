import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildWelcomeEmail } from "../src/lib/email";
import { MIN_AGE_MINUTES, WELCOME_WINDOW_HOURS, runWelcomeEmails } from "../src/lib/welcome-email";
import { FREE_PORTFOLIO_LIMIT, FREE_WATCHLIST_LIMIT } from "../src/lib/free-limits";
import { planPrice } from "../src/lib/plans";

// The one-time welcome email to a new account — RiftCompare's, ported for OP
// Compare (wave 2). No trial variant: MTG Compare offers none, so the copy names
// only what ships (lib/free-limits.ts, lib/plans.ts) and is never typed.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

test("the email leads with the free account, then Premium as the last block", () => {
  const e = buildWelcomeEmail({ displayName: "Sam Lee" });
  const t = text(e.html);
  assert.match(t, /Hi Sam,/, "first name only");
  const order = ["Watch a card", "See today's top 3 deals", "Track your collection", "See what a set is missing", "Want every deal"].map((s) => t.indexOf(s));
  assert.ok(order.every((i) => i > 0), "every block present");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "the free account comes first; Premium is the last block, not the headline");
  assert.match(e.html, /\/premium\?src=welcome"/, "the Premium link is attributed");
  assert.match(t, /We won't send it again\./, "the footer states it is one-time");
  assert.doesNotMatch(t, /free trial|\$0 today|trial/i, "MTG Compare offers no trial");
});

test("limits and prices come from the shared modules, never typed", () => {
  const t = text(buildWelcomeEmail({ displayName: "Sam" }).html);
  assert.ok(t.includes(`up to ${FREE_WATCHLIST_LIMIT} cards on a free account`));
  assert.ok(t.includes(`Add up to ${FREE_PORTFOLIO_LIMIT} cards you own`));
  assert.ok(t.includes(`${planPrice("plus", "month")}/month`));
  assert.ok(t.includes(`${planPrice("premium", "month")}/month`));
  const tpl = read("src/lib/email.ts");
  const block = tpl.slice(tpl.indexOf("export function buildWelcomeEmail"), tpl.indexOf("function welcomeFooter"));
  assert.doesNotMatch(block, /\$\d/, "no hand-typed price in the template");
  assert.doesNotMatch(block, /riftbound|riftcompare|radiance/i);
});

test("the plain-text part says what the HTML says, with no markup", () => {
  const e = buildWelcomeEmail({ displayName: "Sam" });
  assert.match(e.text, /Hi Sam, your free account is ready/);
  assert.match(e.text, /\/portfolio\/sets/);
  assert.doesNotMatch(e.text, /<[a-z]/i);
});

test("the display name cannot inject markup", () => {
  const e = buildWelcomeEmail({ displayName: "<img src=x onerror=alert(1)> Bob" });
  assert.doesNotMatch(e.html, /<img src=x/);
  const blank = buildWelcomeEmail({ displayName: "   " });
  assert.match(text(blank.html), /Hi there,/);
});

// ── The run, against a stub user table ───────────────────────────────────────

type U = { id: string; email: string; displayName: string; isAdmin: boolean; createdAt: Date; welcomeEmailSentAt: Date | null };
const NOW = Date.parse("2026-10-04T12:00:00Z");
const user = (id: string, ageMin: number, over: Partial<U> = {}): U => ({
  id,
  email: `${id}@example.com`,
  displayName: id,
  isAdmin: false,
  createdAt: new Date(NOW - ageMin * 60_000),
  welcomeEmailSentAt: null,
  ...over,
});

function stub(rows: U[]) {
  const finds: Record<string, unknown>[] = [];
  const db = {
    user: {
      findMany: async (args: { where: { createdAt: { gte: Date; lte: Date }; welcomeEmailSentAt: null; isAdmin: boolean }; take: number }) => {
        finds.push(args as unknown as Record<string, unknown>);
        const w = args.where;
        return rows.filter((r) => r.welcomeEmailSentAt == null && r.isAdmin === w.isAdmin && r.createdAt >= w.createdAt.gte && r.createdAt <= w.createdAt.lte).slice(0, args.take);
      },
      updateMany: async ({ where, data }: { where: { id: string; welcomeEmailSentAt: null }; data: { welcomeEmailSentAt: Date } }) => {
        const r = rows.find((x) => x.id === where.id && x.welcomeEmailSentAt == null);
        if (!r) return { count: 0 };
        r.welcomeEmailSentAt = data.welcomeEmailSentAt;
        return { count: 1 };
      },
      update: async ({ where, data }: { where: { id: string }; data: { welcomeEmailSentAt: null } }) => {
        rows.find((x) => x.id === where.id)!.welcomeEmailSentAt = data.welcomeEmailSentAt;
      },
    },
  };
  return { db: db as never, rows, finds };
}

function withEmail<T>(on: boolean, fn: () => Promise<T>): Promise<T> {
  const k = process.env.RESEND_API_KEY;
  const f = process.env.EMAIL_FROM;
  if (on) {
    process.env.RESEND_API_KEY = "k";
    process.env.EMAIL_FROM = "MTG Compare <a@example.com>";
  } else {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
  }
  return fn().finally(() => {
    if (k == null) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = k;
    if (f == null) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = f;
  });
}

test("email off claims and stamps nothing, so the first run with email on still finds every account", async () => {
  const s = stub([user("a", 60)]);
  const sent: string[] = [];
  const r = await withEmail(false, () => runWelcomeEmails(NOW, async (to) => (sent.push(to), true), s.db));
  assert.equal(r.skipped, "email-off");
  assert.deepEqual(sent, []);
  assert.equal(s.rows[0]!.welcomeEmailSentAt, null);
  assert.equal(s.finds.length, 0, "no query at all");
});

test("a window, a conditional claim, and a released claim on failure", async () => {
  assert.equal(WELCOME_WINDOW_HOURS, 72);
  assert.equal(MIN_AGE_MINUTES, 5);
  const rows = [
    user("fresh", 2), // too young: an OAuth sign-up still mid-redirect
    user("ok", 90),
    user("old", 73 * 60), // outside the window: an existing account is never emailed
    user("admin", 90, { isAdmin: true }),
    user("done", 90, { welcomeEmailSentAt: new Date(NOW - 3600_000) }),
    user("bad", 120),
    user("mastermisclick", 90, { email: "mastermisclick@gmail.com" }), // an admin address
  ];
  const s = stub(rows);
  const sent: string[] = [];
  const r = await withEmail(true, () => runWelcomeEmails(NOW, async (to) => (sent.push(to), to !== "bad@example.com"), s.db));
  assert.deepEqual(sent.sort(), ["bad@example.com", "ok@example.com"]);
  assert.equal(r.sent, 1);
  assert.equal(r.failed, 1);
  assert.ok(rows.find((x) => x.id === "ok")!.welcomeEmailSentAt, "stamped on success");
  assert.equal(rows.find((x) => x.id === "bad")!.welcomeEmailSentAt, null, "a failed send releases the claim for the next hour");
  for (const id of ["fresh", "old", "admin", "mastermisclick"]) assert.equal(rows.find((x) => x.id === id)!.welcomeEmailSentAt, null, id);
  // A second overlapping run cannot double-send.
  const again: string[] = [];
  await withEmail(true, () => runWelcomeEmails(NOW, async (to) => (again.push(to), true), s.db));
  assert.deepEqual(again, ["bad@example.com"], "only the released one is retried");
});

test("a lost claim race sends nothing", async () => {
  const s = stub([user("a", 60)]);
  const racing = {
    user: { ...(s.db as { user: object }).user, updateMany: async () => ({ count: 0 }) },
  } as never;
  const sent: string[] = [];
  const r = await withEmail(true, () => runWelcomeEmails(NOW, async (to) => (sent.push(to), true), racing));
  assert.deepEqual(sent, []);
  assert.equal(r.sent, 0);
});

test("the source: bounded query, conditional claim, release on failure, additive nullable column", () => {
  const src = read("src/lib/welcome-email.ts");
  assert.match(src, /welcomeEmailSentAt: null,\s*isAdmin: false,\s*createdAt: \{ gte: /);
  assert.match(src, /updateMany\(\{\s*where: \{ id: u\.id, welcomeEmailSentAt: null \}/);
  assert.match(src, /data: \{ welcomeEmailSentAt: null \}/);
  assert.match(src, /take: BATCH/);
  assert.match(read("prisma/schema.prisma"), /welcomeEmailSentAt\s+DateTime\?/);
});

test("the outbox workflow runs hourly at minute 23 in its own group, a green no-op without secrets", () => {
  const wf = read(".github/workflows/email.yml");
  assert.match(wf, /cron: "23 \* \* \* \*"/);
  assert.match(wf, /group: email\b/);
  assert.match(wf, /scripts\/email-hourly\.ts/);
  assert.match(wf, /\[ -z "\$DATABASE_URL" \] \|\| \[ -z "\$RESEND_API_KEY" \] \|\| \[ -z "\$EMAIL_FROM" \]/);
  const script = read("scripts/email-hourly.ts");
  assert.match(script, /runWelcomeEmails\(\)/);
  assert.match(script, /drainConfirmations\(\)/);
  assert.match(script, /drainNewsletterWelcomes\(/);
  assert.match(script, /providerRefused\(\)/);
  assert.match(script, /process\.exitCode = 1/);
});
