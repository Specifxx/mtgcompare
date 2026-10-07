// The public inbox forms (wrong-price reports, store suggestions, feedback,
// contact) and their admin queue: parsers, anti-abuse rules and the things
// that must never be stored.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ISSUE_LABELS,
  LIMITS,
  MAX_CLAIM_CENTS,
  REPORT_ISSUES,
  isHoneypotHit,
  normaliseStoreUrl,
  parseContactMessage,
  parseFeedback,
  parsePriceReport,
  parseStoreSuggestion,
  shouldNotifyReporter,
} from "../src/lib/inbox-rules";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const s = (n: number, c = "a") => c.repeat(n);

// ── Wrong-price report ──────────────────────────────────────────────────────
const report = (p: Record<string, unknown> = {}) => ({ productId: 123, source: "store:cherry", market: "AU", issue: "PRICE_WRONG", ...p });

test("price report: valid input passes", () => {
  const r = parsePriceReport(report({ claimedCents: 1299, note: " cheaper ", page: "/card/x" }));
  assert.ok(r.ok);
  assert.deepEqual(r.value, { productId: 123, source: "store:cherry", market: "AU", issue: "PRICE_WRONG", claimedCents: 1299, note: "cheaper", page: "/card/x" });
  assert.ok(parsePriceReport(report({ source: "tcgplayer", market: "US" })).ok);
});

test("price report: product, source, market and issue are checked", () => {
  for (const bad of [0, -1, 1.5, "123", null]) assert.equal(parsePriceReport(report({ productId: bad })).ok, false, `productId ${bad}`);
  for (const bad of ["ebay_uk", "ebay2", "store:", "store:Bad_Key", `store:${s(61)}`, "tcgplayer2"]) assert.equal(parsePriceReport(report({ source: bad })).ok, false, `source ${bad}`);
  assert.ok(parsePriceReport(report({ source: `store:${s(60)}` })).ok);
  // eBay rows (the eBay pass) can be reported like any row.
  for (const ok of ["ebay", "ebay_us"]) assert.ok(parsePriceReport(report({ source: ok })).ok, ok);
  assert.equal(parsePriceReport(report({ market: "JP" })).ok, false, "an unknown market is rejected, not defaulted");
  assert.equal(parsePriceReport(report({ market: "us" })).ok, false);
  assert.equal(parsePriceReport(report({ issue: "BAD" })).ok, false, "an unknown issue is rejected");
  assert.equal(parsePriceReport(null).ok, false);
});

test("price report: the claimed price is bounded, never clamped, and only for PRICE_WRONG", () => {
  for (const bad of [0, -5, MAX_CLAIM_CENTS + 1, 12.5, "1299"]) assert.equal(parsePriceReport(report({ claimedCents: bad })).ok, false, `claimedCents ${bad}`);
  const max = parsePriceReport(report({ claimedCents: MAX_CLAIM_CENTS }));
  assert.ok(max.ok && max.value.claimedCents === MAX_CLAIM_CENTS);
  const other = parsePriceReport(report({ issue: "OUT_OF_STOCK", claimedCents: 999999999 }));
  assert.ok(other.ok && other.value.claimedCents === null, "ignored for other issues");
});

test("price report: note and page caps", () => {
  assert.ok(parsePriceReport(report({ note: s(LIMITS.reportNote) })).ok);
  assert.equal(parsePriceReport(report({ note: s(LIMITS.reportNote + 1) })).ok, false);
  assert.ok(parsePriceReport(report({ page: "/" + s(199) })).ok);
  assert.equal(parsePriceReport(report({ page: "/" + s(200) })).ok, false);
  assert.equal(parsePriceReport(report({ page: "https://evil.example/" })).ok, false, "a page is a path");
});

// ── Store suggestion ────────────────────────────────────────────────────────
const suggestion = (p: Record<string, unknown> = {}) => ({ storeName: "Card Cove", storeUrl: "https://www.CardCove.com/collections/one-piece?x=1", country: "UK", ...p });

test("store suggestion: the URL is normalised to a bare https host", () => {
  const r = parseStoreSuggestion(suggestion());
  assert.ok(r.ok);
  assert.equal(r.value.storeUrl, "https://cardcove.com");
  assert.equal(normaliseStoreUrl("cardcove.com/products/x"), "https://cardcove.com");
  assert.equal(normaliseStoreUrl("http://WWW.shop.example.co.uk/"), "https://shop.example.co.uk");
  assert.equal(normaliseStoreUrl("javascript:alert(1)"), null);
  assert.equal(normaliseStoreUrl("ftp://files.example.com"), null);
  assert.equal(normaliseStoreUrl("localhost"), null, "a host without a dot");
  assert.equal(parseStoreSuggestion(suggestion({ storeUrl: "javascript:alert(1)" })).ok, false);
});

