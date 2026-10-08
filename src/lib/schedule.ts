// src/lib/schedule.ts (owner WP01b, FROZEN). THE DAILY CLOCK of the data plane, in one place; tests/schedule.test.ts pins every workflow cron to these constants. All times UTC.
// TCGCSV rebuilds once a day at about 20:06 (last-updated.txt 2026-10-07T20:06:09Z) and asks for at most one pull per 24 h; Scryfall builds twice a day (about 09:05 and 21:05). `priceDay` is the UTC date of last-updated.txt, never of the cron.
// The weekly production RELEASE (Tuesday 08:00) is release-schedule.ts and shares nothing with this clock: data never waits for a deploy.
export const IMPORT_CRONS = ["25 21 * * *", "55 21 * * *", "25 22 * * *"] as const;     // the import and its two retries (a retry exits in under 10 s when latest.json already carries the source stamps)
export const DEMAND_SNAPSHOT_CRON = "40 22 * * *";                                         // the overlay that writes the free preview slices (pv/); it queues behind a running import in the same concurrency group
export const SQUASH_CRON = "50 23 * * 0";                                                  // Sunday 23:50
export const WATCHDOG_CRON = "17 * * * *";                                                 // hourly, never at minute 0 (GitHub delays scheduled runs under load, and minute 0 is the busiest)
export const KEEPALIVE_AFTER_DAYS = 30;                                                    // the watchdog lands an empty commit on main when main is older than this (GitHub disables scheduled workflows of a public repository after 60 days without activity)
/** The window in which the import normally runs (phase 1 about 10 minutes after the start, phase 2 up to about 75). The eBay admin button warns inside it; no workflow DEPENDS on it any more (eBay never writes the data repository). */
export const IMPORT_WINDOW_UTC = { start: "21:05", end: "23:30" } as const;
/** Every workflow that writes the data repository declares THIS group with `queue: max` (up to 100 pending, FIFO): with the default single-slot queue a newer pending run silently cancels the older one, so the hourly watchdog
 *  could cancel the Sunday squash or an operator's rollback (critique DP-10, confirmed in the GitHub documentation). `queue: max` cannot be combined with `cancel-in-progress: true`. */
export const DATA_GROUP = "data-publish";
export const DATA_WRITER_WORKFLOWS = ["import-prices.yml", "demand-snapshot.yml", "data-squash.yml", "data-watchdog.yml", "data-rollback.yml"] as const;
export const HOURS_BETWEEN_SOURCES_AND_IMPORT = { tcgcsv: 20.1, scryfall: 21.1 } as const;
export function parseDailyCron(cron: string): { minute: number; hour: number; weekday: number | null } | null {
  const m = /^(\d{1,2}) (\d{1,2}|\*) \* \* (\*|[0-6])$/.exec(cron.trim()); if (!m) return null;
  return { minute: Number(m[1]), hour: m[2] === "*" ? -1 : Number(m[2]), weekday: m[3] === "*" ? null : Number(m[3]) };
}
