// The import's tools step (wave 2): today's demand snapshot and the Rising
// Cards feed, written beside the price history on the `data` branch — never a
// Prisma table (CLAUDE.md, "Price history lives in GitHub"). Called by
// scripts/import.ts right after recordHistory, so the bucket files it reads
// already hold today's prices. Server-only (Prisma and the local history
// checkout). Best-effort: the caller never fails the import over it.
import { prisma } from "./db";
import { bucketOf } from "./history";
import { readBucket, readDemandDay, readDemandDays, writeDemandDay, writeDemandDays, writeRiseFile } from "./history-store";
import { buildDemandDay, dayMinus, utcDayKey, withDemandDay, type DemandDayFile } from "./demand-snapshot";
import { buildRiseFile, HISTORY_DAYS, RISE_FEED_CARDS, VELOCITY_DAYS, WEEK_AGO_DAYS } from "./rise-predictor";
import type { Point } from "./history";

type Log = (...a: unknown[]) => void;

export interface ToolsHistoryResult {
  day: string;
  demandCards: number;
  snapshotDays: number;
  risingSeries: number;
}

export async function recordToolsHistory(log: Log, today: string = utcDayKey()): Promise<ToolsHistoryResult> {
  // 1. Today's demand snapshot: the running totals of every card with any
  //    activity (id + two integers each), replacing a same-day run's file.
  const counted = await prisma.card.findMany({
    where: { OR: [{ searchCount: { gt: 0 } }, { viewCount: { gt: 0 } }] },
    select: { id: true, searchCount: true, viewCount: true },
  });
  const dayFile = buildDemandDay(today, counted);
  writeDemandDay(dayFile);
  const index = withDemandDay(readDemandDays(), today);
  writeDemandDays(index);

  // 2. history/rising.json: the weekly series over HISTORY_DAYS (from the
  //    bucket files recordHistory just wrote) of the RISE_FEED_CARDS most
  //    searched cards — Rising Cards ranks only searched cards, and the cap
  //    keeps the file (and its cache entry) to a few hundred KB — plus demand
  //    velocity now and demand as it stood a week ago (the local day files).
  const searched = counted
    .filter((c) => c.searchCount > 0)
    .sort((a, b) => b.searchCount - a.searchCount || b.viewCount - a.viewCount || a.id - b.id)
    .slice(0, RISE_FEED_CARDS);
  const byBucket = new Map<string, number[]>();
  for (const c of searched) (byBucket.get(bucketOf(c.id)) ?? byBucket.set(bucketOf(c.id), []).get(bucketOf(c.id))!).push(c.id);
  const series = new Map<string, Point[]>();
  for (const [b, ids] of byBucket) {
    const file = readBucket(b);
    for (const id of ids) {
      const s = file.p[String(id)];
      if (s?.length) series.set(String(id), s);
    }
  }
  const from = dayMinus(today, VELOCITY_DAYS + WEEK_AGO_DAYS + 1);
  const files: DemandDayFile[] = index.days
    .filter((d) => d >= from && d <= today)
    .map((d) => (d === today ? dayFile : readDemandDay(d)))
    .filter((f): f is DemandDayFile => !!f);
  const rise = buildRiseFile(today, series, files, index.days.length, new Set(searched.map((c) => String(c.id))));
  writeRiseFile(rise);
  log(
    `Tools history: demand snapshot of ${Object.keys(dayFile.p).length} cards for ${today} (${index.days.length} days on record); ` +
      `rising feed with ${Object.keys(rise.series).length} weekly series over ${HISTORY_DAYS} days`,
  );
  return { day: today, demandCards: Object.keys(dayFile.p).length, snapshotDays: index.days.length, risingSeries: Object.keys(rise.series).length };
}
