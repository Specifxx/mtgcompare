// The admin side of the deck library (/admin/decks, /api/admin/decks): the
// uncached reads and writes behind moderation. Admin pages read through
// src/lib/admin*.ts (CLAUDE.md), never through the public loaders.
import { prisma } from "./db";

export interface AdminDeckRow {
  id: string;
  slug: string;
  title: string;
  leaderName: string;
  authorName: string | null;
  source: string;
  status: string;
  createdAt: Date;
}

/** The newest 200 published decks, any status. */
export async function adminDecks(): Promise<AdminDeckRow[]> {
  return prisma.publishedDeck.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, slug: true, title: true, leaderName: true, authorName: true, source: true, status: true, createdAt: true },
  });
}

/** Hide or restore one deck; null when there is no such deck. */
export async function setDeckStatus(id: string, status: "live" | "hidden"): Promise<{ slug: string; leaderSlug: string } | null> {
  return prisma.publishedDeck.update({ where: { id }, data: { status }, select: { slug: true, leaderSlug: true } }).catch(() => null);
}
