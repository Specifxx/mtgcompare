// eBay's published selling fees for trading card games (the category Magic: The Gathering sells in), for the selling-fee calculator (/<region>/tools/selling-fee-calculator)
// and the guides that talk about fees. Pure: no database, safe in the browser.
//
// THE ONLY FEE FACTS THE SITE PRINTS. Each schedule names the eBay page it was read from and the day it was read (FEES_CHECKED). eBay
// changes its fees and runs promotions, and a seller's own rate depends on their plan and store subscription, so every place that shows
// one says when it was checked and tells the reader to confirm their rate in Seller Hub; the calculator lets them type their own.
//
// Read 2026-10-21:
//   • eBay Australia, help page "Selling fees" (id=4822): "It's free for Australia-based sellers with up to $25,000 in sales over the
//     past 12 months to sell on eBay.com.au"; sellers without a Pro plan registered outside Australia pay 13.4% of the sale amount up to
//     $4,000 plus 2.5% of the amount over $4,000, and a $0.30 fixed fee per order. Pro plans (store page, id=5304) vary by tier and plan.
//   • eBay US, seller update "Final value fee changes" (January 2025, in force from 14 February 2025): Collectible Card Games and
//     Non-Sport Trading Cards, 13.25% on the sale up to $7,500 and 2.35% above it without a Store or with a Starter Store; 12.35% up to
//     $2,500 and 2.35% above it with a Basic Store or higher. The per-order fee is eBay US's standard $0.30 (sale of $10 or less) or $0.40.
// eBay charges the final value fee on the total the buyer pays: the item price plus the postage charged (and sales tax in the US).

export const FEES_CHECKED = "2026-10-21";

export interface FeeSchedule {
  key: string;
  /** What the preset is called in the calculator. */
  label: string;
  /** Which seller it applies to, in a sentence. */
  who: string;
  /** The market's currency code (the region's), for the display. */
  currency: string;
  /** Percent on the part of the sale up to `tierCapCents` (whole schedule when null). */
  ratePct: number;
  tierCapCents: number | null;
  /** Percent on the part above the cap. */
  aboveRatePct: number;
  /** The fixed fee per order, in cents: one value, or [up to `smallOrderCents`, above it]. */
  orderFeeCents: number | readonly [number, number];
  smallOrderCents?: number;
  /** eBay's page the figures were read from. */
  source: string;
}

const AU_SOURCE = "https://www.ebay.com.au/help/selling/fees-credits-invoices/selling-fees?id=4822";
const US_SOURCE = "https://www.ebay.com/sellercenter/resources/seller-updates/2025-january/final-value-fee";

export const FEE_SCHEDULES: readonly FeeSchedule[] = [
  {
    key: "ebay-au-free",
    label: "eBay Australia — free selling (up to A$25,000 a year)",
    who: "Australia-based sellers with up to A$25,000 in sales over the past 12 months and no Pro plan.",
    currency: "AUD",
    ratePct: 0,
    tierCapCents: null,
    aboveRatePct: 0,
    orderFeeCents: 0,
    source: AU_SOURCE,
  },
  {
    key: "ebay-au-standard",
    label: "eBay Australia — no Pro plan, registered outside Australia",
    who: "Sellers registered outside Australia without a Pro plan. Pro plan rates vary by plan and category: use Custom with your Seller Hub rate.",
    currency: "AUD",
    ratePct: 13.4,
    tierCapCents: 400_000,
    aboveRatePct: 2.5,
    orderFeeCents: 30,
    source: AU_SOURCE,
  },
  {
    key: "ebay-us-ccg",
    label: "eBay US — card games, no Store or Starter Store",
    who: "Collectible Card Games and Non-Sport Trading Cards, sellers without a Store or with a Starter Store.",
    currency: "USD",
    ratePct: 13.25,
    tierCapCents: 750_000,
    aboveRatePct: 2.35,
    orderFeeCents: [30, 40],
    smallOrderCents: 1_000,
    source: US_SOURCE,
  },
  {
    key: "ebay-us-ccg-store",
    label: "eBay US — card games, Basic Store or higher",
    who: "Collectible Card Games and Non-Sport Trading Cards, sellers with a Basic Store subscription or higher.",
    currency: "USD",
    ratePct: 12.35,
    tierCapCents: 250_000,
    aboveRatePct: 2.35,
    orderFeeCents: [30, 40],
    smallOrderCents: 1_000,
    source: US_SOURCE,
  },
];

