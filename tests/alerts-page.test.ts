import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { staticEntries } from "../src/lib/sitemap-sections";
import { alertsAnswer, alertsFaqs, alertsPlusCopy } from "../src/lib/alerts-copy";
import { DROP_MIN_CENTS, DROP_MIN_PCT } from "../src/lib/alert-thresholds";
import { BELOW_MARKET_MIN_PCT, OUTLIER_DROP_PCT, TARGET_REFIRE_STEP_PCT } from "../src/lib/price-alerts";
import { PLUS_TARGET_ALERT_LIMIT } from "../src/lib/alert-limits";
import { FREE_WATCHLIST_LIMIT } from "../src/lib/free-limits";

// ─────────────────────────────────────────────────────────────────────────────
// The /alerts page's words (lib/alerts-copy.ts) against the code they describe.
// Every number is the enforced constant, quoted; and while email is OFF no
// sentence promises an email (wave2-plan §1).
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const all = (emailOn: boolean) => [alertsAnswer(emailOn), alertsPlusCopy(emailOn), ...alertsFaqs(emailOn).flatMap((f) => [f.q, f.a])].join("\n");

test("the FAQ quotes the enforced constants, in both versions", () => {
  assert.equal(DROP_MIN_PCT, 5);
  assert.equal(DROP_MIN_CENTS, 50);
  assert.equal(OUTLIER_DROP_PCT, 40);
  assert.equal(BELOW_MARKET_MIN_PCT, 15);
  assert.equal(TARGET_REFIRE_STEP_PCT, 10);
  for (const emailOn of [false, true]) {
    const text = all(emailOn);
    assert.ok(text.includes(`at least ${DROP_MIN_PCT}% (and at least ${DROP_MIN_CENTS} cents or pence)`), `drop floor (${emailOn})`);
    assert.ok(text.includes(`more than ${OUTLIER_DROP_PCT}% under`), "outlier hold");
    assert.ok(text.includes(`at least ${BELOW_MARKET_MIN_PCT}% under`), "below-market floor");
    assert.ok(text.includes(`another ${TARGET_REFIRE_STEP_PCT}%`), "target re-fire step");
    assert.ok(text.includes(`${FREE_WATCHLIST_LIMIT} cards`), "free watch limit");
    assert.ok(text.includes(`up to ${PLUS_TARGET_ALERT_LIMIT} cards`), "Plus target limit");
  }
  assert.doesNotMatch(code("src/lib/alerts-copy.ts").replace(/^\s*\*.*$/gm, ""), /\b(5%|40%|15%|10 cards|50 cents)/, "no number is typed in the copy");
});

test("email OFF: no sentence promises an email; the one mention says there are none yet", () => {
  const off = all(false);
  assert.doesNotMatch(off, /email you|emailed|be emailed|an alert email|alert emails? (will|arrive)|by email|in your inbox/i);
  const mentions = off.match(/[^.]*\bemail\w*[^.]*\./gi) ?? [];
  for (const m of mentions) assert.match(m, /We don't send alert emails yet/, `an unexpected email promise: ${m.trim()}`);
  assert.match(off, /flag/i);
  assert.match(off, /dashboard/i);
  assert.match(off, /Where do alerts show up\?/);
});

test("email ON: RiftCompare's email copy, rebranded, and no claim MTG Compare cannot keep", () => {
  const on = all(true);
  assert.match(on, /How often will I actually get emailed\?/);
  assert.match(on, /At most one email a week/);
  assert.match(on, /Snooze 30 days/);
  assert.doesNotMatch(on, /riftbound|riftcompare|radiance|cardtrader|shipping included|including shipping|lowest live total/i);
  assert.match(on, /postage is added at each store's checkout/, "item price, never a delivered claim");
  assert.doesNotMatch(on, /money back|buyer protection/i);
});

test("the page reads the status switch, renders per request (it reaches the data barrel) and quotes the Plus limit through the lib", () => {
  const page = code("src/app/alerts/page.tsx");
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.doesNotMatch(page, /export const revalidate/, "an ISR page would bake the email switch in at build time");
  assert.match(page, /getEmailStatus\(\)\) === "on"/);
  assert.match(page, /alertsFaqs\(emailOn\)/);
  assert.match(page, /faqLd\(faqs\)/, "the JSON-LD is built from the same FAQ the page renders");
  assert.match(page, /Magic: The Gathering Price Alerts & Watchlists \| MTG Compare/);
  assert.match(page, /Plus is ad-free/);
  assert.doesNotMatch(page, /cookies\(|getCurrentUser|prisma/, "a public page reads no session and no database");
  assert.ok(staticEntries(undefined).map((e) => e.loc).some((l) => l.endsWith("/alerts")), "/alerts is in the sitemap (src/lib/sitemap-sections.ts)");
});

test("the signup CTA points at the free account, attributed", () => {
  const cta = read("src/components/AlertsSignupCta.tsx");
  assert.match(cta, /\/login\?next=\/watchlist&src=alerts_page/);
  assert.doesNotMatch(cta, /email/i, "no email field and no email promise here");
});

test("the page never renders an email field while email is off", () => {
  const page = read("src/app/alerts/page.tsx");
  assert.doesNotMatch(page, /type="email"|NewsletterSignup|PriceAlertModal/);
});
