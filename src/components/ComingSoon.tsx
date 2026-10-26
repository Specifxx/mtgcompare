import Link from "@/components/Link";
import { daysUntil, outIn, type Featured, type FeaturedItem } from "@/lib/coming-soon";
import { money, plural } from "@/lib/format";
import { formatRelease } from "@/lib/release";
import type { RegionInfo } from "@/lib/regions";
import { withMtg } from "@/lib/seo";

// The "Coming soon" block (lib/coming-soon.ts): the next set, its release date and how far off it is, then its headline products'
// cheapest open store pre-order in the region, each to its product page, and the set's pre-order hub. No hooks, so a server
// component on the region home and the body of the landing page's region switch (ComingSoonSwitch). Rows are a fixed height and
// `slots` keeps the list one height across regions, so a region swap on the landing page moves nothing below it.

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
  /** The list's height in rows (the landing page: the most any region shows). Default: this region's own rows. */
  slots?: number;
  headingLevel?: 2 | 3;
}) {
  if (!featured) return null;
  const { set, items, href } = featured;
  const days = daysUntil(set.releaseDate, today);
  if (days <= 0) return null; // release day: it is out, not coming
  const H = headingLevel === 2 ? "h2" : "h3";
  const rows = Math.max(slots ?? items.length, 1);
  // Two columns on a desktop (region homes are full width); the landing page's narrower block stays one.
  const cols = slots == null ? "lg:grid-cols-2 lg:gap-x-8" : "";
  return (
    <section className="card border-pre/40 bg-pre-soft/30 px-4 py-4 sm:px-5" aria-labelledby={`coming-${set.slug}`} data-coming-soon={set.slug}>
      <p className="eyebrow text-pre">Coming soon · out {formatRelease(set.releaseDate)}</p>
      <H id={`coming-${set.slug}`} className="mt-0.5 font-display text-lg font-bold leading-snug sm:text-xl">
        {withMtg(set.name)}: {outIn(days)}
      </H>
      <div className="mt-2" style={slots == null ? undefined : { minHeight: `${rows * ROW_REM}rem` }}>
        {items.length ? (
          <ul className={`grid grid-cols-1 ${cols}`} aria-label={`${set.name} pre-orders in ${r.inName}`}>
            {items.map((it) => (
              <li key={it.type}>
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
      <Link href={href} prefetch={false} className="mt-2 inline-flex min-h-11 items-center px-2 text-sm font-semibold text-pre">
        See every store&rsquo;s pre-order price →
      </Link>
    </section>
  );
}
