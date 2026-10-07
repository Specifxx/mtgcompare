// The price-drop alert CTA (components/PriceDropAlertCta.tsx) on the card page
// and, compact, in QuickView — in BOTH email states: with email off nothing
// promises an email and there is no email-only door.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SIGNUP_SOURCES } from "../src/lib/signup-source-shared";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const cta = read("src/components/PriceDropAlertCta.tsx");

test("QuickView renders the compact alert with its own placement, after the eBay buy path", () => {
  const qv = read("src/components/QuickView.tsx");
  assert.match(qv, /import \{ PriceDropAlertCta \} from "\.\/PriceDropAlertCta"/);
  assert.match(qv, /<PriceDropAlertCta\s+compact\s+placement="quickview_alert"/);
  const ebay = qv.indexOf('data-surface="ebay_fallback"');
  const at = qv.indexOf("<PriceDropAlertCta");
  const markets = qv.indexOf("Cheapest in every market");
  assert.ok(ebay > 0 && at > ebay && markets > at, "after the eBay buy path, above the market grid");
  assert.match(qv, /<PriceWatchButton cardId=\{data\.id\} slug=\{data\.slug\} name=\{display\(data\)\} variant="full" limitInline \/>/);
});

test("the card page puts it under the top buy block, with the site's email status", () => {
  const page = read("src/app/card/[slug]/page.tsx");
  const top = page.indexOf("<CardTopBuy");
  const at = page.indexOf("<PriceDropAlertCta");
  assert.ok(top > 0 && at > top);
  assert.match(page, /emailOn=\{emailOn\}/);
  assert.match(page, /const emailOn = \(await getEmailStatus\(\)\) === "on"/);
});

test("both placements are whitelisted sign-up sources and reach all three funnel calls", () => {
  assert.ok(SIGNUP_SOURCES.has("quickview_alert"));
  assert.ok(SIGNUP_SOURCES.has("card_alert"));
  assert.match(cta, /placement = "card_alert"/);
  assert.match(cta, /markSignupSource\(placement\)/);
  assert.match(cta, /trackSignupCta\(placement\)/);
  assert.match(cta, /trackAuthStart\(provider, placement\)/);
});

test("compact mode uses no btn-primary: the retailer buy buttons stay QuickView's only filled CTA", () => {
  const start = cta.indexOf("if (compact) {");
  const end = cta.indexOf("if (user || providers.length === 0) {", start);
  assert.ok(start > 0 && end > start);
  const compact = cta.slice(start, end);
  assert.doesNotMatch(compact, /btn-primary/);
  assert.match(compact, /\{copy\.label\}:/);
  assert.match(compact, /onClick=\{enable\}/, "signed in: one click");
  assert.match(compact, /Continue with Google/);
});

test("EMAIL OFF: the copy promises a flag on the watchlist, never an email, and offers no email-only door", () => {
  assert.match(cta, /Watch this price — we'll flag it on your watchlist when it drops \(Plus: at your own price\)/);
  // Every email-only door is behind `mail` (the email status).
  const code = cta.replace(/^\s*\/\/.*$/gm, "");
  for (const m of code.matchAll(/or (just )?email me/g)) {
    const before = code.slice(Math.max(0, m.index! - 500), m.index!);
    assert.match(before, /\{mail \? \(/, "the email door renders only when email is on");
  }
  assert.match(cta, /const mail = emailOn \?\? me\.emailOn;/);
});

test("EMAIL ON: RiftCompare's wording returns", () => {
  assert.match(cta, /\{ label: "Price-drop alert", get: "Get a price-drop alert", on: "✓ Price-drop alert on", email: "Email me when it drops" \}/);
  assert.match(cta, /We'll email you when it gets cheaper\./);
});

test("signed out, the pending watch is stashed for SignupWelcome to complete after OAuth", () => {
  assert.match(cta, /localStorage\.setItem\(PENDING_WATCH_KEY, JSON\.stringify\(\{ cardId, slug, name, market: country \}\)\)/);
  assert.match(cta, /\/api\/auth\/oauth\/\$\{provider\}\?next=\$\{encodeURIComponent\(cardPath\)\}&src=\$\{placement\}/);
});
