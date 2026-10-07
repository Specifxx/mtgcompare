// The one counter WRITE a public request makes (DECISIONS, "Card view and
// search counters"): POST /api/card/[slug]/view bumps Card.viewCount or
// Card.searchCount and lastViewedAt for one card — a single-row UPDATE of a
// few bytes, no read, no response body. Guarded in lib/card-views.ts (bots get
// a 204, a per-IP and a per-IP-per-card limit) and in the browser (once per
// card per kind per day). Best effort: a failure is swallowed, never a 500.
import { prisma } from "./db";

const SLUG = /^[a-z0-9-]{1,160}$/;

export async function countCardView(slug: string, kind: "view" | "search", db: Pick<typeof prisma, "card"> = prisma): Promise<void> {
  if (!SLUG.test(slug)) return;
  try {
    await db.card.updateMany({
      where: { slug },
      data: kind === "search" ? { searchCount: { increment: 1 }, lastViewedAt: new Date() } : { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    });
  } catch {
    /* best-effort */
  }
}
