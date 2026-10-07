// THE FREE ACCOUNT'S LIMITS — RiftCompare's lib/free-limits.ts, ported in wave 2
// (2026-10-03; DECISIONS.md, "Wave-2 free limits"). RiftCompare's owner brief,
// adopted here for parity:
//
//   "Charge for the features people use every week. Cap free portfolios …
//    and free watchlists at around 10 cards; paid gets unlimited. Keep price
//    comparison fully free, since that's what brings people in."
//   "For users with currently over 50 cards allow them to keep it but their
//    next card is the upgrade."
//
// A free account watches up to FREE_WATCHLIST_LIMIT distinct cards and keeps
// up to FREE_PORTFOLIO_LIMIT distinct cards in its portfolio. Any paid tier
// (isPremium(user): Plus, Premium, a floor, an admin) is unlimited.
//
// GRANDFATHERING — NOBODY LOSES ANYTHING. The limit only ever blocks ADDING A
// NEW CARD while the account already holds `limit` or more. Everything already
// there keeps working (alerts keep firing, the portfolio keeps valuing), and
// adding copies to a card already held, a second market for a watched card,
// editing and removing are never blocked. A lapsed subscriber over the limit
// is in exactly that position.
//
// Cards, not rows and not copies: a watch is one row per (card, market) and a
// portfolio entry one row per (card, condition, foil), so both are counted as
// DISTINCT cardId — in Postgres (the server half), never by pulling rows.
//
// OP Compare's card ids are numbers (Card.id, the TCGplayer productId), so the
// id-taking helpers are generic over string | number.
//
// Client-safe: no server imports. The routes (the enforcement), the upgrade
// panel and every tier table / FAQ / email that quotes a number read the SAME
// constants, so the promise and the check can never drift apart.

export const FREE_WATCHLIST_LIMIT = 10;
export const FREE_PORTFOLIO_LIMIT = 50;

export type FreeLimitKind = "watchlist" | "portfolio";

export const FREE_LIMITS: Record<FreeLimitKind, number> = {
  watchlist: FREE_WATCHLIST_LIMIT,
  portfolio: FREE_PORTFOLIO_LIMIT,
};

/** HTTP status for "this add needs a paid tier" — 402, used by every route. */
export const FREE_LIMIT_STATUS = 402;

/** The structured error every create route returns at the limit. */
export interface FreeLimitBody {
  error: string;
  code: "free_limit";
  kind: FreeLimitKind;
  limit: number;
  count: number;
}

const NOUN: Record<FreeLimitKind, string> = { watchlist: "watching", portfolio: "tracking" };

/** "You're watching 10 cards, the free limit." — one sentence, the real count. */
export function freeLimitHeadline(kind: FreeLimitKind, count: number): string {
  const limit = FREE_LIMITS[kind];
  const n = Math.max(count, limit);
  const where = kind === "portfolio" ? " in your portfolio" : "";
  return n > limit
    ? `You're ${NOUN[kind]} ${n} cards${where} — over the free limit of ${limit}, and you keep all of them.`
    : `You're ${NOUN[kind]} ${limit} cards${where}, the free limit.`;
}

export function freeLimitBody(kind: FreeLimitKind, count: number): FreeLimitBody {
  const limit = FREE_LIMITS[kind];
  const what = kind === "watchlist" ? "watch" : "add to your portfolio";
  return {
    error: `${freeLimitHeadline(kind, count)} Upgrade to Plus to ${what} more cards.`,
    code: "free_limit",
    kind,
    limit,
    count,
  };
}

/** A route's JSON body, if it is the free-limit error (client side). */
export function parseFreeLimit(body: unknown): FreeLimitBody | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.code !== "free_limit") return null;
  if (b.kind !== "watchlist" && b.kind !== "portfolio") return null;
  const limit = typeof b.limit === "number" ? b.limit : FREE_LIMITS[b.kind];
  const count = typeof b.count === "number" ? b.count : limit;
  return { error: typeof b.error === "string" ? b.error : freeLimitBody(b.kind, count).error, code: "free_limit", kind: b.kind, limit, count };
}

/**
 * Would adding `cardId` be blocked? The client's pre-check, from what it
 * already holds (the watched-id Set, the collection rows) — so a tap at the
 * limit shows the panel at once instead of flipping a heart and rolling it
 * back. The server re-checks; this only saves the round trip.
 */
export function wouldHitFreeLimit<Id extends string | number>(kind: FreeLimitKind, opts: { paid: boolean; held: ReadonlySet<Id>; cardId: Id }): boolean {
  if (opts.paid) return false;
  if (opts.held.has(opts.cardId)) return false;
  return opts.held.size >= FREE_LIMITS[kind];
}