export const FEE_BY_KEY: ReadonlyMap<string, FeeSchedule> = new Map(FEE_SCHEDULES.map((s) => [s.key, s]));

/** The schedules a region's calculator offers first: its own eBay site's. Other regions start on Custom. */
export function schedulesFor(market: string): FeeSchedule[] {
  const currency = market === "AU" ? "AUD" : market === "US" ? "USD" : null;
  return currency ? FEE_SCHEDULES.filter((s) => s.currency === currency) : [];
}

/** A custom rate: what the reader's Seller Hub (or another marketplace) says. */
export interface CustomFee {
  ratePct: number;
  orderFeeCents: number;
}

export interface FeeBreakdown {
  /** What the buyer pays: the item price plus postage charged. */
  totalCents: number;
  /** The percentage fee. */
  variableCents: number;
  /** The per-order fee. */
  orderCents: number;
  feesCents: number;
  /** What the sale leaves after eBay's fees, before the seller's own postage cost. */
  afterFeesCents: number;
  /** The fees as a percent of the total the buyer pays. */
  effectivePct: number;
}

/** eBay's fees on one order: the percentage on the total (tiered at the schedule's cap), plus the order fee. Rounded to the cent. */
export function sellingFees(itemCents: number, postageCents: number, fee: FeeSchedule | CustomFee): FeeBreakdown {
  const total = Math.max(0, Math.round(itemCents)) + Math.max(0, Math.round(postageCents));
  let variable: number;
  let order: number;
  if ("key" in fee) {
    const cap = fee.tierCapCents;
    const low = cap == null ? total : Math.min(total, cap);
    const high = cap == null ? 0 : Math.max(0, total - cap);
    variable = Math.round((low * fee.ratePct) / 100 + (high * fee.aboveRatePct) / 100);
    order = Array.isArray(fee.orderFeeCents) ? (total <= (fee.smallOrderCents ?? 0) ? fee.orderFeeCents[0] : fee.orderFeeCents[1]) : (fee.orderFeeCents as number);
  } else {
    variable = Math.round((total * Math.max(0, fee.ratePct)) / 100);
    order = Math.max(0, Math.round(fee.orderFeeCents));
  }
  if (total === 0) order = 0;
  const fees = variable + order;
  return { totalCents: total, variableCents: variable, orderCents: order, feesCents: fees, afterFeesCents: total - fees, effectivePct: total ? (fees / total) * 100 : 0 };
}

/** "13.4% up to A$4,000, then 2.5%, plus A$0.30 an order": a schedule in words, for a guide or the calculator's note. */
export function scheduleText(s: FeeSchedule, money: (cents: number) => string): string {
  if (s.ratePct === 0 && s.aboveRatePct === 0 && s.orderFeeCents === 0) return "no final value fee and no per-order fee";
  const rate = s.tierCapCents == null ? `${s.ratePct}% of the total` : `${s.ratePct}% of the total up to ${money(s.tierCapCents)}, then ${s.aboveRatePct}% above it`;
  const order = Array.isArray(s.orderFeeCents)
    ? `${money(s.orderFeeCents[0])} an order of ${money(s.smallOrderCents ?? 0)} or less (${money(s.orderFeeCents[1])} above)`
    : `${money(s.orderFeeCents as number)} an order`;
  return `${rate}, plus ${order}`;
}
