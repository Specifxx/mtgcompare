import Link from "@/components/Link";
import type { SetCount } from "@/lib/hub-data";
import type { RegionInfo } from "@/lib/regions";
import { PRODUCT_TYPES } from "@/lib/sealed-title";
import { SETS } from "@/lib/sets";

/**
 * Every set the region lists, by series, newest first: plain links on the region home (the indexing round, 2026-10-25). The region home
 * is one click from the landing page, so every set page is two and every product in a set three (a set page lists all of its
 * products). Only sets with something listed here: an empty set page is a 404. Server-rendered, no script.
 */
export function SetIndex({ r, counts, types }: { r: RegionInfo; counts: ReadonlyMap<string, SetCount>; types: ReadonlySet<string> }) {
  const bySeries = new Map<string, { slug: string; name: string; products: number }[]>();
  for (const s of SETS) {
    const n = counts.get(s.code)?.products ?? 0;
    if (!n) continue;
    bySeries.set(s.series, [...(bySeries.get(s.series) ?? []), { slug: s.slug, name: s.name, products: n }]);
  }
  const series = [...bySeries].map(([name, sets]) => ({ name, sets }));
  if (!series.length) return null;
  return (
    <section aria-labelledby="every-set-h" className="mt-16">
      <h2 id="every-set-h" className="font-display text-2xl font-bold tracking-tight">
        Every set and product type in {r.inName}
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">Each set&rsquo;s sealed products at {r.adjective} stores, with how many are listed here today.</p>
      {/* Every product type listed here too: a type page indexes the type's products no set page lists (decks, tins, collections). */}
      <ul className="mt-4 flex flex-wrap gap-2" aria-label={`Product types in ${r.inName}`}>
        {PRODUCT_TYPES.filter((t) => types.has(t.label)).map((t) => (
          <li key={t.slug}>
            <Link href={`/${r.region}/type/${t.slug}`} prefetch={false} className="chip min-h-10">
              {t.plural}
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {series.map((g) => (
          <div key={g.name}>
            <h3 className="eyebrow">{g.name}</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {g.sets.map((s) => (
                <li key={s.slug}>
                  <Link href={`/${r.region}/sets/${s.slug}`} prefetch={false} className="inline-flex min-h-8 items-center font-semibold hover:text-brand hover:underline">
                    {s.name}
                  </Link>{" "}
                  <span className="text-muted">· {s.products}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
