import { annualSavingPct, perMonth, planPrice, PLAN_CENTS, usd, type Tier } from "@/lib/plans";

// The annual price, styled to make the saving pop (RiftCompare's
// AnnualPriceBlock, ported in wave 2, 2026-10-03): the "if you paid monthly"
// yearly total struck through, the annual price big, a glowing SAVE badge and
// the per-month equivalent. Presentational only (no hooks), so it works in the
// server /premium page and the client Plan dialog alike. Prices are plans.ts's.
export function AnnualPriceBlock({ size = "lg", tier = "premium" }: { size?: "lg" | "sm"; tier?: Tier }) {
  const fullYear = usd(PLAN_CENTS[tier].month * 12);
  const save = annualSavingPct(tier);
  const big = size === "lg" ? "text-4xl" : "text-3xl";
  return (
    <div>
      <div className="flex items-baseline justify-center gap-2">
        <span className="text-base text-slate-600 line-through">{fullYear}</span>
        <span className={`num ${big} font-extrabold text-white`}>{planPrice(tier, "year")}</span>
        <span className="text-sm text-slate-400">/yr</span>
      </div>
      <div className="mt-2 flex items-center justify-center gap-2">
        {save > 0 && (
          <span className="inline-flex items-center gap-1 rounded-md bg-brand-500/15 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider text-brand-400 ring-1 ring-brand-500/40 shadow-[0_0_14px_rgba(217,43,51,0.28)]">
            <span aria-hidden>▼</span> Save {save}%
          </span>
        )}
        <span className="num text-xs text-slate-400">≈ {perMonth(tier)}/mo</span>
      </div>
    </div>
  );
}
