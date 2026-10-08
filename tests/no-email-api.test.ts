// The mail provider only behind its boundary, modelled on no-ebay-api.test.ts.
// OP Compare sends email from its OWN Resend account (never RiftCompare's),
// script-side only, and only once both secrets exist (lib/email.ts
// isEmailEnabled): the provider hosts live in src/lib/email.ts, the key names
// there and in the workflows that pass them, and no page, route or component
// can reach a send function. A request never sends mail: a signup writes a row
// and the hourly outbox (scripts/email-hourly.ts) sends.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const HOSTS = [/api\.resend\.com/i, /api\.brevo\.com/i, /api\.sendgrid\.com/i, /api\.mailgun\.net/i, /api\.postmarkapp\.com/i, /email\.[a-z0-9-]+\.amazonaws\.com/i];
const KEYS = [/RESEND_API_KEY/, /BREVO_API_KEY/, /\bEMAIL_FROM\b/, /\bEMAIL_REPLY_TO\b/];

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(p);
    return /\.(ts|tsx|js|mjs|yml|yaml|sh)$/.test(e.name) ? [p] : [];
  });
}
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");
const FILES = [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "scripts")), ...walk(path.join(ROOT, ".github"))];
const MAIL_LIB = "src/lib/email.ts";
const MAIL_WORKFLOWS = /^\.github\/workflows\/(email[^/]*|import-prices)\.yml$/;

test("mail provider hosts appear only in src/lib/email.ts", () => {
  const hits = FILES.filter((f) => rel(f) !== MAIL_LIB).flatMap((f) => {
    const text = fs.readFileSync(f, "utf8");
    return HOSTS.filter((re) => re.test(text)).map((re) => `${rel(f)}: ${re}`);
  });
  assert.deepEqual(hits, []);
  assert.ok(HOSTS.some((re) => re.test("https://api.resend.com/emails")));
  assert.match(fs.readFileSync(path.join(ROOT, MAIL_LIB), "utf8"), /api\.resend\.com/);
});

test("the mail key names appear only in src/lib/email.ts and the email*/import-prices workflows", () => {
  const allowed = (r: string) => r === MAIL_LIB || MAIL_WORKFLOWS.test(r);
  const hits = FILES.filter((f) => !allowed(rel(f))).flatMap((f) => {
    const text = fs.readFileSync(f, "utf8");
    return KEYS.filter((re) => re.test(text)).map((re) => `${rel(f)}: ${re}`);
  });
  assert.deepEqual(hits, []);
});

test("no mail secret is ever handed to Vercel or to a workflow that does not send", () => {
  const vercel = fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8");
  for (const re of KEYS) assert.doesNotMatch(vercel, re);
  for (const f of FILES.filter((x) => rel(x).startsWith(".github/") && !MAIL_WORKFLOWS.test(rel(x)))) {
    const text = fs.readFileSync(f, "utf8");
    for (const re of KEYS) assert.doesNotMatch(text, re, rel(f));
  }
  // The eBay pass never holds them either (and the mail runners never hold the eBay keyset).
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, ".github/workflows/ebay-prices.yml"), "utf8"), /RESEND|EMAIL_FROM/);
  for (const f of ["email.yml", "email-weekly.yml"]) assert.doesNotMatch(fs.readFileSync(path.join(ROOT, ".github/workflows", f), "utf8"), /EBAY_CLIENT/);
});

/** Every module specifier a file names: import/export … from, import(), require(), side-effect import. */
function specifiers(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b(?:from|import)\s*\(?\s*["']([^"']+)["']|\brequire\s*\(\s*["']([^"']+)["']/g)) out.push(m[1] ?? m[2]);
  return out;
}
function resolves(file: string, spec: string, target: string): boolean {
  let abs: string;
  if (spec.startsWith("@/")) abs = path.join(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) abs = path.resolve(path.dirname(file), spec);
  else return false;
  return rel(abs).replace(/\.tsx?$/, "") === target.replace(/\.tsx?$/, "");
}