/**
 * The inbox an address delivers to, for counting ANONYMOUS watches: lowercased,
 * any `+tag` dropped from the local part, and for Gmail (gmail.com /
 * googlemail.com) the dots dropped and the domain folded to gmail.com — the
 * forms that all land in one mailbox. Without it `alice+1@gmail.com`,
 * `alice+2@gmail.com` … each started again at 0 of FREE_WATCHLIST_LIMIT
 * through the email-only door. Used only to COUNT and to find a paying owner;
 * the watch is still stored and emailed at the address exactly as typed.
 * Anything that isn't a plain local@domain comes back lowercased, untouched.
 */
export function canonicalWatchEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at <= 0 || at === e.length - 1) return e;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
    domain = "gmail.com";
  }
  return local ? `${local}@${domain}` : e;
}

// The quiet "N of 10" counter: only once a free account is close (7 of 10,
// 40 of 50), never before — no nagging while the limit is far away.
const COUNTER_FROM: Record<FreeLimitKind, number> = { watchlist: 7, portfolio: 40 };

export function showFreeLimitCounter(kind: FreeLimitKind, count: number, paid: boolean): boolean {
  return !paid && count >= COUNTER_FROM[kind];
}

export function freeLimitCounterText(kind: FreeLimitKind, count: number): string {
  const limit = FREE_LIMITS[kind];
  return count > limit ? `${count} cards · free accounts add up to ${limit}` : `${count} of ${limit} free`;
}

// ── The popover's placement (FreeLimitPanel's FreeLimitPopover) ──────────
// Here, not in the component, so it is testable without React. `zClass` is the
// Tailwind z-index token from lib/motion-tokens.ts: `modal` (120) outranks the
// phone buy bar (40), every Dialog (`overlay`, 60), sheets (85) and menus (95)
// the heart can sit in — a popover under one of them is an invisible prompt.
export const FREE_LIMIT_POPOVER = { width: 288, gutter: 16, zClass: "z-modal", zToken: "modal" } as const;

/**
 * Top edge of the popover for an anchor rect and the panel's measured height:
 * 8px below the anchor when the whole panel fits above the bottom gutter,
 * otherwise 8px above it (the card page's sticky buy bar pins the heart to the
 * bottom of a phone screen) — clamped inside the viewport either way.
 */
export function freeLimitPopoverTop(anchor: { top: number; bottom: number }, height: number, viewportHeight: number): number {
  const g = FREE_LIMIT_POPOVER.gutter;
  const below = anchor.bottom + 8;
  const top = below + height <= viewportHeight - g ? below : anchor.top - 8 - height;
  return Math.max(g, Math.min(top, viewportHeight - height - g));
}

// ── The check itself ────────────────────────────────────────────────────────

/** What an account already holds, asked of the database (or a test stub). */
export interface HoldingsCounter<Id extends string | number = number> {
  /** Which of these card ids the account already holds (any market / condition). */
  held(cardIds: Id[]): Promise<Set<Id>>;
  /** Distinct cards the account holds. */
  count(): Promise<number>;
}

export interface Allowance<Id extends string | number = number> {
  /** Ids that may be written: every already-held id, then new ids up to the limit. */
  allowed: Id[];
  /** New ids refused because the account is at the limit. */
  blocked: Id[];
  /** Distinct cards held before this add, or null when it was not needed (paid, or nothing new). */
  count: number | null;
  limit: number;
}

/**
 * Split an add into what may land and what is over the free limit.
 * Paid accounts are never counted (no query at all). Ids already held are
 * always allowed — grandfathering, and re-adding a card you already have.
 * New ids fill the remaining allowance in the order given (the import's paste
 * order). The count is read only when there is something new to add.
 */
export async function checkFreeAllowance<Id extends string | number = number>(
  counter: HoldingsCounter<Id>,
  kind: FreeLimitKind,
  cardIds: Id[],
  paid: boolean,
): Promise<Allowance<Id>> {
  const limit = FREE_LIMITS[kind];
  const ids = [...new Set(cardIds)];
  if (paid || ids.length === 0) return { allowed: ids, blocked: [], count: null, limit };
  const held = await counter.held(ids);
  const fresh = ids.filter((id) => !held.has(id));
  if (fresh.length === 0) return { allowed: ids, blocked: [], count: null, limit };
  const count = await counter.count();
  const room = Math.max(0, limit - count);
  const take = new Set(fresh.slice(0, room));
  return {
    allowed: ids.filter((id) => held.has(id) || take.has(id)),
    blocked: fresh.slice(room),
    count,
    limit,
  };
}
