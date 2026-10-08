// The inbox's shared, PURE rules: status and issue lists, and the parsers every
// public form route runs before src/lib/inbox.ts writes anything. No db, no
// Next imports, so the client forms and the tests read the same lists.
//
// Every string is trimmed. Over-length input is REJECTED, never truncated, and
// an out-of-range number is a 400, never a clamp.
import { isCountry, MARKETS } from "./country";

export const REPORT_ISSUES = ["PRICE_WRONG", "OUT_OF_STOCK", "WRONG_PRINTING", "WRONG_ITEM", "LINK_BROKEN", "OTHER"] as const;
export type ReportIssue = (typeof REPORT_ISSUES)[number];
export const ISSUE_LABELS: Record<ReportIssue, string> = {
  PRICE_WRONG: "Price is wrong",
  OUT_OF_STOCK: "Out of stock",
  WRONG_PRINTING: "Wrong printing (another set, foil or non-foil, borderless / showcase / extended art)",
  WRONG_ITEM: "Wrong item",
  LINK_BROKEN: "Link is broken",
  OTHER: "Something else",
};

export const REPORT_STATUSES = ["NEW", "CONFIRMED", "REJECTED", "FIXED"] as const;
export const FEEDBACK_STATUSES = ["NEW", "APPROVED", "HIDDEN", "SPAM"] as const;
export const SUGGESTION_STATUSES = ["pending", "added", "rejected"] as const;
export const CONTACT_STATUSES = ["NEW", "DONE"] as const;
export const CONTACT_CATEGORIES = ["PAYMENT", "ACCOUNT", "PRICE_OR_STORE", "OTHER"] as const;
export const CONTACT_CATEGORY_LABELS: Record<ContactCategory, string> = {
  PAYMENT: "Payment or billing",
  ACCOUNT: "My account",
  PRICE_OR_STORE: "A price or a store",
  OTHER: "Something else",
};
export const SUPPORT_CATEGORIES = ["PAYMENT", "ACCOUNT", "OTHER"] as const;
export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = { PAYMENT: "Payment / billing", ACCOUNT: "Account", OTHER: "Something else" };
export const SUPPORT_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
export const FEEDBACK_ACTIONS = ["approve", "hide", "spam", "reopen", "delete"] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];
export type ContactStatus = (typeof CONTACT_STATUSES)[number];
export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
export type FeedbackAction = (typeof FEEDBACK_ACTIONS)[number];

export const MAX_CLAIM_CENTS = 10_000_000;

export const LIMITS = {
  reportNote: 500,
  reportPage: 200,
  storeNameMin: 2,
  storeNameMax: 80,
  storeUrl: 200,
  suggestionNote: 500,
  feedbackMessageMin: 10,
  feedbackMessageMax: 2000,
  feedbackDisplayName: 40,
  feedbackPage: 200,
  contactNameMax: 80,
  contactEmail: 200,
  contactSubject: 150,
  contactMessageMin: 10,
  contactMessageMax: 4000,
  supportSubjectMin: 3,
  supportSubjectMax: 150,
  supportMessageMin: 10,
  supportMessageMax: 4000,
} as const;

export const SOURCE_RE = /^(tcgplayer|ebay|ebay_us|store:[a-z0-9-]{1,60}|feed:[a-z0-9-]{1,60})$/;
// Letters, digits and `._+'-` before the @, a plain host after it. Deliberately
// narrower than RFC 5322: the address is shown to the owner and becomes a
// mailto: link, so `? & = % / , ; : < >` (which would smuggle cc/bcc/body
// parameters into the reply) are refused at the door.
export const EMAIL_RE = /^[A-Za-z0-9._+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/**
 * The inbox's Reply link. Each half of the address is percent-encoded, so
 * nothing in a stored address can add a header or a body to the reply; an
 * address that fails EMAIL_RE (a row from before the rule) gets no link at all.
 */
export function replyMailto(email: string, subject: string | null): string | null {
  if (!EMAIL_RE.test(email)) return null;
  const at = email.lastIndexOf("@");
  const to = `${encodeURIComponent(email.slice(0, at))}@${encodeURIComponent(email.slice(at + 1))}`;
  return `mailto:${to}?subject=${encodeURIComponent(`Re: ${subject ?? "your message to MTG Compare"}`)}`;
}

export const isIn = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/** The reporter would be told once a report is first marked FIXED. Kept for a future mailer; nothing sends mail today. */
export function shouldNotifyReporter(from: string, to: string): boolean {
  return to === "FIXED" && from !== "FIXED";
}

/** A non-empty `website` field: the hidden honeypot every form carries. */
export function isHoneypotHit(body: unknown): boolean {
  const w = rec(body)?.website;
  return typeof w === "string" && w.trim() !== "";
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };
type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null);
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/** Optional trimmed string: undefined/null/"" → null; a non-string or over-long value → an error. */
function optStr(v: unknown, max: number, name: string): { ok: true; value: string | null } | { ok: false; error: string } {
  if (v == null) return { ok: true, value: null };
  if (typeof v !== "string") return fail(`${name} must be text`);
  const s = v.trim();
  if (!s) return { ok: true, value: null };
  if (s.length > max) return fail(`${name} is too long (max ${max} characters)`);
  return { ok: true, value: s };
}

