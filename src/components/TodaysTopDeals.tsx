"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { COUNTRIES } from "@/lib/country";
import { TIER_THRESHOLDS, inTier, mixByTier, type BudgetTier } from "@/lib/deal-ui";
import { money } from "@/lib/format";
import { cardImage } from "@/lib/images";
import type { HomeDeal, TopDeals } from "@/lib/top-deals";
import { useMe } from "@/lib/use-me";
import CardQuickLink from "./CardQuickLink";
import { Icon } from "./Icon";
import PlanButton from "./PlanButton";

// Homepage "Today's Top Deals" (RiftCompare's TodaysTopDeals). Up to three
// columns, one per signal, empty ones dropped and the grid sized to the rest:
//   Biggest savings (Plus) — Deal Finder's default list sorted by %. The page
//     carries only its single best row (the gate is in the query, never CSS),
//     so non-members see that row and "Unlock N more with Plus", N the REAL
//     count of the list. A member's browser fetches the other rows from
//     /api/top-deals/savings, which checks the tier on the server; until it
//     answers a member sees the one row and no teaser.
//   Price drops, Biggest 7-day climbs (free).
// Budget tabs filter every column by price with per-market thresholds; "All"
// interleaves cheap and pricey. Rows open QuickView through CardQuickLink.
type ColumnKey = "savings" | "drops" | "rising";
type ColumnDef = { key: ColumnKey; label: string; sub: string; gated: boolean; allHref: string; allLabel: string };

const COLUMNS: ColumnDef[] = [
  { key: "savings", label: "Biggest savings", sub: "Cards selling below the TCGplayer market price", gated: true, allHref: "/tools/deal-finder", allLabel: "All deals" },
  { key: "drops", label: "Price drops", sub: "Biggest 7-day falls in TCGplayer market price", gated: false, allHref: "/movers", allLabel: "All movers" },
  { key: "rising", label: "Biggest 7-day climbs", sub: "Biggest 7-day rises in TCGplayer market price", gated: false, allHref: "/movers", allLabel: "All movers" },
];

const TIERS: { key: BudgetTier; label: (t: { small: number; mid: number }, fmt: (c: number) => string) => string }[] = [
  { key: "all", label: () => "All" },
  { key: "small", label: (t, fmt) => `Under ${fmt(t.small)}` },
  { key: "mid", label: (t, fmt) => `Under ${fmt(t.mid)}` },
  { key: "big", label: () => "Big ticket" },
];

// Literal class names so Tailwind's scan sees them; the last panel spans the
// row from sm to xl so no half-row is left empty.
const GRID_COLS: Record<number, string> = {
  1: "",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 xl:grid-cols-3 sm:[&>*:last-child]:col-span-2 xl:[&>*:last-child]:col-span-1",
};

function DealRow({ deal, country, kind }: { deal: HomeDeal; country: TopDeals["country"]; kind: ColumnKey }) {
  const badgeTone = kind === "rising" ? "bg-emerald-400/10 text-up" : kind === "drops" ? "bg-rose-400/10 text-down" : "bg-emerald-400/10 text-emerald-400";
  return (
    <li>
      <CardQuickLink slug={deal.slug} className="flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-ink-800/60" title={deal.title}>
        <span className="h-11 w-8 shrink-0 overflow-hidden rounded bg-ink-800">
          {deal.hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cardImage.thumb(deal.id)} alt="" width={32} height={44} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">
            {deal.title}
            {deal.variant ? <span className="text-xs font-normal text-slate-400"> ({deal.variant})</span> : null}
          </span>
          <span className="block truncate text-[11px] text-slate-500">{deal.subtitle}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="num text-sm font-bold text-accent">
            {deal.approx ? "≈" : ""}
            {money(deal.priceCents, country)}
          </span>
          <span className={`num rounded px-1.5 py-0.5 text-[11px] font-bold ${badgeTone}`}>{deal.badge}</span>
        </span>
      </CardQuickLink>
    </li>
  );
}