test("store suggestion: caps and markets", () => {
  assert.ok(parseStoreSuggestion(suggestion({ storeName: s(LIMITS.storeNameMin) })).ok);
  assert.equal(parseStoreSuggestion(suggestion({ storeName: s(LIMITS.storeNameMin - 1) })).ok, false);
  assert.ok(parseStoreSuggestion(suggestion({ storeName: s(LIMITS.storeNameMax) })).ok);
  assert.equal(parseStoreSuggestion(suggestion({ storeName: s(LIMITS.storeNameMax + 1) })).ok, false);
  assert.equal(parseStoreSuggestion(suggestion({ storeUrl: "https://a.com/" + s(LIMITS.storeUrl) })).ok, false);
  assert.ok(parseStoreSuggestion(suggestion({ note: s(LIMITS.suggestionNote) })).ok);
  assert.equal(parseStoreSuggestion(suggestion({ note: s(LIMITS.suggestionNote + 1) })).ok, false);
  assert.ok(parseStoreSuggestion(suggestion({ country: "OTHER" })).ok);
  assert.equal(parseStoreSuggestion(suggestion({ country: "JP" })).ok, false);
});

// ── Feedback ────────────────────────────────────────────────────────────────
test("feedback: a bare rating is enough; a short message is not", () => {
  const r = parseFeedback({ rating: 5 });
  assert.ok(r.ok && r.value.rating === 5 && r.value.message === "");
  assert.equal(parseFeedback({}).ok, false, "a rating or a message is required");
  assert.equal(parseFeedback({ message: s(LIMITS.feedbackMessageMin - 1) }).ok, false);
  assert.ok(parseFeedback({ message: s(LIMITS.feedbackMessageMin) }).ok);
  assert.ok(parseFeedback({ message: s(LIMITS.feedbackMessageMax) }).ok);
  assert.equal(parseFeedback({ message: s(LIMITS.feedbackMessageMax + 1) }).ok, false);
  for (const bad of [0, 6, 2.5, "5"]) assert.equal(parseFeedback({ rating: bad }).ok, false, `rating ${bad}`);
});

test("feedback: the display name is kept only with consent", () => {
  const no = parseFeedback({ rating: 4, displayName: "Zoro" });
  assert.ok(no.ok && no.value.displayName === null && no.value.consentPublic === false);
  const yes = parseFeedback({ rating: 4, displayName: " Zoro ", consentPublic: true });
  assert.ok(yes.ok && yes.value.displayName === "Zoro");
  assert.equal(parseFeedback({ rating: 4, consentPublic: true, displayName: s(LIMITS.feedbackDisplayName + 1) }).ok, false);
  const src = parseFeedback({ rating: 4, source: "elsewhere" });
  assert.ok(src.ok && src.value.source === "page");
});

test("feedback: the widget's optional reply address is validated, never required", () => {
  const none = parseFeedback({ rating: 2, source: "widget" });
  assert.ok(none.ok && none.value.email === null && none.value.source === "widget");
  const blank = parseFeedback({ rating: 2, email: "  " });
  assert.ok(blank.ok && blank.value.email === null);
  const ok = parseFeedback({ rating: 2, email: " luffy@example.com " });
  assert.ok(ok.ok && ok.value.email === "luffy@example.com");
  assert.equal(parseFeedback({ rating: 2, email: "not-an-email" }).ok, false);
  assert.equal(parseFeedback({ rating: 2, email: 42 }).ok, false);
  assert.equal(parseFeedback({ rating: 2, email: `${"a".repeat(200)}@example.com` }).ok, false);
});

// ── Contact ─────────────────────────────────────────────────────────────────
const contact = (p: Record<string, unknown> = {}) => ({ name: "Nami", email: "nami@example.com", message: "My payment failed twice.", ...p });

test("contact: valid input, caps and categories", () => {
  const r = parseContactMessage(contact({ category: "PAYMENT", subject: "Billing" }));
  assert.ok(r.ok && r.value.category === "PAYMENT" && r.value.subject === "Billing");
  const d = parseContactMessage(contact());
  assert.ok(d.ok && d.value.category === "OTHER", "category defaults to OTHER");
  assert.equal(parseContactMessage(contact({ category: "NOPE" })).ok, false);
  assert.equal(parseContactMessage(contact({ name: "" })).ok, false);
  assert.ok(parseContactMessage(contact({ name: s(LIMITS.contactNameMax) })).ok);
  assert.equal(parseContactMessage(contact({ name: s(LIMITS.contactNameMax + 1) })).ok, false);
  for (const bad of ["nami", "nami@", "na mi@x.com", `${s(200)}@x.com`]) assert.equal(parseContactMessage(contact({ email: bad })).ok, false, bad);
  assert.equal(parseContactMessage(contact({ subject: s(LIMITS.contactSubject + 1) })).ok, false);
  assert.equal(parseContactMessage(contact({ message: s(LIMITS.contactMessageMin - 1) })).ok, false);
  assert.ok(parseContactMessage(contact({ message: s(LIMITS.contactMessageMax) })).ok);
  assert.equal(parseContactMessage(contact({ message: s(LIMITS.contactMessageMax + 1) })).ok, false);
});