function optPage(v: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  const p = optStr(v, LIMITS.reportPage, "page");
  if (!p.ok || p.value == null) return p;
  if (!p.value.startsWith("/")) return fail("page must be a path");
  return p;
}

// ── Wrong-price report ──────────────────────────────────────────────────────
export interface PriceReportInput {
  productId: number;
  /** The unit's finish: 0 Normal, 1 Foil (an Etched product is its own productId and reports as Foil). Absent in the request = 0. */
  finish: 0 | 1;
  source: string;
  market: string;
  issue: ReportIssue;
  claimedCents: number | null;
  note: string | null;
  page: string | null;
}

export function parsePriceReport(body: unknown): Parsed<PriceReportInput> {
  const b = rec(body);
  if (!b) return fail("Invalid request");
  const productId = b.productId;
  if (typeof productId !== "number" || !Number.isInteger(productId) || productId <= 0) return fail("Unknown product");
  if (typeof b.source !== "string" || !SOURCE_RE.test(b.source)) return fail("Unknown store");
  if (!isCountry(b.market)) return fail("Unknown market");
  if (b.finish != null && b.finish !== 0 && b.finish !== 1) return fail("Unknown finish");
  const finish: 0 | 1 = b.finish === 1 ? 1 : 0;
  if (!isIn(REPORT_ISSUES, b.issue)) return fail("Pick what's wrong");
  let claimedCents: number | null = null;
  if (b.issue === "PRICE_WRONG" && b.claimedCents != null && b.claimedCents !== "") {
    const c = b.claimedCents;
    if (typeof c !== "number" || !Number.isInteger(c) || c <= 0 || c > MAX_CLAIM_CENTS) return fail("That price doesn't look right");
    claimedCents = c;
  }
  const note = optStr(b.note, LIMITS.reportNote, "Note");
  if (!note.ok) return note;
  const page = optPage(b.page);
  if (!page.ok) return page;
  return { ok: true, value: { productId, finish, source: b.source, market: b.market, issue: b.issue, claimedCents, note: note.value, page: page.value } };
}

// ── Store suggestion ────────────────────────────────────────────────────────
export interface StoreSuggestionInput {
  storeName: string;
  storeUrl: string; // https://<bare lowercase host>
  country: string;
  note: string | null;
}

/** Any store address → "https://" + its bare lowercase host (no www., no path), or null when it isn't a web address. */
export function normaliseStoreUrl(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  if (!host.includes(".") || !/^[a-z0-9.-]+$/.test(host)) return null;
  return `https://${host}`;
}

export function parseStoreSuggestion(body: unknown): Parsed<StoreSuggestionInput> {
  const b = rec(body);
  if (!b) return fail("Invalid request");
  if (typeof b.storeName !== "string") return fail("Tell us the store's name");
  const storeName = b.storeName.trim();
  if (storeName.length < LIMITS.storeNameMin || storeName.length > LIMITS.storeNameMax) return fail(`Store name must be ${LIMITS.storeNameMin}–${LIMITS.storeNameMax} characters`);
  if (typeof b.storeUrl !== "string" || !b.storeUrl.trim()) return fail("Tell us the store's web address");
  if (b.storeUrl.trim().length > LIMITS.storeUrl) return fail("That web address is too long");
  const storeUrl = normaliseStoreUrl(b.storeUrl);
  if (!storeUrl) return fail("That doesn't look like a web address");
  const country = typeof b.country === "string" ? b.country.trim().toUpperCase() : "";
  if (!(MARKETS as string[]).includes(country) && country !== "OTHER") return fail("Pick the store's market");
  const note = optStr(b.note, LIMITS.suggestionNote, "Note");
  if (!note.ok) return note;
  return { ok: true, value: { storeName, storeUrl, country, note: note.value } };
}

// ── Feedback ────────────────────────────────────────────────────────────────
export interface FeedbackInput {
  rating: number | null;
  message: string;
  consentPublic: boolean;
  displayName: string | null;
  page: string | null;
  source: "page" | "widget";
  /** Optional reply address (the feedback widget's "only if you want a reply"); never public. */
  email: string | null;
}

