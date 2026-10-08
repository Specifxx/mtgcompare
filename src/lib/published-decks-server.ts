import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import type { Format } from "./constants";
import type { DeckReport } from "./commander-rules";
import { parseDeckList } from "./deck";
import { canonicalText, checkResolved, loaderData, pricedCard, resolveDeckLines, withInferredCommanders, type DeckData, type DeckRow } from "./deck-price";
import { DEFAULT_PUBLISH_FORMAT, deckShapeError, deckSlug, deckTotals, isPublishFormat, type MarketTotals } from "./published-decks";

// Server half of the deck library (lib/published-decks.ts has the rules). A list resolves EXACTLY the way /deck prices it — lib/deck-price.ts over the published
// data — so a published deck holds the printings and finishes the builder showed. The only writes are the explicit publish (/api/decks) and the admin import
// and hide/show (/api/admin/decks). Pages read the library through the cached data loaders (lib/data/decks.ts), never through this file.
//
// What is stored (PublishedDeck): the commander (and its partner) by product id and Oracle slug, the identity mask the deck is held to, the canonical list text,
// the lines as { cardId, qty, finish? } (the deck proper: the commander slot and the main deck; a sideboard or a companion stays in the text), the total each
// market paid for it the day it was published. A user row holds plain product ids and no foreign key (contract 2.3).

export interface PreparedDeck {
  format: Format;
  lines: { cardId: number; qty: number; finish?: 0 | 1 }[];
  list: string;
  cardIds: number[];
  cardCount: number;
  commander: { cardId: number; name: string; slug: string } | null;
  /** The second commander: a partner, a Background, a Doctor's companion; for Oathbreaker the signature spell. */
  partner: { cardId: number; name: string } | null;
  /** The commanders' colour identity (a WUBRG mask) the deck is held to. */
  identity: number;
  report: DeckReport | null;
  unmatched: string[];
  totals: MarketTotals;
}

const inDeck = (r: DeckRow): boolean => r.line.zone === "main" || r.line.zone === "commander";

/** Resolves a pasted list the way /deck prices it, merging repeat lines, and judges it against the format. A format that leads with a commander and has none in the commander slot reads it from the sideboard. */
export async function prepareDeckWith(text: string, data: DeckData, opts: { format?: Format } = {}): Promise<PreparedDeck> {
  const format = opts.format ?? DEFAULT_PUBLISH_FORMAT;
  const resolved = await resolveDeckLines(parseDeckList(text), data, { options: false });
  const rows = withInferredCommanders(resolved.rows, format);
  const matched = rows.filter((r): r is DeckRow & { card: NonNullable<DeckRow["card"]> } => r.card != null);
  const unmatched = rows.filter((r) => !r.card).map((r) => r.line.raw);
  const report = await checkResolved(rows, format, data).catch(() => null);
  const deck = matched.filter(inDeck).sort((a, b) => Number(b.line.zone === "commander") - Number(a.line.zone === "commander"));
  const leaders = deck.filter((r) => r.line.zone === "commander");
  const lead = leaders[0], mate = leaders[1];
  const lines = deck.map((r) => ({ cardId: r.card.id, qty: r.line.qty, ...(r.finish === "F" ? { finish: 1 as const } : {}) }));
  return {
    format,
    lines,
    list: await canonicalText(rows, data),
    cardIds: [...new Set(lines.map((l) => l.cardId))],
    cardCount: lines.reduce((n, l) => n + l.qty, 0),
    commander: lead ? { cardId: lead.card.id, name: lead.card.name, slug: lead.oracle?.slug ?? "" } : null,
    partner: mate ? { cardId: mate.card.id, name: mate.card.name } : null,
    identity: report?.identity ?? 0,
    report,
    unmatched,
    totals: deckTotals(deck.map((r) => ({ qty: r.line.qty, card: pricedCard(r.card) }))),
  };
}

export const prepareDeck = (text: string, format?: Format): Promise<PreparedDeck> => prepareDeckWith(text, loaderData, { format });

export type PublishInput = {
  title: string;
  description: string | null;
  text: string;
  userId: string | null;
  authorName: string | null;
  source: "user" | "import";
  /** A commander-style format key; absent means Commander. */
  format?: string | null;
};

export type PublishResult = { ok: true; slug: string; commanderSlug: string } | { ok: false; error: string };

/** The checks a deck must pass to be published (pure, for tests and the route). */
export function publishError(deck: PreparedDeck): string | null {
  const shape = deckShapeError({ format: deck.format, report: deck.report, unmatched: deck.unmatched.length });
  if (shape) return shape;
  if (!deck.commander) return "A published deck needs its commander: add a Commander section to the list.";
  if (!deck.commander.slug) return "We couldn't read the commander's card data right now — please try again in a minute.";
  return null;
}

export async function publishDeck(input: PublishInput, db: Pick<typeof prisma, "publishedDeck"> = prisma, data: DeckData = loaderData): Promise<PublishResult> {
  const asked = input.format ?? DEFAULT_PUBLISH_FORMAT;
  if (!isPublishFormat(asked)) return { ok: false, error: deckShapeError({ format: null, report: null, unmatched: 0 })! };
  const deck = await prepareDeckWith(input.text, data, { format: asked });
  const err = publishError(deck);
  if (err) return { ok: false, error: err };
  const lead = deck.commander!;
  if (input.userId) {
    const dup = await db.publishedDeck.findFirst({ where: { userId: input.userId, list: deck.list }, select: { slug: true } });
    if (dup) return { ok: false, error: "You've already published this exact list." };
  }
  const slug = deckSlug(input.title, randomBytes(4).toString("hex"));
  await db.publishedDeck.create({
    data: {
      slug,
      userId: input.userId,
      authorName: input.authorName,
      title: input.title,
      description: input.description,
      format: deck.format,
      commanderCardId: lead.cardId,
      commanderName: lead.name,
      commanderSlug: lead.slug,
      partnerCardId: deck.partner?.cardId ?? null,
      partnerName: deck.partner?.name ?? null,
      identity: deck.identity,
      list: deck.list,
      lines: deck.lines as Prisma.InputJsonValue,
      cardIds: deck.cardIds,
      cardCount: deck.cardCount,
      publishedTotals: deck.totals as Prisma.InputJsonValue,
      source: input.source,
    },
  });
  return { ok: true, slug, commanderSlug: lead.slug };
}

/** Publishes in the last 24 hours by this account (the daily cap is counted in the database). */
export async function publishesToday(userId: string, db: Pick<typeof prisma, "publishedDeck"> = prisma): Promise<number> {
  return db.publishedDeck.count({ where: { userId, createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
}