test("no src/app file imports the mail module, so no page, route or layout can send", () => {
  const hits = FILES.filter((f) => rel(f).startsWith("src/app/")).flatMap((f) =>
    specifiers(fs.readFileSync(f, "utf8"))
      .filter((sp) => resolves(f, sp, "src/lib/email"))
      .map((sp) => `${rel(f)} → ${sp}`),
  );
  assert.deepEqual(hits, []);
  // The guard sees every form.
  const probe = path.join(ROOT, "src/app/x/route.ts");
  for (const t of ['import { sendEmail } from "@/lib/email";', 'const m = await import("@/lib/email");', 'export * from "../../lib/email";', 'require("@/lib/email")'])
    assert.ok(specifiers(t).some((sp) => resolves(probe, sp, "src/lib/email")), t);
});

test("no src/app file imports a module that sends (a send* function or a runner), directly or by re-export", () => {
  const SENDERS = ["welcome-email", "newsletter-sender", "price-alerts", "sealed-watch-run", "release-alerts-run", "watch-emails", "alert-confirmations"];
  const hits = FILES.filter((f) => rel(f).startsWith("src/app/")).flatMap((f) =>
    specifiers(fs.readFileSync(f, "utf8"))
      .filter((sp) => SENDERS.some((s) => resolves(f, sp, `src/lib/${s}`)))
      .map((sp) => `${rel(f)} → ${sp}`),
  );
  assert.deepEqual(hits, []);
  // …and no app file names a send function at all.
  const named = FILES.filter((f) => rel(f).startsWith("src/app/") || rel(f).startsWith("src/components/")).flatMap((f) =>
    [...fs.readFileSync(f, "utf8").matchAll(/\bsend(?:Email|EmailBrevo|PriceDropEmail|AlertConfirmationEmail|WelcomeEmail|NewsletterDigestEmail|NewsletterWelcomeEmail|SealedWatchEmail|DeckWatchEmail)\b/g)].map((m) => `${rel(f)}: ${m[0]}`),
  );
  assert.deepEqual(named, []);
});

test("the library modules a page may import never send: newsletter signup and release signup only write rows", () => {
  for (const f of ["src/lib/alert-routes.ts", "src/lib/alert-subscribe.ts", "src/lib/newsletter-signup.ts"]) {
    const text = fs.readFileSync(path.join(ROOT, f), "utf8");
    assert.doesNotMatch(text, /from "\.\/email"/, `${f} must not import the mail module`);
  }
  // newsletter.ts is the weekly runner and the welcome outbox (sends, scripts only); the signup helpers are newsletter-signup.ts.
  const routes = ["src/app/api/newsletter/route.ts", "src/app/api/newsletter/unsubscribe/route.ts"].map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
  assert.doesNotMatch(routes, /runNewsletterDigest|drainNewsletterWelcomes/);
});

test("the one-click and request-time paths stay dark while email is off", () => {
  for (const f of ["src/app/api/newsletter/route.ts", "src/app/api/alerts/release/route.ts", "src/app/api/alerts/subscribe/route.ts"]) {
    const text = fs.readFileSync(path.join(ROOT, f), "utf8");
    assert.match(text, /getEmailStatus\(\)/, f);
  }
});

