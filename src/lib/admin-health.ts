// Store-health inputs for /admin/store-health and scripts/store-health.ts.
// Uncached (admin-only traffic). The history of each store's reads comes from Neon: the SQL pulls only
// each store's scalars out of ImportRun.summary, never the ~50 KB summaries themselves. The OFFER side
// (how many rows a store holds, how old its newest read is) comes from the published ss/runs.json, not a
// table: public data is files, and the page keeps its offer columns when Neon is down. No Next-only
// imports, so a script may use it.
import { prisma } from "./db";
import { MARKETS } from "./country";
import type { StoreRunsFile } from "./data/plane/formats";
import { planeJson } from "./data/plane/runtime";
import { groupAppearances, type OfferStat, type StoreAppearance } from "./store-health";
import { storeById } from "./stores";

export interface RunRow {
  id: number;
  kind: string;
  startedAt: Date;
  finishedAt: Date | null;
  ok: boolean;
  catalog: { sets?: number; cards?: number; sealed?: number; tcgplayerOffers?: number } | null;
  history: unknown;
  error: string | null;
  storeCount: number | null;
}

type AppearanceRow = {
  runId: number;
  at: Date;
  key: string;
  products: number | null;
  cards: number | null;
  sealed: number | null;
  inStock: number | null;
  failed: boolean | null;
  skipped: string | null;
  note: string | null;
  misses: Record<string, number> | null;
};

/**
 * Every store's appearances in the last 8 days of successful runs, newest
 * first. `misses` (the bulky part) comes only with EACH STORE'S OWN newest
 * appearance — not "the newest run", which may be a partial one-store run
 * (IMPORT_ONLY_STORES / IMPORT_ONLY_COUNTRY) that would blank every other
 * store's misses and implausible-prices alert.
 */
export async function loadAppearances(): Promise<Map<string, StoreAppearance[]>> {
  const rows = await prisma.$queryRaw<AppearanceRow[]>`
    SELECT "runId", at, key, products, cards, sealed, "inStock", failed, skipped, note,
           CASE WHEN rn = 1 THEN misses END AS misses
    FROM (
      SELECT r.id AS "runId", r."finishedAt" AS at, s->>'key' AS key,
             (s->>'products')::int AS products, (s->>'cards')::int AS cards, (s->>'sealed')::int AS sealed,
             (s->>'inStock')::int AS "inStock", (s->>'failed')::boolean AS failed, s->>'skipped' AS skipped,
             s->>'note' AS note,
             s->'misses' AS misses,
             row_number() OVER (PARTITION BY s->>'key' ORDER BY r.id DESC) AS rn
      FROM "ImportRun" r CROSS JOIN LATERAL jsonb_array_elements(r.summary->'stores') s
      WHERE r.ok AND r.summary ? 'stores' AND r."finishedAt" > now() - interval '8 days'
    ) a
    ORDER BY "runId" DESC`;
  return groupAppearances(
    rows
      .filter((r) => r.key)
      .map((r) => ({
        key: r.key,
        runId: r.runId,
        at: r.at,
        products: r.products ?? 0,
        cards: r.cards ?? 0,
        sealed: r.sealed ?? 0,
        inStock: r.inStock ?? 0,
        failed: r.failed === true,
        ...(r.skipped ? { skipped: r.skipped } : {}),
        ...(r.note ? { note: r.note } : {}),
        ...(r.misses ? { misses: r.misses } : {}),
      })),
  );
}

/**
 * Offer rows per store from ss/runs.json (one row per (store, market) pair the importer ever read): `offers` rows held, `inStock` of them fresh, and the time of the pair's last COMPLETED read
 * (a failed read keeps its old time, so `newest` is what makes `stale` fire). Empty when the data host cannot be reached: the page then shows no offer columns, not an error.
 */
export function offerStatsOf(runs: StoreRunsFile | null): Map<string, OfferStat> {
  const out = new Map<string, OfferStat>();
  for (const [id, market, at, , offers, inStock] of runs?.r ?? []) {
    const s = storeById(id);
    if (!s || MARKETS[market] !== s.country) continue;
    const t = new Date(at);
    const cur = out.get(s.key);
    out.set(s.key, { listings: (cur?.listings ?? 0) + offers, inStock: (cur?.inStock ?? 0) + inStock, newest: !cur?.newest || t > cur.newest ? t : cur.newest });
  }
  return out;
}
export async function loadOfferStats(): Promise<Map<string, OfferStat>> {
  try {
    return offerStatsOf(await planeJson<StoreRunsFile>("ss/runs.json", { optional: true }));
  } catch {
    return new Map();
  }
}

/** The last 10 runs, with the summary reduced to a few fields in SQL. */
export async function loadRecentRuns(): Promise<RunRow[]> {
  return prisma.$queryRaw<RunRow[]>`
    SELECT id, kind, "startedAt", "finishedAt", ok,
           summary->'catalog' AS catalog, summary->'history' AS history,
           left(summary->>'error', 300) AS error,
           CASE WHEN jsonb_typeof(summary->'stores') = 'array' THEN jsonb_array_length(summary->'stores') END AS "storeCount"
    FROM "ImportRun" ORDER BY id DESC LIMIT 10`;
}

export async function loadStoreHealthInputs(): Promise<{ history: Map<string, StoreAppearance[]>; offers: Map<string, OfferStat>; runs: RunRow[] }> {
  const [history, offers, runs] = await Promise.all([loadAppearances(), loadOfferStats(), loadRecentRuns()]);
  return { history, offers, runs };
}

/** Failed runs in the last 7 days (for the page's tile). */
export async function failedRunsSince(days = 7): Promise<number> {
  return prisma.importRun.count({ where: { ok: false, startedAt: { gt: new Date(Date.now() - days * 86_400_000) } } });
}
