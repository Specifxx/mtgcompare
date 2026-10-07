// BEST BASKET'S UPGRADE LINE, IN MONEY (owner, 2026-09-28: "Show savings in
// dollars … 'Store-by-store saves you $14.20 on this deck. Unlock for $4.99.'
// If it pays for itself on the first order, it sells itself.")
//
// The figure is THIS list's own computed saving (lib/basket.ts savedCents:
// the naive "each card's cheapest copy" total minus the delivered plan's), in
// the list's own currency — never an average, an example or a guess
// (CURRENT-STATE: no invented numbers or savings totals). Below
// BASKET_SAVING_MIN_CENTS (one whole dollar / pound / euro) there is no money
// line at all: a 40-cent "saving" sells nothing and reads like a trick, so the
// preview keeps its plain, honest wording instead.
//
// Pure and client-safe, so tests/free-limits.test.ts pins both sides of the
// threshold.

export const BASKET_SAVING_MIN_CENTS = 100;

export function basketSavingPitch(
  savedCents: number,
  fmt: (cents: number) => string,
  opts: { plusMember: boolean; priceLabel: string },
): string | null {
  if (!Number.isFinite(savedCents) || savedCents < BASKET_SAVING_MIN_CENTS) return null;
  const lead = `The store-by-store plan saves you ${fmt(savedCents)} on this list compared with buying each card's cheapest copy separately.`;
  // A Plus member already pays: this is an upgrade, and PremiumButton quotes
  // the switch price on their own billing interval.
  return opts.plusMember ? `${lead} Upgrade to Premium to unlock it.` : `${lead} Unlock it for ${opts.priceLabel}.`;
}