export function parseFeedback(body: unknown): Parsed<FeedbackInput> {
  const b = rec(body);
  if (!b) return fail("Invalid request");
  let rating: number | null = null;
  if (b.rating != null && b.rating !== "") {
    if (typeof b.rating !== "number" || !Number.isInteger(b.rating) || b.rating < 1 || b.rating > 5) return fail("Rating must be 1 to 5 stars");
    rating = b.rating;
  }
  if (b.message != null && typeof b.message !== "string") return fail("Message must be text");
  const message = typeof b.message === "string" ? b.message.trim() : "";
  if (!message && rating == null) return fail("Add a rating or a message");
  if (message && message.length < LIMITS.feedbackMessageMin) return fail(`Message must be at least ${LIMITS.feedbackMessageMin} characters`);
  if (message.length > LIMITS.feedbackMessageMax) return fail(`Message is too long (max ${LIMITS.feedbackMessageMax} characters)`);
  const consentPublic = b.consentPublic === true;
  const name = optStr(b.displayName, LIMITS.feedbackDisplayName, "Display name");
  if (!name.ok) return name;
  const page = optPage(b.page);
  if (!page.ok) return page;
  const source = b.source === "widget" ? "widget" : "page";
  let email: string | null = null;
  if (b.email != null && b.email !== "") {
    if (typeof b.email !== "string") return fail("Enter a valid email address");
    const e = b.email.trim();
    if (e) {
      if (e.length > LIMITS.contactEmail || !EMAIL_RE.test(e)) return fail("Enter a valid email address");
      email = e;
    }
  }
  return { ok: true, value: { rating, message, consentPublic, displayName: consentPublic ? name.value : null, page: page.value, source, email } };
}

// ── Contact message ─────────────────────────────────────────────────────────
export interface ContactInput {
  name: string;
  email: string;
  subject: string | null;
  category: ContactCategory;
  message: string;
}

export function parseContactMessage(body: unknown): Parsed<ContactInput> {
  const b = rec(body);
  if (!b) return fail("Invalid request");
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name || name.length > LIMITS.contactNameMax) return fail(`Name must be 1–${LIMITS.contactNameMax} characters`);
  const email = typeof b.email === "string" ? b.email.trim() : "";
  if (!email || email.length > LIMITS.contactEmail || !EMAIL_RE.test(email)) return fail("Enter a valid email address");
  const subject = optStr(b.subject, LIMITS.contactSubject, "Subject");
  if (!subject.ok) return subject;
  let category: ContactCategory = "OTHER";
  if (b.category != null && b.category !== "") {
    if (!isIn(CONTACT_CATEGORIES, b.category)) return fail("Pick a topic");
    category = b.category;
  }
  const message = typeof b.message === "string" ? b.message.trim() : "";
  if (message.length < LIMITS.contactMessageMin) return fail(`Message must be at least ${LIMITS.contactMessageMin} characters`);
  if (message.length > LIMITS.contactMessageMax) return fail(`Message is too long (max ${LIMITS.contactMessageMax} characters)`);
  return { ok: true, value: { name, email, subject: subject.value, category, message } };
}

// ── Support ticket ──────────────────────────────────────────────────────────
export interface SupportInput {
  name: string;
  email: string;
  category: SupportCategory;
  subject: string;
  message: string;
}

/** A /support submission. An unknown or retired category (an old ?category=ORDER link) is "Something else", never an error. */
export function parseSupportTicket(body: unknown): Parsed<SupportInput> {
  const b = rec(body);
  if (!b) return fail("Invalid request");
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name || name.length > LIMITS.contactNameMax) return fail(`Name must be 1–${LIMITS.contactNameMax} characters`);
  const email = typeof b.email === "string" ? b.email.trim() : "";
  if (!email || email.length > LIMITS.contactEmail || !EMAIL_RE.test(email)) return fail("Enter a valid email address");
  const category: SupportCategory = isIn(SUPPORT_CATEGORIES, b.category) ? b.category : "OTHER";
  const subject = typeof b.subject === "string" ? b.subject.trim() : "";
  if (subject.length < LIMITS.supportSubjectMin || subject.length > LIMITS.supportSubjectMax) return fail(`Subject must be ${LIMITS.supportSubjectMin}–${LIMITS.supportSubjectMax} characters`);
  const message = typeof b.message === "string" ? b.message.trim() : "";
  if (message.length < LIMITS.supportMessageMin) return fail(`Message must be at least ${LIMITS.supportMessageMin} characters`);
  if (message.length > LIMITS.supportMessageMax) return fail(`Message is too long (max ${LIMITS.supportMessageMax} characters)`);
  return { ok: true, value: { name, email, category, subject, message } };
}
