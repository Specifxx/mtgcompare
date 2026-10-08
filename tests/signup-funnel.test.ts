// Sign-up attribution (lib/signup-source*.ts, the OAuth routes), the first-touch
// entry bucket (lib/entry-source.ts) and SignupWelcome.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSignupSource, SIGNUP_SOURCE_COOKIE, SIGNUP_SOURCES, PENDING_WATCH_KEY } from "../src/lib/signup-source-shared";
import { classifyEntry, isEntrySource } from "../src/lib/entry-source";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("only whitelisted sources reach the User table", () => {
  assert.equal(SIGNUP_SOURCE_COOKIE, "mc_signup_src");
  for (const s of ["watchlist_drawer", "card_alert", "quickview_alert", "premium_cta", "premium_dialog", "watch_toast"]) assert.ok(SIGNUP_SOURCES.has(s), s);
  assert.equal(parseSignupSource("watchlist_drawer"), "watchlist_drawer");
  assert.equal(parseSignupSource("<script>"), null);
  assert.equal(parseSignupSource(undefined), null);
  assert.equal(PENDING_WATCH_KEY, "mc_pending_watch");
});

test("the OAuth start stashes ?src=, and the callback stamps it on a NEW account only", () => {
  const start = read("src/app/api/auth/oauth/[provider]/route.ts");
  assert.match(start, /parseSignupSource\(new URL\(req\.url\)\.searchParams\.get\("src"\)\)/);
  const cb = read("src/app/api/auth/oauth/[provider]/callback/route.ts");
  assert.match(cb, /parseSignupSource\(cookies\(\)\.get\(SIGNUP_SOURCE_COOKIE\)/);
  assert.match(cb, /if \(isNew\) await applyReferral\(user\.id\)/);
  const accounts = read("src/lib/accounts.ts");
  // signupSource appears in the CREATE branch only — a returning sign-in never rewrites it.
  const create = accounts.slice(accounts.indexOf("prisma.user.create"));
  assert.match(create, /signupSource: opts\.signupSource \?\? null/);
  assert.equal(accounts.slice(0, accounts.indexOf("prisma.user.create")).includes("signupSource:"), false);
});

test("entry buckets: utm_source wins, then the referrer host; our own host is internal", () => {
  assert.equal(classifyEntry("", "mtgcompare.app", "?utm_source=reddit"), "reddit");
  assert.equal(classifyEntry("https://www.reddit.com/r/magicTCG/", "mtgcompare.app", ""), "reddit");
  assert.equal(classifyEntry("android-app://com.reddit.frontpage/", "mtgcompare.app", ""), "reddit");
  assert.equal(classifyEntry("https://www.google.com/", "mtgcompare.app", ""), "search");
  assert.equal(classifyEntry("https://mtgcompare.app/browse", "mtgcompare.app", ""), "internal");
  assert.equal(classifyEntry("", "mtgcompare.app", ""), "direct");
  assert.equal(classifyEntry("https://example.org/", "mtgcompare.app", "?utm_source=newsletter"), "email");
  assert.equal(classifyEntry("https://example.org/", "mtgcompare.app", ""), "other");
  assert.equal(isEntrySource("reddit"), true);
  assert.equal(isEntrySource("https://reddit.com"), false);
});

test("SignupWelcome: one sign_up per ?welcome landing, the param stripped, the stashed watch completed", () => {
  const src = read("src/components/SignupWelcome.tsx");
  assert.match(src, /trackEvent\("sign_up", \{ method: welcome \}\)/);
  assert.match(src, /fired\.current/);
  assert.match(src, /rest\.delete\("welcome"\)/);
  assert.match(src, /localStorage\.setItem\("mc_welcome_at"/);
  assert.match(src, /Your free account is ready\./);
  assert.match(src, /PENDING_WATCH_KEY/);
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /<SignupWelcome \/>/);
  assert.match(layout, /<ReferralCapture \/>/);
  assert.match(layout, /<WatchlistDrawerProvider>/);
});

test("sign-ups by source are visible to the admin", () => {
  assert.match(read("src/lib/admin-accounts.ts"), /by: \["signupSource"\]/);
  assert.match(read("src/app/admin/accounts/page.tsx"), /Sign-ups by source/);
});
