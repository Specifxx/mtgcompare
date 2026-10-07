// THE TIER COMPARISON — ONE TABLE, ONE LIST OF ROWS, TWO PLACES THAT SHOW IT
// (RiftCompare's TierComparisonTable, ported in wave 2, 2026-10-03). The rows
// are TIER_COMPARISON in lib/plans.ts — every one a real entitlement, every
// number the enforced constant from lib/tier-limits.ts — and this renders them
// on /premium and, compact, in the Plan dialog and the slide-in, so the two
// can never give different answers to "what do I get?".
//
// NOT a client component: pure presentation, so it renders inside the
// server-rendered /premium page and the client dialog alike.
//
// `false` renders an em dash (a red ✗ in the dialog), `true` a tick, a string
// as-is — the rows that are neither a flat yes nor a flat no are the honest
// part of the table and stay strings.
import { TIER_COMPARISON } from "@/lib/plans";

export function TierCell({ v, dialog = false }: { v: boolean | string; dialog?: boolean }) {
  if (v === true)
    return (
      <span className="font-bold text-brand-400" aria-label="Included">
        ✓
      </span>
    );
  if (v === false)
    return dialog ? (
      <span className="font-bold text-red-500" aria-label="Not included">
        ✗
      </span>
    ) : (
      <span className="text-slate-600" aria-label="Not included">
        —
      </span>
    );
  return <span className="text-xs font-semibold text-slate-300">{v}</span>;
}

// The compact dialog is a fast glance, not the full accounting. A row is
// omitted there for one reason: NO SIGNAL — a tick in every column tells a
// reader deciding whether to pay nothing at all. DERIVED, not hand-listed.
export const DIALOG_OMIT_FEATURES = new Set(TIER_COMPARISON.filter((r) => r.account === true && r.plus === true && r.premium === true).map((r) => r.feature));

// /premium spells these out as "Full list …" for the paid columns; the dialog
// collapses them to a tick (a 64px column can't hold "Full list + only my
// cards"). Only rows where BOTH paid columns get the full thing belong here.
export const DIALOG_BINARY_FEATURES = new Set(["Deal Finder"]);

/**
 * `compact` is also "is this the dialog?" — it trims padding and type scale
 * AND switches to the dialog's presentation (fewer rows, a red ✗). `showPlus`
 * renders the Plus column (always configured on OP Compare). `tinted` gives
 * each paid column a faint wash (Plus slate, Premium gold).
 */
export function TierComparisonTable({ compact = false, showPlus = true, tinted = false }: { compact?: boolean; showPlus?: boolean; tinted?: boolean }) {
  // lnum without tnum: feature names are prose, and tabular figures gave
  // Inter's hyphen a digit-wide advance ("Ad -free").
  const featureCell = compact ? "px-2 py-1.5 [font-feature-settings:'lnum'_1]" : "px-2.5 py-2.5 text-[13px] sm:px-3 sm:text-sm [font-feature-settings:'lnum'_1]";
  const tierHead = compact ? "w-16 px-2 py-1.5" : "w-14 px-1 py-2.5 text-xs sm:w-24 sm:px-3 sm:text-sm";
  const tierData = compact ? "px-2 py-1.5" : "w-14 px-1 py-2.5 text-xs sm:w-24 sm:px-3 sm:text-sm";
  const rows = compact
    ? TIER_COMPARISON.filter((r) => !DIALOG_OMIT_FEATURES.has(r.feature)).map((r) => (DIALOG_BINARY_FEATURES.has(r.feature) ? { ...r, plus: true, premium: true } : r))
    : TIER_COMPARISON;
  const plusWash = tinted ? "bg-slate-500/[0.06]" : "";
  const premiumWash = tinted ? "bg-gold/[0.07]" : "";
  return (
    // On phones every column fits (56px tier columns at 12px text); the long
    // strings wrap inside their cell rather than widening the table.
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse ${compact ? "min-w-0 text-xs" : (showPlus ? "min-w-0 sm:min-w-[560px]" : "min-w-0 sm:min-w-[440px]") + " text-sm"}`}>
        <thead>
          <tr className="border-b border-ink-700 text-left">
            <th scope="col" className={`${featureCell} font-semibold text-slate-400`}>
              Feature
            </th>
            <th scope="col" className={`${tierHead} text-center font-bold text-brand-400`}>
              Free account
            </th>
            {showPlus && (
              <th scope="col" className={`${tierHead} ${plusWash} text-center font-bold text-slate-200`}>
                Plus
              </th>
            )}
            <th scope="col" className={`${tierHead} ${premiumWash} text-center font-bold text-gold`}>
              Premium
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.feature} className="border-b border-ink-800 last:border-0">
              <th scope="row" className={`${featureCell} text-left font-normal text-slate-200`}>
                {r.feature}
              </th>
              <td className={`${tierData} text-center`}>
                <TierCell v={r.account} dialog={compact} />
              </td>
              {showPlus && (
                <td className={`${tierData} ${plusWash} text-center`}>
                  <TierCell v={r.plus} dialog={compact} />
                </td>
              )}
              <td className={`${tierData} ${premiumWash} text-center`}>
                <TierCell v={r.premium} dialog={compact} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
