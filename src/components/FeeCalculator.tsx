"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useCountry } from "@/components/CountryProvider";
import { formatMoney } from "@/lib/format-currency";
import { currencyOf } from "@/lib/country";
import { computeFees, parseRate, type CommissionBase } from "@/lib/selling-fees";

// A net-proceeds calculator for selling One Piece Card Game singles on a marketplace like
// TCGplayer or eBay. DELIBERATELY has no baked-in "current" commission or
// processing rate: both marketplaces run tiered, frequently-changing fee
// schedules (see TCGplayer's own fee page), and printing a specific percentage here
// that later goes stale would be worse than not printing one at all. Instead —
// same move as the Box EV calculator's "Bandai publishes no pull rates, so
// you tune the rates" — this asks the seller to type in their own
// current rate from their seller dashboard, and does the stacked-fee math for
// them from there. eBay's ~13.25% figure is offered as a starting point only
// because it's the same hedged ("commonly around") figure RiftCompare's fee
// guide publishes, not a new claim.

type Marketplace = "tcgplayer" | "ebay" | "custom";

// `commissionBase`: what the marketplace charges its commission ON (see
// lib/selling-fees.ts). eBay's final value fee is on the total the buyer pays,
// shipping included; TCGplayer's commission is on the item price.
const PRESETS: Record<
  Marketplace,
  { label: string; commissionHint: string; processingPct: string; fixedFee: string; commissionBase: CommissionBase }
> = {
  tcgplayer: {
    label: "TCGplayer",
    commissionHint: "Tiered by seller plan — check your Seller Portal for your exact rate. Charged on the item price.",
    processingPct: "2.9",
    fixedFee: "0.30",
    commissionBase: "item",
  },
  ebay: {
    label: "eBay",
    commissionHint:
      "Commonly around 13.25% for trading cards — confirm your current rate. Charged on the item price plus the shipping you charge.",
    processingPct: "0",
    fixedFee: "0.30",
    commissionBase: "itemPlusShipping",
  },
  custom: {
    label: "Another marketplace",
    commissionHint: "Enter the marketplace's commission percentage. Applied to the item price.",
    processingPct: "0",
    fixedFee: "0",
    commissionBase: "item",
  },
};

// Blank or junk counts as 0 for the amounts; the commission alone stays null
// when blank, because "not entered yet" and "0%" must read differently.
const amount = (v: string) => parseRate(v) ?? 0;

