// The "Notify me at $X" input's number rules, shared by the field
// (components/TargetPriceField.tsx) and the PATCH that saves it
// (lib/target-alerts.ts, wave-2 member track), so what the field accepts is what the route accepts;
// and which of an account's targets are live (honouredTargetIds), shared by the
// cron and the watchlist. No imports: this ships in the client bundle.

// Whole cents in the watch's own market currency. At least 1 cent; at most
// 100,000.00 — far past any single card, and a guard against a stray zero.
export const MIN_TARGET_CENTS = 1;
export const MAX_TARGET_CENTS = 10_000_000;

// What the person typed → whole cents, or null for "no target". Accepts
// "12", "12.5", "12.50", "$12.50", "A$ 1,200.00", and a decimal comma with no
// point ("12,50" — the EU market); anything without a number in it (including
// an empty field) is null, which clears the target.
export function parseMoneyInput(text: string): number | null {
  let t = text.trim();
  if (!t.includes(".") && /,\d{1,2}$/.test(t)) t = t.replace(/,(\d{1,2})$/, ".$1");
  const cleaned = t.replace(/[^0-9.]/g, "");
  if (!cleaned || !/\d/.test(cleaned)) return null;
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

// Clamp to the accepted range (the field does this on blur, so a typo becomes
// a visible, valid number rather than a failed save).
export function clampTargetCents(cents: number): number {
  return Math.min(MAX_TARGET_CENTS, Math.max(MIN_TARGET_CENTS, Math.round(cents)));
}

// Cents → the plain number shown in the input ("12.50"), no currency symbol:
// the symbol sits beside the input.
export function centsToInput(cents: number | null | undefined): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

// WHICH TARGETS ARE LIVE when an account holds more than its tier allows (a
// Premium member who moved to Plus keeps every stored target, and PATCH lets
// them clear but not add). The OLDEST watches win: sorted by createdAt, then
// id (rows from one createMany share a timestamp), the first `limit` rows that
// carry a target are honoured and the rest are stored but inert until one is
// cleared. The alert run (scripts/alerts.ts) and the watchlist
// (components/Watchlist.tsx, "Not active: over your Plus limit") both call
// this, so what the page says is live is what the run alerts on. One
// account's rows in; `limit` from lib/alert-limits.ts targetAlertLimit — 0 for
// an account that isn't entitled, Infinity for Premium.
export function honouredTargetIds(
  rows: readonly { id: string; targetCents: number | null; createdAt: Date | string }[],
  limit: number,
): Set<string> {
  const out = new Set<string>();
  if (limit <= 0) return out;
  const withTarget = rows
    .filter((r) => r.targetCents != null)
    .map((r) => ({ id: r.id, t: new Date(r.createdAt).getTime() }))
    .sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const r of withTarget) {
    if (out.size >= limit) break;
    out.add(r.id);
  }
  return out;
}
