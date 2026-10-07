/**
 * ONE place that knows how a collection row's recorded cost becomes money.
 *
 * A CollectionCard is unique per (user, card, condition, foil), so every copy of
 * one card in one condition shares a SINGLE cost figure — and copies are rarely
 * bought at one price. Reported 2026-09-10 through the feedback form:
 *
 *   "Added $770 paid to Akali ON - pulled one, paid for the other… Same issue
 *    with Arise where I paid 20 each for two and 25 for the third"
 *
 * With a per-unit-only field neither is recordable. $770 against a quantity of 2
 * is read as $770 EACH and the portfolio says $1,540 invested; three Arise at
 * 20/20/25 have no single per-unit price to type at all. Both come back as a
 * profit-and-loss figure the owner knows is wrong, which is worse than none.
 *
 * So a row can now say what its number MEANS: per copy (the default, and what
 * every pre-existing row keeps) or the whole row's outlay. A total is the
 * average cost basis, which is exactly what an unrealised P&L is computed from —
 * $770 across two copies and 65 across three are both expressible and both
 * right. It is not tax-lot accounting and does not pretend to be; per-lot
 * acquisition dates would be a different model, and nothing on this site needs
 * one.
 *
 * The arithmetic lives here rather than at each call site because it is the
 * quantity multiply that goes wrong, and it was previously written out by hand
 * in three places. Two copies of one rule is how the promo-set regex drifted
 * (see lib/tcgplayer.ts); this file exists so this rule cannot.
 */

/** Copies one collection row can hold — the write routes' zod `max` and the UI's + button. */
export const QUANTITY_CAP = 999;

/** The shape any caller needs — a Prisma row satisfies it structurally. */
export interface CostBasisRow {
  quantity: number;
  costBasisCents: number | null;
  costBasisIsTotal?: boolean | null;
}

/**
 * What the owner actually paid for this row, in cents, or null when no cost is
 * recorded (which must stay null — a missing cost is not a cost of zero, and
 * treating it as one would report a 100% profit on every unpriced holding).
 */
export function investedCents(row: CostBasisRow): number | null {
  if (row.costBasisCents == null) return null;
  return row.costBasisIsTotal ? row.costBasisCents : row.costBasisCents * row.quantity;
}

/**
 * The per-copy average, for display next to a card. Rounded to whole cents —
 * $65 across three copies is $21.67, and the third cent belongs to no copy.
 * Returns null on a zero/negative quantity rather than dividing by it.
 */
export function unitCostCents(row: CostBasisRow): number | null {
  const total = investedCents(row);
  if (total == null) return null;
  if (!row.costBasisIsTotal) return row.costBasisCents;
  return row.quantity > 0 ? Math.round(total / row.quantity) : null;
}

/**
 * What a row's stored number becomes when its quantity changes by `delta`.
 *
 * A PER-UNIT figure is unaffected: one copy still cost what it cost. A TOTAL is
 * an outlay for a specific number of copies, so adding copies without saying
 * what they cost would silently understate the basis (buy two more and the
 * portfolio reports the same money spent on twice the cards). Scale it by the
 * average instead — the honest reading of "I paid this for these" when the only
 * new information is the count.
 */
export function costAfterQuantityChange(row: CostBasisRow, newQuantity: number): number | null {
  if (row.costBasisCents == null) return null;
  if (!row.costBasisIsTotal) return row.costBasisCents;
  if (row.quantity <= 0 || newQuantity <= 0) return row.costBasisCents;
  return Math.round((row.costBasisCents / row.quantity) * newQuantity);
}

/** What an add says about the copies it adds. Nothing at all is the common case. */
export interface CostAdd {
  /** Copies being added (≥ 1). */
  quantity: number;
  /** What the owner says the added copies cost: per copy, or in total with the flag. */
  costBasisCents?: number | null;
  costBasisIsTotal?: boolean;
}

/**
 * The cost fields a row should carry after `add` lands on it — or on nothing,
 * when `existing` is null and the add creates the row.
 *
 * Every "add to my cards" path (QuickView, My Collection's search, the welcome
 * checklist, the paste import) increments a row's quantity. They used to leave
 * the cost untouched, which is right for a per-copy figure and wrong for a total:
 * the new copies were treated as FREE, and the P&L reported a gain on money never
 * made. PATCH already rescaled through costAfterQuantityChange; this makes the
 * add paths agree with it. Reported by the 2026-09-25 audit.
 *
 * The rule is "an add never invents or erases money":
 *   • no cost given → per-copy stays as it is; a total scales with the count
 *     (costAfterQuantityChange); nothing recorded stays nothing recorded;
 *   • a cost given, but the copies already there have none → the row's total is
 *     unknown, so it stays null rather than becoming "the new copies' cost";
 *   • a cost given on top of a known outlay → the two outlays are summed, and
 *     the row records a total — unless both sides are the same per-copy price,
 *     which is left per-copy.
 */
export function costAfterAdd(
  existing: CostBasisRow | null,
  add: CostAdd,
): { costBasisCents: number | null; costBasisIsTotal: boolean } {
  const given = add.costBasisCents ?? null;
  if (!existing) {
    return { costBasisCents: given, costBasisIsTotal: given != null && add.costBasisIsTotal === true };
  }
  const newQuantity = existing.quantity + add.quantity;
  const isTotal = existing.costBasisIsTotal === true;
  if (given == null) {
    return { costBasisCents: costAfterQuantityChange(existing, newQuantity), costBasisIsTotal: isTotal };
  }
  const prior = investedCents(existing);
  if (prior == null) return { costBasisCents: null, costBasisIsTotal: isTotal };
  if (add.costBasisIsTotal !== true && !isTotal && existing.costBasisCents === given) {
    return { costBasisCents: given, costBasisIsTotal: false };
  }
  const addedOutlay = add.costBasisIsTotal === true ? given : investedCents({ quantity: add.quantity, costBasisCents: given });
  return { costBasisCents: prior + (addedOutlay ?? 0), costBasisIsTotal: true };
}