export function FeeCalculator() {
  const { country } = useCountry();
  const currency = currencyOf(country);
  const [marketplace, setMarketplace] = useState<Marketplace>("tcgplayer");
  const [itemPrice, setItemPrice] = useState("40.00");
  const [shippingCharged, setShippingCharged] = useState("1.00");
  const [shippingCost, setShippingCost] = useState("0.80");
  const [commissionPct, setCommissionPct] = useState("");
  const [processingPct, setProcessingPct] = useState(PRESETS.tcgplayer.processingPct);
  const [fixedFee, setFixedFee] = useState(PRESETS.tcgplayer.fixedFee);

  const preset = PRESETS[marketplace];

  const switchMarketplace = (m: Marketplace) => {
    setMarketplace(m);
    // Only the fields with a defensible default carry over — commission is
    // never pre-filled (see the note above), so it's always the seller's own
    // number, not a leftover from whichever marketplace they clicked first.
    setProcessingPct(PRESETS[m].processingPct);
    setFixedFee(PRESETS[m].fixedFee);
    setCommissionPct("");
  };

  const calc = useMemo(
    () =>
      computeFees({
        price: amount(itemPrice),
        shipCharged: amount(shippingCharged),
        shipCost: amount(shippingCost),
        commissionPct: parseRate(commissionPct),
        processingPct: amount(processingPct),
        fixedFee: amount(fixedFee),
        commissionBase: preset.commissionBase,
      }),
    [itemPrice, shippingCharged, shippingCost, commissionPct, processingPct, fixedFee, preset.commissionBase],
  );

  // Through formatMoney like every other price on the site (2026-09-23). The
  // hand-rolled `${"$" | "AUD "}${n.toFixed(2)}` printed "$-1.49" for the fee
  // tiles, "AUD 38.71" where every other page says "A$38.71", and no thousands
  // separators. formatMoney takes integer cents and leads a negative with U+2212.
  const money = (n: number) => formatMoney(Math.round(n * 100), currency);

  return (
    <div className="space-y-4">
      <div className="card-surface p-5">
        {/* Touch-only 48px floor (2026-09-23): the chips measured 20px tall on a
            phone. Scoped to pointer:coarse so the mouse-desktop chips stay 20px,
            the same convention as the TodaysTopDeals pills. aria-pressed because
            the selected marketplace was shown by colour alone. */}
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Marketplace">
          {(Object.keys(PRESETS) as Marketplace[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMarketplace(m)}
              aria-pressed={marketplace === m}
              className={`chip transition-colors [@media(pointer:coarse)]:min-h-12 [@media(pointer:coarse)]:px-3 ${
                marketplace === m ? "bg-brand-500 text-ink-950" : "bg-ink-800 text-slate-300 hover:bg-ink-700"
              }`}
            >
              {PRESETS[m].label}
            </button>
          ))}
        </div>

        {/* The inputs are `.input`: 16px below sm so iOS doesn't zoom the page on
            focus (they inherited the label's 14px), the 44/48px floor, and the
            focus ring they lacked (2026-09-23). */}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-slate-300">Sale price</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={itemPrice}
              onChange={(e) => setItemPrice(e.target.value)}
              className="input"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-slate-300">Shipping charged to buyer</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={shippingCharged}
              onChange={(e) => setShippingCharged(e.target.value)}
              className="input"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-slate-300">Your actual shipping cost</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={shippingCost}
              onChange={(e) => setShippingCost(e.target.value)}
              className="input"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-slate-300">Commission %</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={commissionPct}
              onChange={(e) => setCommissionPct(e.target.value)}
              placeholder="0.00"
              className="input"
            />
            <span className="mt-1 block text-xs text-slate-500">{preset.commissionHint}</span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-slate-300">Payment processing %</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={processingPct}
              onChange={(e) => setProcessingPct(e.target.value)}
              className="input"
            />
            <span className="mt-1 block text-xs text-slate-500">Applied to item price + shipping charged</span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-slate-300">Fixed fee per order</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={fixedFee}
              onChange={(e) => setFixedFee(e.target.value)}
              className="input"
            />
          </label>
        </div>
      </div>

      <div className="card-surface overflow-hidden">
        <div className="border-b border-ink-800 bg-ink-900/60 p-5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Your net payout</div>
          {/* NO NET FIGURE UNTIL THE COMMISSION IS ENTERED (2026-09-25). Commission
              starts blank on purpose (see the note at the top), and the headline
              used to print the net anyway with it counted as 0: US$38.71 on a $40
              TCGplayer sale, and "5.7% went to fees", both missing the largest fee.
              text-4xl below sm: at text-5xl "US$1,443.35" measured 302px against 246px
              of room at 320 (286 at 360), and this card is overflow-hidden, so the
              payout was clipped (2026-09-23). text-4xl is ~224px. */}
          {calc.complete ? (
            <>
              <div className="num font-display text-4xl font-extrabold leading-none text-white sm:text-5xl">{money(calc.net)}</div>
              <div className="mt-1 text-xs text-slate-500">
                {calc.effectiveFeePct.toFixed(1)}% of the sale price went to fees and your own shipping cost
              </div>
            </>
          ) : (
            <>
              <div className="font-display text-2xl font-extrabold leading-tight text-white sm:text-3xl">Enter your commission</div>
              <div className="mt-1 text-xs text-slate-500">
                The payout leaves out the marketplace&apos;s largest fee until you add your {preset.label} commission rate above.
              </div>
            </>
          )}
        </div>
        <div className="grid grid-cols-2 gap-px bg-ink-800 sm:grid-cols-4">
          {[
            ["Collected", calc.totalCollected],
            ["Commission", calc.complete ? -calc.commission : null],
            ["Processing", -calc.processing],
            ["Your shipping", -calc.shipCost],
          ].map(([label, value]) => (
            <div key={label as string} className="bg-ink-900 p-4">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
              {/* text-base until md: "US$1,501.00" is 116px at text-lg, wider than the
                  111px tile at 320 and the 115px four-column tile at 640. At text-base
                  it's 106px; from md the tiles are 147px+ (2026-09-23). */}
              <div className="num mt-1 text-base font-bold text-white md:text-lg">{value == null ? "—" : money(value as number)}</div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Fee rates and tiers change — this calculator does the stacked-fee math, but always confirm your current
        commission and processing rate on the marketplace itself before you price a listing. See{" "}
        <a
          href="https://help.tcgplayer.com/hc/en-us/articles/201357836-Fees"
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-brand-400 hover:underline"
        >
          TCGplayer&apos;s own fee page
        </a>{" "}
        for the current schedule, or{" "}
        <Link href="/browse" className="text-brand-400 hover:underline">
          check the going market price
        </Link>{" "}
        before you list.
      </p>
    </div>
  );
}
