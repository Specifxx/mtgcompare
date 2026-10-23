import Link from "@/components/Link";
import { openPreorderGuides } from "@/lib/preorder-guides";
import { relativeDay } from "@/lib/format";
import { formatRelease } from "@/lib/release";
import { REGION_LIST, type Region } from "@/lib/regions";
import { withMtg } from "@/lib/seo";

// The way into a pre-order hub (/<region>/preorders/<set>, lib/preorder-guides.ts) from the pages people arrive on: one banner per
// set still on pre-order, soonest release first, with its release date and how far off it is. Generic: a set gets a banner when its
// guide is in the registry and disappears on release day (openPreorderGuides), so the next set needs no change here. No prices:
// the hub has them, checked; a cached banner would outlive them. A server component: no script.

/** On a region page: the hub in this region. */
export function PreorderBanner({ region, today = new Date().toISOString().slice(0, 10), limit = 1 }: { region: Region; today?: string; limit?: number }) {
  const open = openPreorderGuides(today).slice(0, limit);
  if (!open.length) return null;
  return (
    <ul className="grid gap-3" aria-label="Sets on pre-order">
      {open.map(({ set }) => (
        <li key={set.code}>
          <Link
            href={`/${region}/preorders/${set.slug}`}
            prefetch={false}
            data-preorder-banner={set.slug}
            className="card flex flex-wrap items-center justify-between gap-3 border-pre/40 bg-pre-soft/40 px-5 py-4 transition-shadow hover:shadow-lift"
          >
            <span className="min-w-0">
              <span className="eyebrow text-pre">Pre-order · out {formatRelease(set.releaseDate)}</span>
              <span className="mt-0.5 block font-display text-lg font-bold leading-snug">
                {withMtg(set.name)} releases {relativeDay(set.releaseDate, today)}
              </span>
              <span className="block text-sm text-muted">Every store taking pre-orders, cheapest first: Play Booster box, Collector box, bundle and more.</span>
            </span>
            <span className="shrink-0 text-sm font-semibold text-pre">Compare pre-orders →</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** On the landing page (no region): the hub in each of the seven regions, as plain links. */
export function PreorderRegionLinks({ today = new Date().toISOString().slice(0, 10) }: { today?: string }) {
  const open = openPreorderGuides(today).slice(0, 1);
  if (!open.length) return null;
  const { set } = open[0];
  return (
    <div className="card border-pre/40 bg-pre-soft/40 px-5 py-4" data-preorder-banner={set.slug}>
      <p className="eyebrow text-pre">Pre-order · out {formatRelease(set.releaseDate)}</p>
      <p className="mt-0.5 font-display text-lg font-bold leading-snug">
        {withMtg(set.name)} releases {relativeDay(set.releaseDate, today)}: compare pre-order prices
      </p>
      <ul className="mt-3 flex flex-wrap gap-2" aria-label={`${set.name} pre-orders by region`}>
        {REGION_LIST.map((r) => (
          <li key={r.region}>
            <Link href={`/${r.region}/preorders/${set.slug}`} prefetch={false} className="chip min-h-11">
              <span aria-hidden="true">{r.flag}</span> {r.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
