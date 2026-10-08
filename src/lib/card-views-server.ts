// The one counter WRITE a public request makes: POST /api/card/[slug]/view. A
// view or search pick is SAMPLED (1 in VIEW_BEACON_SAMPLE, default 10), buffered
// in the instance (ViewBatcher, data/plane/view-beacon.ts) and written to
// CardStat in ONE statement inside the first minute of each wall-clock half hour,
// so the scale-to-zero database wakes at most 48 times a day however many
// instances run (contract 12.12). The write is never awaited by a render and a
// failure is swallowed. Guarded in lib/card-views.ts (bots get a 204, a per-IP
// and a per-IP-per-card limit) and in the browser (once per card per kind per day).
import { getCardLookup } from "./data";
import { BEACON_DEFAULTS, ViewBatcher } from "./data/plane/view-beacon";
import { prisma } from "./db";

const SLUG = /^[a-z0-9-]{1,160}$/;

function config() {
  const raw = process.env.VIEW_BEACON_SAMPLE;
  const n = raw == null || raw === "" ? NaN : Number(raw);
  const minutes = Number(process.env.VIEW_FLUSH_MINUTES);
  return {
    ...BEACON_DEFAULTS,
    sampleOneIn: Number.isFinite(n) && n >= 0 ? Math.floor(n) : BEACON_DEFAULTS.sampleOneIn,
    flushMinutes: Number.isFinite(minutes) && minutes >= 1 ? Math.floor(minutes) : BEACON_DEFAULTS.flushMinutes,
  };
}

const g = globalThis as unknown as { __mcViewBatcher?: ViewBatcher };
function batcher(): ViewBatcher {
  return (g.__mcViewBatcher ??= new ViewBatcher(Date.now, Math.random, config()));
}

/** One INSERT ... ON CONFLICT for the drained rows (counts are already scaled by the sampling rate). */
export async function flushCardViews(rows: { cardId: number; views: number; searches: number }[], db: Pick<typeof prisma, "$executeRaw"> = prisma): Promise<void> {
  if (!rows.length) return;
  const ids = rows.map((r) => r.cardId);
  const views = rows.map((r) => r.views);
  const searches = rows.map((r) => r.searches);
  await db.$executeRaw`
    INSERT INTO "CardStat" ("cardId", "viewCount", "searchCount", "lastViewedAt")
    SELECT u.id, u.v, u.s, now() FROM unnest(${ids}::int[], ${views}::int[], ${searches}::int[]) AS u(id, v, s)
    ON CONFLICT ("cardId") DO UPDATE SET
      "viewCount" = "CardStat"."viewCount" + EXCLUDED."viewCount",
      "searchCount" = "CardStat"."searchCount" + EXCLUDED."searchCount",
      "lastViewedAt" = now()`;
}

/** `ref` is a product id or a slug (the browser sends whichever it has). Best effort: never throws. */
export async function countCardView(ref: string, kind: "view" | "search", b: ViewBatcher = batcher()): Promise<void> {
  try {
    let id = /^\d{1,9}$/.test(ref) ? Number(ref) : 0;
    if (!id) {
      if (!SLUG.test(ref)) return;
      // Sampling first: a view that will not be counted costs no lookup.
      if (b.cfg.sampleOneIn <= 0) return;
      const found = await getCardLookup({ slugs: [ref] });
      id = found.bySlug.get(ref)?.id ?? 0;
    }
    if (!id) return;
    b.record(id, kind, false);
    if (b.due()) void flushCardViews(b.drain()).catch(() => {});
  } catch {
    /* best-effort */
  }
}