// ── the ops webhook (parity P39) is the other thing the site never does from a request: post to a chat channel. A Discord or Slack INCOMING WEBHOOK from Actions, never a bot, never from a page ──────────────────────────
import { OPS_MAX_DESCRIPTION, OPS_MAX_SLACK, fitLines, formatOps, opsWebhookKind, opsWebhookUrl, postOps, redact } from "../src/lib/ops-webhook";
import { parseOpsArgs, runOps, shouldPost } from "../scripts/ops-webhook";
const DISCORD = "https://discord.com/api/webhooks/123456789012345678/abcDEFghiJKLmnoPQRstuVWXyz0123456789-_abcdefghijklmnopqrstuvwx";
test("nothing under src/app or src/components imports the ops webhook, and the secret is named only by the module, its script and the workflows that alert", () => {
  const importers = FILES.filter((f) => rel(f).startsWith("src/") && !/^src\/lib\/ops-webhook\.ts$/.test(rel(f))).filter((f) => /["'](?:@\/lib\/|\.{1,2}\/(?:lib\/)?)ops-webhook["']/.test(fs.readFileSync(f, "utf8"))).map(rel);
  assert.deepEqual(importers, [], "an alert is posted by a script from Actions; a request never posts anywhere");
  const names = FILES.filter((f) => /OPS_WEBHOOK_URL/.test(fs.readFileSync(f, "utf8").replace(/^\s*(?:\/\/|#).*$/gm, ""))).map(rel);
  for (const f of names) assert.ok(/^(?:src\/lib\/ops-webhook\.ts|scripts\/ops-webhook\.ts|\.github\/workflows\/[\w-]+\.yml)$/.test(f), `${f} names OPS_WEBHOOK_URL`);
  assert.deepEqual(FILES.filter((f) => /\bdiscord(?:app)?\.com\/api\/(?:webhooks|v\d+\/(?:channels|gateway|interactions))/.test(fs.readFileSync(f, "utf8").replace(/^\s*(?:\/\/|#).*$/gm, "")) && !/ops-webhook/.test(rel(f))).map(rel), [], "no Discord API call anywhere else: no bot, no gateway, no interactions endpoint (S09)");
});
test("redact removes webhook addresses, tokens, connection strings, bearer headers and e-mail addresses from every alert line", () => {
  const dirty = [`posted to ${DISCORD}`, "token ghp_" + "a".repeat(36), "key sk_live_" + "b".repeat(24), "postgresql://app:hunter2@ep-x.neon.tech/db", "Authorization: Bearer abcdefghijklmnopqrstuvwx", "from someone@example.com"].join("\n");
  const clean = redact(dirty);
  for (const bad of [DISCORD, "ghp_", "sk_live_", "hunter2", "abcdefghijklmnopqrstuvwx", "someone@example.com"]) assert.ok(!clean.includes(bad), `${bad} survived`);
  for (const mark of ["[webhook url]", "[github token]", "[payment key]", "[database url]", "[email]"]) assert.ok(clean.includes(mark), mark);
  assert.equal(redact("Egress audit: 3 shapes above budget"), "Egress audit: 3 shapes above budget", "an ordinary line is untouched");
});
test("the webhook address: https only, blank is none, and Discord, Slack and anything else get their own payload shape", () => {
  assert.equal(opsWebhookUrl({}), null); assert.equal(opsWebhookUrl({ OPS_WEBHOOK_URL: "  " }), null);
  assert.equal(opsWebhookUrl({ OPS_WEBHOOK_URL: "http://discord.com/api/webhooks/1/x" }), null, "a typo never makes a request over plain http");
  assert.equal(opsWebhookUrl({ OPS_WEBHOOK_URL: "not a url" }), null);
  assert.equal(opsWebhookUrl({ OPS_WEBHOOK_URL: DISCORD }), DISCORD);
  assert.deepEqual([DISCORD, "https://hooks.slack.com/services/T/B/x", "https://chat.example.test/hook", "https://discord.com.evil.test/x"].map(opsWebhookKind), ["discord", "slack", "generic", "generic"], "the host is matched exactly, not by a substring");
  const d = formatOps({ title: "Data audit failed", level: "error", lines: ["a", `see ${DISCORD}`], url: "https://github.com/x/y/actions/runs/1" }, "discord") as { embeds: { title: string; description: string; color: number; url: string }[]; allowed_mentions: { parse: unknown[] } };
  assert.equal(d.embeds[0]!.title, "Data audit failed"); assert.ok(!d.embeds[0]!.description.includes("webhooks/"), "redacted"); assert.deepEqual(d.allowed_mentions.parse, [], "an alert never pings @everyone");
  assert.ok(typeof (formatOps({ title: "t", level: "warn", lines: ["x"] }, "slack") as { text: string }).text === "string");
  const long = Array.from({ length: 400 }, (_, i) => `line ${i} ${"x".repeat(30)}`);
  assert.ok(fitLines(long, OPS_MAX_DESCRIPTION).length <= OPS_MAX_DESCRIPTION && /and \d+ more$/.test(fitLines(long, OPS_MAX_DESCRIPTION)), "a long report is cut at whole lines and says how much is missing");
  assert.ok(((formatOps({ title: "t", level: "info", lines: long }, "slack") as { text: string }).text).length <= OPS_MAX_SLACK + 400);
});
test("posting never throws and never fails the caller: no webhook, a refusal, a network error; one retry on 429 only", async () => {
  const msg = { title: "Store health", level: "warn" as const, lines: ["2 stores alerting"] };
  assert.deepEqual(await postOps(msg, { env: {} }), { ok: false, skipped: "no OPS_WEBHOOK_URL" });
  assert.deepEqual(await postOps({ title: "", level: "info", lines: [] }, { env: { OPS_WEBHOOK_URL: DISCORD } }), { ok: false, skipped: "nothing to post" });
  const calls: { url: string; body: string }[] = [];
  const reply = (...statuses: number[]) => async (url: unknown, init?: RequestInit): Promise<Response> => { calls.push({ url: String(url), body: String(init?.body) }); const s = statuses[Math.min(calls.length - 1, statuses.length - 1)]!; return new Response(null, { status: s, headers: s === 429 ? { "retry-after": "1" } : {} }); };
  calls.length = 0; assert.deepEqual(await postOps(msg, { env: { OPS_WEBHOOK_URL: DISCORD }, fetch: reply(204) as typeof fetch }), { ok: true, status: 204 });
  assert.equal(calls[0]!.url, DISCORD); assert.match(calls[0]!.body, /2 stores alerting/);
  calls.length = 0; assert.deepEqual(await postOps(msg, { env: { OPS_WEBHOOK_URL: DISCORD }, fetch: reply(429, 204) as typeof fetch, sleep: async () => {} }), { ok: true, status: 204 }); assert.equal(calls.length, 2, "told once");
  calls.length = 0; assert.equal((await postOps(msg, { env: { OPS_WEBHOOK_URL: DISCORD }, fetch: reply(429) as typeof fetch, sleep: async () => {} })).ok, false); assert.equal(calls.length, 2, "and not hammered");
  calls.length = 0; assert.deepEqual(await postOps(msg, { env: { OPS_WEBHOOK_URL: DISCORD }, fetch: reply(500) as typeof fetch }), { ok: false, skipped: "post failed", status: 500 }); assert.equal(calls.length, 1, "a 500 is not retried");
  assert.deepEqual(await postOps(msg, { env: { OPS_WEBHOOK_URL: DISCORD }, fetch: (async () => { throw new TypeError("offline"); }) as typeof fetch }), { ok: false, skipped: "post failed" });
});
test("the script: arguments are parsed strictly, --if-failed stays quiet on success, and without the secret it prints the alert and exits clean", async () => {
  const a = parseOpsArgs(["--title", "Egress audit", "--level", "warn", "--line", "orders: 9,400 calls a day", "--file", "report.txt", "--tail", "2", "--url", "https://x.test/run"], () => "one\ntwo\nthree\n");
  assert.deepEqual([a.title, a.level, a.lines, a.url], ["Egress audit", "warn", ["orders: 9,400 calls a day", "two", "three"], "https://x.test/run"]);
  assert.throws(() => parseOpsArgs([]), /--title is required/); assert.throws(() => parseOpsArgs(["--title", "t", "--level", "loud"]), /--level must be/); assert.throws(() => parseOpsArgs(["--title", "t", "--nope"]), /unknown argument/);
  assert.deepEqual(parseOpsArgs(["--title", "t", "--file", "gone.txt"], () => { throw new Error("ENOENT"); }).lines, ["(report gone.txt was not written)"], "a missing report is a line, not a crash");
  assert.equal(shouldPost(parseOpsArgs(["--title", "t", "--if-failed", "--status", "success"])), false); assert.equal(shouldPost(parseOpsArgs(["--title", "t", "--if-failed", "--status", "failure"])), true); assert.equal(shouldPost(parseOpsArgs(["--title", "t", "--if-failed"])), false);
  let posted = 0; const log = console.log; console.log = () => {};
  try {
    assert.deepEqual(await runOps(["--title", "t", "--line", `x ${DISCORD}`], {}, async () => { posted++; return { ok: true }; }), { posted: false, reason: "no webhook" });
    assert.deepEqual(await runOps(["--title", "t"], { OPS_WEBHOOK_URL: DISCORD }, async () => { posted++; return { ok: true, status: 204 }; }), { posted: true, reason: "posted" });
    assert.equal((await runOps(["--title", "t", "--if-failed", "--status", "success"], { OPS_WEBHOOK_URL: DISCORD }, async () => { posted++; return { ok: true }; })).posted, false);
  } finally { console.log = log; }
  assert.equal(posted, 1, "exactly one alert was delivered");
});
