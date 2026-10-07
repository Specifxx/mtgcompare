// The selling-fee calculator's maths (components/FeeCalculator.tsx), pure so
// tests/selling-fees.test.ts can pin it without a browser.
//
// WHAT EACH MARKETPLACE CHARGES ITS COMMISSION ON (2026-09-25). The calculator
// used to charge every marketplace's commission on the item price only. eBay's
// final value fee is charged on the total the buyer pays, shipping included —
// the page's own FAQ said so — and the eBay preset sets processing to 0, so
// shipping charged on eBay was never fee'd at all and the net payout was
// overstated. TCGplayer's marketplace commission is on the item price, which is
// what TCGplayer's fee page and /tools/selling-fees' "How the math works" describe.

export type CommissionBase = "item" | "itemPlusShipping";

export interface FeeInputs {
  /** All money in major units (dollars), as typed. */
  price: number;
  shipCharged: number;
  shipCost: number;
  /** null = the seller hasn't entered one yet. */
  commissionPct: number | null;
  processingPct: number;
  fixedFee: number;
  commissionBase: CommissionBase;
}

export interface FeeResult {
  totalCollected: number;
  /** Your own shipping cost, as entered (it comes off the payout, not a fee). */
  shipCost: number;
  /** What the commission is charged on. */
  commissionBaseAmount: number;
  commission: number;
  processing: number;
  totalFees: number;
  net: number;
  /** Fees plus your own shipping, as a share of the sale price. */
  effectiveFeePct: number;
  /**
   * False until a commission is entered. Every net figure is then missing the
   * marketplace's largest fee, so the headline must not print it as "your net
   * payout" (it used to: US$38.71 on a $40 TCGplayer sale, ~$4-5 too high).
   */
  complete: boolean;
}

export function computeFees(i: FeeInputs): FeeResult {
  const totalCollected = i.price + i.shipCharged;
  const commissionBaseAmount = i.commissionBase === "itemPlusShipping" ? totalCollected : i.price;
  const commission = ((i.commissionPct ?? 0) / 100) * commissionBaseAmount;
  const processing = (i.processingPct / 100) * totalCollected + i.fixedFee;
  const totalFees = commission + processing;
  const net = totalCollected - totalFees - i.shipCost;
  const effectiveFeePct = i.price > 0 ? ((totalFees + i.shipCost) / i.price) * 100 : 0;
  return {
    totalCollected,
    shipCost: i.shipCost,
    commissionBaseAmount,
    commission,
    processing,
    totalFees,
    net,
    effectiveFeePct,
    complete: i.commissionPct != null,
  };
}

/** A typed field as a number; blank or junk is null, never a silent 0. */
export function parseRate(v: string): number | null {
  if (v.trim() === "") return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
