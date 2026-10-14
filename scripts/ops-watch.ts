// The ops watch: one hourly Actions job (.github/workflows/ops-watch.yml) that checks every area of the site against its limit, keeps the snapshot the admin dashboard shows, and e-mails the owner.
//
//   npx tsx scripts/ops-watch.ts            # the hourly run
//   npx tsx scripts/ops-watch.ts --dry-run  # collect and print; write nothing, send nothing
//
// Order matters: 1. collect, 2. WRITE THE SNAPSHOT (Meta `ops.health`: the dashboard works with mail off), 3. e-mail what is new or worse (Meta `ops.notified` remembers what the owner was told),
// 4. e-mail new inbox items (Meta `ops.inbox.cursor`). A state is advanced only after its e-mail was accepted, so a refused send is retried next hour, never lost. The recipient is the Actions variable
// OPS_ALERT_EMAIL. The job ALWAYS exits 0: a broken monitor must not become one more red workflow nobody reads; the watch's own failures are `::warning` annotations and the dashboard's "stale" light.
import fs from "node:fs";
import { prisma } from "../src/lib/db";
import { getLastEmailError, isEmailEnabled, sendEmail } from "../src/lib/email";
import { collectChecks, inboxItemsSince, loadInboxCounts } from "../src/lib/ops-collect";
import { inboxTotal, overall, parseNotifyState, planNotifications, type Snapshot } from "../src/lib/ops-health";
import { buildAlertEmail, buildInboxEmail } from "../src/lib/ops-mail";

const KEYS = { health: "ops.health", notified: "ops.notified", cursor: "ops.inbox.cursor" } as const;
const log = (m: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);
const warn = (m: string) => console.log(`::warning title=Ops watch::${m}`);
const put = (key: string, value: string) => prisma.meta.upsert({ where: { key }, create: { key, value }, update: { value } });
const get = async (key: string): Promise<string | null> => (await prisma.meta.findUnique({ where: { key }, select: { value: true } }))?.value ?? null;

async function main(): Promise<void> {
  const dry = process.argv.includes("--dry-run");
  if (!process.env.DATABASE_URL) { log("DATABASE_URL is not set: nothing to watch (a green no-op)."); return; }
  const now = new Date();
  const [checks, inbox] = await Promise.all([collectChecks(now), loadInboxCounts().catch(() => null)]);
  const snap: Snapshot = { v: 1, at: now.toISOString(), checks, inbox };
  for (const c of checks) log(`${c.level.padEnd(7)} ${c.group} / ${c.label}: ${c.detail}`);
  log(`overall ${overall(checks)}; inbox ${inboxTotal(inbox) ?? "unreadable"} open`);
  if (fs.existsSync(process.env.GITHUB_STEP_SUMMARY ?? "/nonexistent")) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY!, `## Ops watch: ${overall(checks)}\n\n| Area | Check | Level | Detail |\n|---|---|---|---|\n${checks.map((c) => `| ${c.group} | ${c.label} | ${c.level} | ${c.detail.replace(/\|/g, "\\|")} |`).join("\n")}\n`);
  }
  if (dry) { log("--dry-run: nothing written, nothing sent."); return; }
  await put(KEYS.health, JSON.stringify(snap));

  const to = process.env.OPS_ALERT_EMAIL?.trim();
  if (!to) { log("OPS_ALERT_EMAIL is not set: no e-mail is sent (the dashboard still updates)."); return; }
  if (!isEmailEnabled()) { warn("mail is off (the mail secrets are both needed): no ops e-mail was sent."); return; }

  // problems
  const plan = planNotifications(checks, parseNotifyState(await get(KEYS.notified)), now);
  if (plan.send.length || plan.recovered.length) {
    const m = buildAlertEmail(plan.send, plan.recovered, now);
    if (await sendEmail(to, m.subject, m.html, { text: m.text })) { await put(KEYS.notified, JSON.stringify(plan.next)); log(`sent: ${m.subject}`); }
    else warn(`the alert e-mail was refused (${getLastEmailError() ?? "unknown"}); it is retried next hour.`);
  } else await put(KEYS.notified, JSON.stringify(plan.next));

  // inbox: the first run only plants the cursor and says how many are already open
  const cursorRaw = await get(KEYS.cursor), cursor = cursorRaw && Number.isFinite(Date.parse(cursorRaw)) ? new Date(cursorRaw) : null;
  if (!cursor) {
    const open = inboxTotal(inbox);
    if (open) {
      const m = buildInboxEmail(await inboxItemsSince(new Date(now.getTime() - 14 * 86_400_000)), open);
      if (await sendEmail(to, `${m.subject} (the backlog of the last 14 days)`, m.html, { text: m.text })) await put(KEYS.cursor, now.toISOString());
      else warn(`the first inbox e-mail was refused (${getLastEmailError() ?? "unknown"}); retried next hour.`);
    } else await put(KEYS.cursor, now.toISOString());
    return;
  }
  const items = await inboxItemsSince(cursor);
  if (!items.length) { log("no new inbox items."); return; }
  const m = buildInboxEmail(items, inboxTotal(inbox));
  if (await sendEmail(to, m.subject, m.html, { text: m.text })) { await put(KEYS.cursor, now.toISOString()); log(`sent: ${m.subject}`); }
  else warn(`the inbox e-mail was refused (${getLastEmailError() ?? "unknown"}); retried next hour.`);
}

main()
  .catch((e) => { warn(`the watch itself failed: ${(e as Error).message}`); })
  .finally(() => prisma.$disconnect().catch(() => {}));
