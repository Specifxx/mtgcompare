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
