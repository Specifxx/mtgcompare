import type { Metadata } from "next";
import Link from "next/link";
import { StatTile } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { adminMetadata, requireAdminPage } from "@/lib/admin";
import { failedRunsSince, loadStoreHealthInputs, type RunRow } from "@/lib/admin-health";
import { MARKETS, isCountry } from "@/lib/country";
import { ago, int, shortDate } from "@/lib/format";
import { computeStoreHealth, isMildAlert, type StoreHealth } from "@/lib/store-health";
import { STORES } from "@/lib/stores";
import { DATA_TABLE } from "@/components/prose";

export const dynamic = "force-dynamic";
export const generateMetadata = (): Promise<Metadata> => adminMetadata({ title: "Store health" });

/** A run that read at least this share of STORES counts as a full run. */
const FULL_RUN_SHARE = 0.8;

const rate = (r: number | null) => (r == null ? "–" : `${Math.round(r * 100)}%`);

function duration(r: RunRow) {
  if (!r.finishedAt) return "–";
  const s = Math.round((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

function Latest({ h }: { h: StoreHealth }) {
  const l = h.latest;
  if (!l) return <span className="text-slate-500">not in recent runs</span>;
  return (
    <span className="num text-xs text-slate-300">
      {l.products} / {l.cards} / {l.sealed} / {l.inStock}
    </span>
  );
}

function AlertLines({ h }: { h: StoreHealth }) {
  return (
    <>
      {h.alerts.map((a) => (
        <p key={a.kind} className={`text-sm ${isMildAlert(a.kind) ? "text-amber-300" : "text-red-300"}`}>
          {a.text}
        </p>
      ))}
      {h.latest?.misses && Object.keys(h.latest.misses).length ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-slate-400">Latest misses</summary>
          <ul className="mt-1 text-xs text-slate-400">
            {Object.entries(h.latest.misses)
              .sort((a, b) => b[1] - a[1])
              .map(([k, n]) => (
                <li key={k}>
                  <code>{k}</code>: {int(n)}
                </li>
              ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

export default async function AdminStoreHealth({ searchParams }: { searchParams: { market?: string } }) {
  await requireAdminPage();
  const market = isCountry(searchParams.market) ? searchParams.market : null;
  let inputs: Awaited<ReturnType<typeof loadStoreHealthInputs>>;
  let failed7: number | null = null;
  try {
    [inputs, failed7] = await Promise.all([loadStoreHealthInputs(), failedRunsSince(7).catch(() => null)]);
  } catch (e) {
    return (
      <div>
        <h1 className="text-3xl text-white">Store health</h1>
        <div className="mt-6">
          <EmptyState title="Couldn't load the import history" body={e instanceof Error ? e.message.slice(0, 200) : undefined} />
        </div>
      </div>
    );
  }
  const health = computeStoreHealth(STORES, inputs.history, inputs.offers);
  const alerting = health.filter((h) => h.alerts.length).sort((a, b) => b.alerts.length - a.alerts.length || a.name.localeCompare(b.name));
  const totalAlerts = alerting.reduce((a, h) => a + h.alerts.length, 0);
  // "Full" means it read (nearly) every store: a partial IMPORT_ONLY_* rerun is
  // also recorded as kind 'full', with a one- or few-store summary.
  const lastFull = inputs.runs.find((r) => r.ok && r.kind === "full" && (r.storeCount ?? 0) >= FULL_RUN_SHARE * STORES.length);
  const shown = market ? health.filter((h) => h.country === market) : health;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl text-white">Store health</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          From each store&apos;s own reads in the last 8 days of imports (ImportRun summaries), whatever its platform (Shopify, ShadowPOS, Ecwid,
          BigCommerce…). A store&apos;s title-format change usually shows up here first, as a match-rate drop; every matching rule changed for it needs a
          real title in <code>tests/match.test.ts</code>.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="Stores tracked" value={int(STORES.length)} />
        <StatTile label="Stores alerting" value={int(alerting.length)} tone={alerting.length ? "text-gold" : undefined} />
        <StatTile label="Total alerts" value={int(totalAlerts)} />
        <StatTile label="Last full run" value={lastFull ? ago(lastFull.finishedAt ?? lastFull.startedAt) : "–"} />
        <StatTile label="Failed runs · 7d" value={failed7 == null ? "–" : int(failed7)} />
      </div>

      <section id="needs">
        <h2 className="mb-3 text-xl text-white">Needs a look ({alerting.length})</h2>
        {alerting.length ? (
          <>
            {/* Phones: one card per store, alerts first in view (the table scrolls sideways). */}
            <ul className="space-y-3 sm:hidden">
              {alerting.map((h) => (
                <li key={h.key} className="card-surface space-y-1 p-3">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <a href={h.base} target="_blank" rel="nofollow noopener" className="font-semibold text-white hover:text-brand-400">
                      {h.name}
                    </a>
                    <span className="text-xs text-slate-400">{h.country}</span>
                    <span className="text-xs text-slate-500">
                      {h.key} · {h.platform}
                    </span>
                  </p>
                  <AlertLines h={h} />
                  <p className="text-xs text-slate-500">
                    Latest products / cards / sealed / in stock: <Latest h={h} /> · match {rate(h.matchRate)} ({rate(h.baselineMatchRate)})
                  </p>
                </li>
              ))}
            </ul>
            <div className="card-surface hidden overflow-x-auto sm:block">
              <table className={`${DATA_TABLE} min-w-[56rem]`}>
                <thead>
                  <tr>
                    <th>Store</th>
                    <th>Market</th>
                    <th>Latest products / cards / sealed / in stock</th>
                    <th>Match rate (baseline)</th>
                    <th>Alerts</th>
                  </tr>
                </thead>
                <tbody>
                  {alerting.map((h) => (
                    <tr key={h.key} className="align-top">
                      <td className="px-3 py-2">
                        <a href={h.base} target="_blank" rel="nofollow noopener" className="font-semibold text-white hover:text-brand-400">
                          {h.name}
                        </a>
                        <span className="block text-xs text-slate-500">
                          {h.key} · {h.platform}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-300">{h.country}</td>
                      <td className="px-3 py-2">
                        <Latest h={h} />
                      </td>
                      <td className="px-3 py-2 text-slate-300">
                        {rate(h.matchRate)} <span className="text-slate-500">({rate(h.baselineMatchRate)})</span>
                      </td>
                      <td className="px-3 py-2">
                        <AlertLines h={h} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <EmptyState title="Every store looks healthy" />
        )}
      </section>

      <details className="card-surface" open={Boolean(market)}>
        <summary className="cursor-pointer px-4 py-3 font-semibold text-white">All stores ({shown.length})</summary>
        <div className="flex flex-wrap gap-2 px-4 pb-3">
          <Link href="/admin/store-health" className={!market ? "chip bg-brand-500 text-white" : "chip border border-ink-700 text-slate-300"}>
            All
          </Link>
          {MARKETS.map((m) => (
            <Link
              key={m}
              href={`/admin/store-health?market=${m}`}
              className={m === market ? "chip bg-brand-500 text-white" : "chip border border-ink-700 text-slate-300"}
            >
              {m}
            </Link>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className={`${DATA_TABLE} min-w-[52rem]`}>
            <thead>
              <tr>
                <th>Store</th>
                <th>Market</th>
                <th>Platform</th>
                <th>Listings</th>
                <th>In stock</th>
                <th>Median (8d)</th>
                <th>Match rate</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((h) => (
                <tr key={h.key}>
                  <td className="px-3 py-2 text-slate-200">{h.name}</td>
                  <td className="px-3 py-2 text-slate-400">{h.country}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">{h.platform}</td>
                  <td className="num px-3 py-2">{int(h.offers.listings)}</td>
                  <td className="num px-3 py-2">{int(h.offers.inStock)}</td>
                  <td className="num px-3 py-2">{h.medianListings == null ? "–" : int(Math.round(h.medianListings))}</td>
                  <td className="px-3 py-2">{rate(h.matchRate)}</td>
                  <td className="px-3 py-2">
                    {h.alerts.length && h.alerts.every((a) => isMildAlert(a.kind)) ? (
                      <span className="chip border border-amber-400/50 text-amber-300">Last read failed</span>
                    ) : h.alerts.length ? (
                      <span className="chip border border-red-400/50 text-red-300">
                        {h.alerts.length} alert
                        {h.alerts.length === 1 ? "" : "s"}
                      </span>
                    ) : h.latest ? (
                      <span className="chip border border-emerald-400/40 text-emerald-300">Healthy</span>
                    ) : (
                      <span className="chip border border-ink-700 text-slate-400">Unknown</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <section>
        <h2 className="mb-3 text-xl text-white">Recent runs</h2>
        <div className="card-surface overflow-x-auto">
          <table className={`${DATA_TABLE} min-w-[56rem]`}>
            <thead>
              <tr>
                <th>Run</th>
                <th>Kind</th>
                <th>Started</th>
                <th>Duration</th>
                <th>Result</th>
                <th>Stores</th>
                <th>Sets / cards / sealed / TCGplayer offers</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {inputs.runs.map((r) => (
                <tr key={r.id}>
                  <td className="num px-3 py-2">#{r.id}</td>
                  <td className="px-3 py-2 text-slate-300">{r.kind}</td>
                  <td className="px-3 py-2 text-slate-300" title={new Date(r.startedAt).toISOString()}>
                    {shortDate(r.startedAt)} · {ago(r.startedAt)}
                  </td>
                  <td className="px-3 py-2 text-slate-300">{duration(r)}</td>
                  <td className="px-3 py-2">
                    {r.ok ? <span className="text-emerald-300">ok</span> : <span className="text-red-300">{r.finishedAt ? "failed" : "running / died"}</span>}
                  </td>
                  <td className="num px-3 py-2">{r.storeCount ?? "–"}</td>
                  <td className="num px-3 py-2 text-xs">
                    {r.catalog
                      ? `${r.catalog.sets ?? "–"} / ${r.catalog.cards ?? "–"} / ${r.catalog.sealed ?? "–"} / ${r.catalog.tcgplayerOffers ?? "–"}`
                      : "–"}
                  </td>
                  <td className="max-w-xs truncate px-3 py-2 text-xs text-red-300" title={r.error ?? undefined}>
                    {r.error ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