function LockedTeaser({ count }: { count: number }) {
  return (
    <li className="flex flex-1 flex-col items-center justify-center gap-1.5 px-3 py-6 text-center">
      <Icon name="lock" className="h-5 w-5 text-gold" />
      <PlanButton surface="gate:home-deals" tier="plus" className="inline-flex min-h-11 items-center text-sm font-bold text-gold hover:underline">
        Unlock {count.toLocaleString("en-US")} more with Plus →
      </PlanButton>
    </li>
  );
}

export function TodaysTopDeals({ deals }: { deals: TopDeals }) {
  const country = deals.country;
  const info = COUNTRIES[country];
  const { me } = useMe();
  const member = me.tier != null;
  const [memberSavings, setMemberSavings] = useState<HomeDeal[] | null>(null);
  useEffect(() => {
    if (!member) return;
    let live = true;
    fetch("/api/top-deals/savings", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ country: string; savings: HomeDeal[] }>) : null))
      .then((j) => {
        if (live && j && j.country === country && Array.isArray(j.savings) && j.savings.length) setMemberSavings(j.savings);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [member, country]);
  const thresholds = TIER_THRESHOLDS[country];
  const [tier, setTier] = useState<BudgetTier>("all");
  const fmt = (c: number) => money(c, country);

  const all = COLUMNS.map((def) => ({ def, items: def.key === "savings" && member && memberSavings ? memberSavings : deals[def.key] })).filter((c) => c.items.length > 0);
  const columns = all
    .map(({ def, items }) => ({ def, items: tier === "all" ? mixByTier(items, thresholds.mid) : items.filter((d) => inTier(d.priceCents, tier, thresholds)) }))
    .filter((c) => c.items.length > 0);

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl text-white">Today&apos;s Top Deals</h2>
          <p className="mt-1 text-[15px] text-slate-400">The best live opportunities in {info.place} right now — refreshed twice a day.</p>
        </div>
        <Link href="/tools/deal-finder" className="btn-ghost">
          Browse all deals →
        </Link>
      </div>

      {all.length === 0 ? (
        <div className="card-surface p-6 text-center text-sm text-slate-400">
          No deals in {info.place} right now. <Link href="/tools/deal-finder" className="text-brand-400 hover:underline">Deal Finder</Link> explains how a card makes the list.
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter deals by price">
            {TIERS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tier === t.key}
                onClick={() => setTier(t.key)}
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold transition-colors [@media(pointer:coarse)]:min-h-11 ${
                  tier === t.key ? "bg-brand-500 text-[#ffffff]" : "bg-ink-900 text-slate-400 hover:bg-ink-800 hover:text-slate-200"
                }`}
              >
                {t.label(thresholds, fmt)}
              </button>
            ))}
          </div>
          {columns.length === 0 ? (
            <div className="card-surface p-6 text-center text-sm text-slate-400">
              No {TIERS.find((t) => t.key === tier)?.label(thresholds, fmt).toLowerCase()} deals in {info.place} right now — try another filter.
            </div>
          ) : (
            <div className={`grid grid-cols-1 items-stretch gap-4 ${GRID_COLS[columns.length] ?? GRID_COLS[3]}`}>
              {columns.map(({ def, items }) => {
                const gated = def.gated && !member;
                const shown = items;
                const total = def.key === "savings" ? deals.savingsTotal : items.length;
                const locked = gated ? Math.max(0, total - shown.length) : 0;
                return (
                  <div key={def.key} className="card-surface flex h-full min-w-0 flex-col p-3">
                    <h3 className="px-1 text-base text-white">{def.label}</h3>
                    <p className="mb-1 px-1 text-[11px] leading-snug text-slate-500">{def.sub}</p>
                    <ul className="flex flex-1 flex-col divide-y divide-ink-800">
                      {shown.map((d) => (
                        <DealRow key={d.id} deal={d} country={country} kind={def.key} />
                      ))}
                      {locked > 0 ? <LockedTeaser count={locked} /> : null}
                    </ul>
                    <Link
                      href={def.allHref}
                      className="mt-1.5 flex min-h-10 items-center justify-center gap-1 rounded-md border border-ink-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:border-brand-500 hover:text-white"
                    >
                      {def.allLabel} →
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
