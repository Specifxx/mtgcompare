// Whole UTC days from `now` to a release date, never negative. A route file may export only route fields, so the widget route and its test share this.
export function daysUntil(date: string, now: Date = new Date()): number {
  const t = Date.parse(`${date}T00:00:00Z`), n = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.round((t - n) / 86400000));
}
