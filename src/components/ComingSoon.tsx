import Link from "@/components/Link";
import { daysUntil, outIn, type Featured, type FeaturedItem } from "@/lib/coming-soon";
import { money, plural } from "@/lib/format";
import { formatRelease } from "@/lib/release";
import type { RegionInfo } from "@/lib/regions";
import { withMtg } from "@/lib/seo";

// The "Coming soon" block (lib/coming-soon.ts): the next set, its release date and how far off it is, then its headline products'
// cheapest open store pre-order in the region, each to its product page, and the set's pre-order hub. No hooks, so a server
// component on the region home and the body of the landing page's region switch (ComingSoonSwitch). Short on purpose (owner,
// 2026-11-13: "too long vertically when there's only one row"): the hub link sits on the heading's line, and on the landing page
// (`slots` given) the products are ONE sideways row of fixed-size tiles, so the block is the same height for a region with one
// product or five and a region swap moves nothing below it. Before, it reserved one full row per product of the busiest region.

const ROW_REM = 3.25;

function Row({ item, r }: { item: FeaturedItem; r: Pick<RegionInfo, "region" | "market"> }) {
  const deck = item.type === "commander-deck";
  return (
    <Link
      href={`/${r.region}/p/${item.slug}`}
      prefetch={false}
      className="flex items-center justify-between gap-3 border-b border-line/60 px-2 hover:bg-pre-soft/60"
      style={{ height: `${ROW_REM}rem` }}
      data-coming-soon-item={item.type}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {item.label}
          {deck && item.decks ? <span className="font-normal text-muted"> · {plural(item.decks, "deck")}</span> : null}
        </span>
        <span className="block truncate text-xs text-muted">
          pre-order at {plural(item.stores, "store")}
          {deck && item.deckName ? ` · cheapest: ${item.deckName}` : ""}
          {item.msrpCents != null ? ` · US MSRP ${money(item.msrpCents, "US")}` : ""}
        </span>
      </span>
      <span className="shrink-0 text-right text-sm">
        <span className="text-xs text-muted">from </span>
        <span className="font-display font-bold tabular-nums">{money(item.cents, r.market)}</span>
      </span>
    </Link>
  );
}

export function ComingSoon({
  featured,
  r,
  today,
  slots,
  headingLevel = 2,
}: {
  featured: Featured | null;
  r: Pick<RegionInfo, "region" | "market" | "inName">;
  today: string;
  /** Given on the landing page (the most rows any region shows): the products become one fixed-height sideways row. */
  slots?: number;
  headingLevel?: 2 | 3;
}) {
  if (!featured) return null;
  const { set, items, href } = featured;
  const days = daysUntil(set.releaseDate, today);
  if (days <= 0) return null; // release day: it is out, not coming
  const H = headingLevel === 2 ? "h2" : "h3";
  // The landing page: one sideways row. The region home (full width, one region): two columns on a desktop.
  const row = slots != null;
  return (
    <section className="card border-pre/40 bg-pre-soft/30 px-4 py-3 sm:px-5" aria-labelledby={`coming-${set.slug}`} data-coming-soon={set.slug}>
      <div className="flex flex-wrap items-end justify-between gap-x-4">
        <div className="min-w-0">
          <p className="eyebrow text-pre">Coming soon · out {formatRelease(set.releaseDate)}</p>
          <H id={`coming-${set.slug}`} className="mt-0.5 font-display text-lg font-bold leading-snug sm:text-xl">
            {withMtg(set.name)}: {outIn(days)}
          </H>
        </div>
        <Link href={href} prefetch={false} className="inline-flex min-h-11 items-center text-sm font-semibold text-pre sm:min-h-0 sm:pb-0.5">
          See every store&rsquo;s pre-order price →
        </Link>
      </div>
      <div className="mt-2" style={row ? { minHeight: `${ROW_REM}rem` } : undefined}>
        {items.length ? (
          <ul className={row ? "scroller gap-2" : "grid grid-cols-1 lg:grid-cols-2 lg:gap-x-8"} aria-label={`${set.name} pre-orders in ${r.inName}`}>
            {items.map((it) => (
              <li key={it.type} className={row ? "w-[17rem] max-w-[85%] rounded-lg border border-line/60 bg-surface/60 [&>a]:border-b-0 [&>a]:px-3" : undefined}>
                <Row item={it} r={r} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-2 py-3 text-sm text-muted" data-coming-soon-empty>
            No store we track has opened pre-orders in {r.inName} yet.
          </p>
        )}
      </div>
    </section>
  );
}
