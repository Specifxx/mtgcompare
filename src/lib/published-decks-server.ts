import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { checkDeck, mergeLines, parseDeckList, resolveDeck, formatDeckLine, basePrinting, type CardIndex } from "./deck";
import { deckIndex } from "./deck-price";
import type { CardLite, Catalog } from "./data";
import {
  DECK_MAX_UNMATCHED,
  DECK_MIN_CARDS,
  deckShapeError,
  deckSlug,
  deckTotals,
  leaderSlugFrom,
  type DeckShape,
  type MarketTotals,
} from "./published-decks";

// Server half of the deck library (RiftCompare's lib/published-decks-server.ts;
// lib/published-decks.ts has the rules). A list resolves EXACTLY the way /deck
// prices it — lib/deck.ts over the cached catalogue — so a published deck holds
// the printings the builder showed. The only writes are the explicit publish
// (/api/decks) and the admin import and hide/show (/api/admin/decks). Pages read
// the library through the cached data.ts loaders, never through this file.

export interface PreparedDeck {
  lines: { cardId: number; qty: number }[];
  list: string;
  cardIds: number[];
  cardCount: number;
  shape: DeckShape;
  colors: string[];
  unmatched: string[];
  totals: MarketTotals;
}

/** Resolves a pasted list the way /deck prices it, merging repeat lines. DON!! lines are never cards. */
export function prepareDeckWith(text: string, cat: Pick<Catalog, "byId">, idx: CardIndex<CardLite>): PreparedDeck {
  const resolved = mergeLines(resolveDeck(parseDeckList(text), idx));
  const matched = resolved.filter((r): r is typeof r & { card: CardLite } => r.card != null && !r.fuzzy);
  const unmatched = resolved.filter((r) => !r.card || r.fuzzy).map((r) => r.line.raw);
  const entries = matched.map((m) => ({ card: m.card, qty: Math.min(99, m.line.qty), leader: m.card.cardType === "Leader" }));
  const leaders = entries.filter((e) => e.leader);
  const check = checkDeck(entries.map((e) => ({ qty: e.qty, number: e.card.number, isLeader: e.leader })));
  const leader = leaders[0]?.card;
  return {
    lines: entries.map((e) => ({ cardId: e.card.id, qty: e.qty })),
    list: entries
      .sort((a, b) => Number(b.leader) - Number(a.leader))
      .map((e) => {
        const base = e.card.number ? basePrinting(idx.byNumber.get(e.card.number) ?? [e.card]) : e.card;
        return formatDeckLine(e.qty, e.card, e.card.id !== base?.id);
      })
      .join("\n"),
    cardIds: entries.map((e) => e.card.id),
    cardCount: entries.reduce((n, e) => n + e.qty, 0),
    shape: { leaders: leaders.map((l) => ({ id: l.card.id, name: l.card.name, number: l.card.number })), mainCards: check.mainCards, overLimit: check.overLimit },
    colors: leader?.colors ?? [],
    unmatched,
    totals: deckTotals(entries.map((e) => ({ qty: e.qty, card: cat.byId.get(e.card.id) ?? e.card }))),
  };
}

export async function prepareDeck(text: string): Promise<PreparedDeck> {
  const { cat, idx } = await deckIndex();
  return prepareDeckWith(text, cat, idx);
}

export type PublishInput = {
  title: string;
  description: string | null;
  text: string;
  userId: string | null;
  authorName: string | null;
  source: "user" | "import";
};

export type PublishResult = { ok: true; slug: string; leaderSlug: string } | { ok: false; error: string };

/** The checks a deck must pass to be published (pure, for tests and the route). */
export function publishError(deck: PreparedDeck): string | null {
  if (deck.unmatched.length > DECK_MAX_UNMATCHED) return `${deck.unmatched.length} lines didn't match a card — fix them in the deck builder first.`;
  if (deck.cardCount < DECK_MIN_CARDS && !deck.shape.leaders.length) return `A published deck needs its Leader and 50 cards (this list has ${deck.cardCount}).`;
  return deckShapeError(deck.shape);
}

export async function publishDeck(input: PublishInput, db: Pick<typeof prisma, "publishedDeck"> = prisma): Promise<PublishResult> {
  const deck = await prepareDeck(input.text);
  const err = publishError(deck);
  if (err) return { ok: false, error: err };
  const leader = deck.shape.leaders[0]!;
  if (input.userId) {
    const dup = await db.publishedDeck.findFirst({ where: { userId: input.userId, list: deck.list }, select: { slug: true } });
    if (dup) return { ok: false, error: "You've already published this exact list." };
  }
  const leaderSlug = leaderSlugFrom(leader.name, leader.number);
  const slug = deckSlug(input.title, randomBytes(4).toString("hex"));
  await db.publishedDeck.create({
    data: {
      slug,
      userId: input.userId,
      authorName: input.authorName,
      title: input.title,
      description: input.description,
      leaderCardId: leader.id,
      leaderName: leader.name,
      leaderSlug,
      colors: deck.colors.join(","),
      list: deck.list,
      lines: deck.lines,
      cardIds: deck.cardIds,
      cardCount: deck.cardCount,
      publishedTotals: deck.totals as Prisma.InputJsonValue,
      source: input.source,
    },
  });
  return { ok: true, slug, leaderSlug };
}

/** Publishes in the last 24 hours by this account (the daily cap is counted in the database). */
export async function publishesToday(userId: string, db: Pick<typeof prisma, "publishedDeck"> = prisma): Promise<number> {
  return db.publishedDeck.count({ where: { userId, createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
}
