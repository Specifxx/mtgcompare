import Link from "next/link";
import type { Metadata } from "next";
import { adminMetadata, requireAdminPage } from "@/lib/admin";
import { COUNTRY_LIST, isCountry, type Country } from "@/lib/country";
import { previewDeals } from "@/lib/admin-deals";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";
export const generateMetadata = (): Promise<Metadata> => adminMetadata({ title: "Deals" });

// What the Deal Finder serves each audience, straight from the gated loader:
// signed out sees the real count and no row, a free account the top rows of the
// default ranking, Plus and Premium the whole list. requireAdminPage first
// (fails closed with a 404). An operator can check the gate without a second
// account: every number here comes from getDealList, never from this page.
export default async function AdminDealsPage({ searchParams }: { searchParams: { market?: string } }) {
  await requireAdminPage();
  const market: Country = searchParams.market && isCountry(searchParams.market.toUpperCase()) ? (searchParams.market.toUpperCase() as Country) : "US";
  const { count, previews, matrix } = await previewDeals(market);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Deals: who sees what</h1>
          <p className="max-w-3xl text-sm text-slate-400">
            The Deal Finder list as each audience is served it by the loader. The published count ({count == null ? "unavailable" : count.toLocaleString("en-US")}) is
            free for everyone; rows are cut once, in the loader. Free account: {matrix.free} rows. Plus and Premium: the whole list with the store picker, sorting,
            paging and &ldquo;only my cards&rdquo;.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-ink-700 bg-ink-850 p-1">
          {COUNTRY_LIST.map((c) => (
            <Link key={c.code} href={`/admin/deals?market=${c.code}`} className={`rounded-md px-2.5 py-1 text-sm ${c.code === market ? "bg-brand-500 font-medium text-white" : "text-slate-400 hover:text-white"}`}>
              {c.flag} {c.code}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {previews.map((p) => (
          <section key={p.audience.key} className="card-surface p-4" aria-labelledby={`aud-${p.audience.key}`}>
            <h2 id={`aud-${p.audience.key}`} className="text-lg font-semibold text-white">
              {p.audience.label} <span className="ml-2 text-xs font-normal uppercase tracking-wide text-slate-500">access: {p.access}</span>
            </h2>
            <p className="mb-2 text-xs text-slate-500">
              {p.rows.length} {p.rows.length === 1 ? "row" : "rows"} served of {p.total.toLocaleString("en-US")} on the list{p.locked ? " (locked preview)" : ""}.
            </p>
            {p.rows.length === 0 ? (
              <p className="text-sm text-slate-500">No row is served to this audience.</p>
            ) : (
              <ol className="divide-y divide-ink-800 text-sm">
                {p.rows.map(({ row, name, setCode, number }) => (
                  <li key={row.uid} className="flex items-baseline justify-between gap-3 py-1.5">
                    <span className="min-w-0 truncate text-slate-200">
                      {name} <span className="text-slate-500">{setCode}{number ? ` ${number}` : ""}{row.uid & 1 ? " · foil" : ""}</span>
                    </span>
                    <span className="num shrink-0 text-slate-300">
                      {money(row.buyCents, market)} <span className="text-slate-500">vs {money(row.marketCents, market)}</span> <span className="text-emerald-400">−{row.belowPct}%</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
