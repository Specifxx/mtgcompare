// The new-low materiality thresholds, in their own module so lib/email.ts
// (the confirmation's cadence copy) can quote them without importing
// lib/price-alerts.ts, which imports lib/email.ts. lib/price-alerts.ts
// re-exports both; DECISIONS.md quotes them from there.

/** A drop must be at least this % of the reference… */
export const DROP_MIN_PCT = 5;
/** …and at least this many minor units (cents, pence) of the market's currency. */
export const DROP_MIN_CENTS = 50;
