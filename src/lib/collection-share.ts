// Public share links for a collection (/c/<token>), plus the post text a
// collector pastes into a trading group — the collection half of RiftCompare's
// lib/share.ts, ported in wave 2 (2026-10-03).
//
// WHY THESE EXIST. One Piece trading happens in Discord and Facebook groups, not
// on price sites. A collection that can only be seen by signing in cannot travel
// there, so the site is absent from the exact conversation where a trade gets
// made. A link that opens to the cards and their value puts us in that
// conversation for free, every time somebody shares one.
//
// ── TWO RULES THIS FILE ENFORCES ────────────────────────────────────────────
// 1. A share token is a CAPABILITY, not an identifier. Anyone holding the URL
//    sees the page — there is no second check — so the token must be
//    unguessable (crypto random), must not be derived from the row id, and
//    rotating it must genuinely revoke every link already posted. Once a URL is
//    pasted into a public channel, rotation is the only revocation that works.
//    User.collectionShareId is the ONE source of truth: null means the page 404s.
// 2. The public projection below selects fields EXPLICITLY. CollectionCard
//    carries costBasisCents (what the owner paid) and a private note; neither
//    may appear on a page anyone can open. Selecting by name means a future
//    column is invisible here until somebody deliberately adds it.
//
// Egress (CLAUDE.md, the accounts exception): one unique-key user read and one
// select-limited, capped row read per view, no card join (cards come from the
// cached catalogue). /c/[token] has no share image of its own: it uses the
// root fallback (DECISIONS, "Shared binder: the root share image").
import { randomBytes } from "node:crypto";
import { prisma } from "./db";
import { getCatalog } from "./data";
import { type Country } from "./country";
import { CONDITION_MULTIPLIER } from "./collection-conditions";
import { SITE_URL } from "./site";
import { money } from "./format";
import { COLLECTION_TAKE, cardInfo, displayName, type CollectionCardInfo } from "./collection-server";

/**
 * 16 bytes of CSPRNG entropy, base64url: the same 128 bits as a UUID with no
 * structure to read into it, and URL-safe without escaping (these strings get
 * pasted into chat clients that mangle anything needing encoding).
 */
export function newShareToken(): string {
  return randomBytes(16).toString("base64url");
}

/** Tokens are opaque; reject anything that cannot be one before hitting the DB. */
export function isShareToken(v: string | undefined | null): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(v);
}

const condMult = (condition: string) => CONDITION_MULTIPLIER[condition] ?? 1;

export type SharedHolding = {
  card: CollectionCardInfo;
  condition: string;
  isFoil: boolean;
  quantity: number;
  /** Per-copy value in the viewing market, condition-adjusted. null = unpriced. */
  unitCents: number | null;
};

export type SharedCollection = {
  ownerName: string;
  holdings: SharedHolding[];
  totalCents: number;
  /** Copies owned, counting quantity — not distinct cards. */
  totalCopies: number;
  distinctCards: number;
  country: Country;
};

/** The current link state for one account. */
export async function collectionShareToken(userId: string): Promise<string | null> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { collectionShareId: true } });
  return row?.collectionShareId ?? null;
}

/**
 * Turn on sharing for an account, or return the existing link. Idempotent: a
 * "Share" button that minted a NEW token every click would silently break the
 * link the user shared thirty seconds ago. Rotation is a separate action.
 */
export async function enableCollectionShare(userId: string): Promise<string> {
  const existing = await collectionShareToken(userId);
  if (existing) return existing;
  const token = newShareToken();
  await prisma.user.update({ where: { id: userId }, data: { collectionShareId: token } });
  return token;
}

/** Mint a fresh token, invalidating every link already posted. */
export async function rotateCollectionShare(userId: string): Promise<string> {
  const token = newShareToken();
  await prisma.user.update({ where: { id: userId }, data: { collectionShareId: token } });
  return token;
}

/** Turn sharing off entirely. The public page 404s immediately afterwards. */
export async function disableCollectionShare(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { collectionShareId: null } });
}

/**
 * The public projection of a shared collection. null for an unknown/rotated
 * token so the caller can 404 — never a partial or empty-but-valid page, which
 * would confirm the token exists.
 *
 * NOTE ON WHAT IS ABSENT: no costBasisCents, no profit/loss, no note, no email.
 * A shared collection answers "what do you own and what is it worth today".
 */
export async function getSharedCollection(token: string, country: Country): Promise<SharedCollection | null> {
  if (!isShareToken(token)) return null;
  const owner = await prisma.user.findUnique({
    where: { collectionShareId: token },
    select: { id: true, displayName: true },
  });
  if (!owner) return null;

  const [rows, cat] = await Promise.all([
    prisma.collectionCard.findMany({
      where: { userId: owner.id },
      take: COLLECTION_TAKE,
      // Explicit — see the file header. No cost column, no note.
      select: { cardId: true, condition: true, isFoil: true, quantity: true },
    }),
    getCatalog(),
  ]);

  let totalCents = 0;
  let totalCopies = 0;
  const holdings: SharedHolding[] = [];
  for (const r of rows) {
    const c = cat.byId.get(r.cardId);
    if (!c) continue;
    const card = cardInfo(c, cat.setById.get(c.setId)?.code ?? "");
    const market = card.low[country];
    const unitCents = market != null ? Math.round(market * condMult(r.condition)) : null;
    totalCents += (unitCents ?? 0) * r.quantity;
    totalCopies += r.quantity;
    holdings.push({ card, condition: r.condition, isFoil: r.isFoil, quantity: r.quantity, unitCents });
  }
  // Most valuable first: a shared collection is browsed, not searched.
  holdings.sort((a, b) => (b.unitCents ?? 0) * b.quantity - (a.unitCents ?? 0) * a.quantity);

  return {
    ownerName: owner.displayName,
    holdings,
    totalCents,
    totalCopies,
    distinctCards: new Set(holdings.map((h) => h.card.id)).size,
    country,
  };
}

export const shareUrlForCollection = (token: string) => `${SITE_URL}/c/${token}`;

/**
 * The copy-paste post for a trading group. Plain text on purpose — Discord,
 * Facebook groups, Reddit and WhatsApp each render markdown differently or not
 * at all, and stray asterisks read as spam. One fact per line survives every
 * client intact.
 */
export function collectionPostText(c: {
  ownerName: string;
  distinctCards: number;
  totalCopies: number;
  totalCents: number;
  country: Country;
  top: { card: { name: string; variant: string | null }; unitCents: number | null }[];
  url: string;
}): string {
  const lines = [
    `${c.ownerName}'s One Piece collection — ${c.distinctCards} card${c.distinctCards === 1 ? "" : "s"}` +
      `${c.totalCopies !== c.distinctCards ? ` (${c.totalCopies} copies)` : ""}, ${money(c.totalCents, c.country)} at today's prices`,
  ];
  for (const t of c.top.slice(0, 3)) {
    lines.push(`· ${displayName(t.card)}${t.unitCents != null ? ` — ${money(t.unitCents, c.country)}` : ""}`);
  }
  lines.push(c.url);
  return lines.join("\n");
}