// ── Anti-abuse and the mailer hook ──────────────────────────────────────────
test("the honeypot fires only on a non-empty website field", () => {
  assert.equal(isHoneypotHit({ website: "http://spam" }), true);
  assert.equal(isHoneypotHit({ website: "" }), false);
  assert.equal(isHoneypotHit({ website: "   " }), false);
  assert.equal(isHoneypotHit({}), false);
  assert.equal(isHoneypotHit(null), false);
});

test("shouldNotifyReporter: only the first move to FIXED", () => {
  assert.equal(shouldNotifyReporter("NEW", "FIXED"), true);
  assert.equal(shouldNotifyReporter("FIXED", "FIXED"), false);
  assert.equal(shouldNotifyReporter("NEW", "CONFIRMED"), false);
});

test("every form's honeypot is display:none, and the issue list is shared", () => {
  for (const f of ["ReportPriceButton", "SuggestStoreForm", "ContactForm", "FeedbackForm"]) {
    const src = read(`src/components/${f}.tsx`);
    const inputs = src.match(/<input name="website"[^>]*>/g) ?? [];
    assert.ok(inputs.length >= 1, `${f} has a honeypot`);
    for (const i of inputs) assert.match(i, /className="hidden"/, `${f}: the honeypot must be display:none`);
    assert.doesNotMatch(src, /we['’]ll email you/i, `${f} promises no email`);
  }
  const btn = read("src/components/ReportPriceButton.tsx");
  assert.match(btn, /import \{[^}]*REPORT_ISSUES[^}]*\} from "@\/lib\/inbox-rules"/);
  assert.equal(REPORT_ISSUES.length, Object.keys(ISSUE_LABELS).length);
});

test("the price we showed comes from the Offer row, never the request", () => {
  const route = read("src/app/api/price-report/route.ts");
  assert.doesNotMatch(route, /shownPriceCents|priceCents/);
  assert.doesNotMatch(read("src/components/ReportPriceButton.tsx"), /priceCents/);
  assert.match(read("src/lib/inbox.ts"), /prisma\.offer\.findUnique/);
});

const PUBLIC_ROUTES = ["price-report", "stores/suggest", "feedback", "contact"].map((r) => `src/app/api/${r}/route.ts`);

test("public routes: POST only, same-origin, rate-limited, no IP stored", () => {
  const gate = read("src/lib/public-form.ts");
  assert.match(gate, /sameOrigin\(req\)/);
  assert.match(gate, /isHoneypotHit\(body\)/);
  assert.match(gate, /rateLimit\(/);
  assert.match(gate, /ipKey\(req\)/);
  assert.doesNotMatch(gate, /clientIp\(/);
  for (const f of PUBLIC_ROUTES) {
    const src = read(f);
    assert.match(src, /export async function POST/, f);
    assert.doesNotMatch(src, /export async function (GET|PUT|PATCH|DELETE)/, f);
    assert.match(src, /publicFormGate\(req/, f);
    assert.doesNotMatch(src, /\bip:|clientIp\(/, `${f} must not store or read a raw IP`);
  }
  const limiter = read("src/lib/rate-limit.ts");
  const outsideIpKey = limiter.replace(/export function ipKey[\s\S]*?\n\}/, "").replace(/export function clientIp[\s\S]*?\n\}/, "");
  assert.doesNotMatch(outsideIpKey, /clientIp\(/, "clientIp is used only inside ipKey");
});

test("the inbox tables have no IP column and no foreign key to User", () => {
  const schema = read("prisma/schema.prisma");
  for (const model of ["PriceReport", "StoreSuggestion", "Feedback", "ContactMessage"]) {
    const m = schema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`));
    assert.ok(m, `${model} exists`);
    assert.doesNotMatch(m![1]!, /^\s*ip\w*\s/im, `${model} has no ip field`);
    assert.doesNotMatch(m![1]!, /@relation|\bUser\b/, `${model} has no relation to User`);
  }
  for (const model of ["PriceReport", "StoreSuggestion"]) {
    const m = schema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`))!;
    assert.doesNotMatch(m[1]!, /^\s*email\s/m, `${model} keeps no email`);
  }
  // Wave 2 (RiftCompare parity, DECISIONS "Wave-2 schema"): Feedback may carry
  // an OPTIONAL reply address the visitor typed — nullable, never public.
  const fb = schema.match(/model Feedback \{([\s\S]*?)\n\}/)![1]!;
  assert.match(fb, /^\s*email\s+String\?\s/m, "Feedback's reply address is optional");
});

test("admin moderation: approve needs consent; every inbox route is gated", () => {
  const src = read("src/lib/admin-inbox.ts");
  assert.match(src, /if \(!row\.consentPublic\) return \{ ok: false, status: 400/);
  for (const r of ["price-reports", "store-suggestions", "feedback", "contact"]) {
    assert.match(read(`src/app/api/admin/${r}/route.ts`), /requireAdminApi\(req, \{ mutation: true \}\)/, r);
  }
  assert.match(src, /When a mailer exists: notify the reporter when shouldNotifyReporter/);
});
