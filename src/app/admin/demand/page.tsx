import Link from "next/link";
import type { Metadata } from "next";
import { adminMetadata, requireAdminPage } from "@/lib/admin";
import { money } from "@/lib/format";
import { normalizeCountry, currencyOf, COUNTRY_LIST } from "@/lib/country";
import { ADMIN_DEMAND_DEFAULT_RANGE, ADMIN_DEMAND_RANGES, ADMIN_DEMAND_TOP_N, adminDemand, parseAdminDemandRange, type AdminDemandCard } from "@/lib/admin-demand";
import type { Movement } from "@/lib/demand-movement";
import { MoveBadge } from "@/components/MoveBadge";

export const dynamic = "force-dynamic";
export const generateMetadata = (): Promise<Metadata> => adminMetadata({ title: "Demand" });

// Demand leaderboard (RiftCompare's /admin/demand): the popularity signals the
// site records — searchCount (picks from the search box, the purest demand
// metric) and viewCount (any open) Admin-only
// (requireAdminPage) and uncached (lib/admin-demand.ts).
//
// Searches and views are cumulative counters windowed against the daily demand
// snapshot FILES on the data branch (lib/demand-snapshot.ts), so they are
// daily-resolution and only as deep as the snapshots reach. Demand Finder (/tools/demand) is the public,
// Premium version of the same signals, scoped to what a member wants.
export default async function AdminDemandPage({ searchParams }: { searchParams: { country?: string; range?: string } }) {
  await requireAdminPage();
  const country = normalizeCountry(searchParams.country);
  const currency = currencyOf(country);
  const range = parseAdminDemandRange(searchParams.range);

  const data = await adminDemand(range);
  const { window: demandWindow, windowUsable, inWindow } = data;
  const previous = windowUsable ? demandWindow?.previous ?? null : null;

  const num = new Intl.NumberFormat("en-US");
  const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });
  const day = (d: string) => dateFmt.format(new Date(`${d}T00:00:00Z`));

  function hrefFor(next: { country?: string; range?: string }) {
    const params = new URLSearchParams();
    const c = next.country ?? country;
    if (c !== "US") params.set("country", c);
    const r = next.range ?? range.key;
    if (r !== ADMIN_DEMAND_DEFAULT_RANGE) params.set("range", r);
    const qs = params.toString();
    return `/admin/demand${qs ? `?${qs}` : ""}`;
  }

  const CardTable = ({ rows, metric, moves }: { rows: AdminDemandCard[]; metric: "searchCount" | "viewCount"; moves: Map<string, Movement> | null }) => (
    <div className="overflow-x-auto rounded-xl border border-ink-700 bg-ink-850">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 font-medium">#</th>
            {moves && (
              <th className="px-1 py-2 font-medium" title="Rank movement against the previous period">
                Move
              </th>
            )}
            <th className="px-3 py-2 font-medium">Card</th>
            <th className="px-3 py-2 text-right font-medium">
              Searches{windowUsable && <span className="ml-1 normal-case text-slate-600">in window</span>}
            </th>
            <th className="px-3 py-2 text-right font-medium">
              Views{windowUsable && <span className="ml-1 normal-case text-slate-600">in window</span>}
            </th>
            {moves && (
              <th className="px-3 py-2 text-right font-medium" title="Rank in the previous period">
                Last
              </th>
            )}
            <th className="px-3 py-2 text-right font-medium">Lowest ({currency})</th>
            <th className="px-3 py-2 text-right font-medium">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => {
            const m = moves?.get(String(c.id));
            const low = c.low[country];
            return (
              <tr key={c.id} className="border-b border-ink-800 last:border-0 hover:bg-ink-800/60">
                <td className="px-3 py-2 tabular-nums text-slate-500">{i + 1}</td>
                {moves && (
                  <td className="px-1 py-2">
                    <MoveBadge move={m} newTitle="No activity on this measure in the previous period" />
                  </td>
                )}
                <td className="px-3 py-2">
                  <Link href={`/card/${c.slug}`} className="font-medium text-white hover:text-brand-400">
                    {c.variant ? `${c.name} (${c.variant})` : c.name}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {c.setCode} · {c.number}
                  </div>
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${metric === "searchCount" ? "font-semibold text-white" : "text-slate-400"}`}>
                  {num.format(windowUsable ? inWindow.get(c.id)?.searches ?? 0 : c.searchCount)}
                  {windowUsable && <div className="text-[11px] font-normal text-slate-600">{num.format(c.searchCount)} all-time</div>}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${metric === "viewCount" ? "font-semibold text-white" : "text-slate-400"}`}>
                  {num.format(windowUsable ? inWindow.get(c.id)?.views ?? 0 : c.viewCount)}
                  {windowUsable && <div className="text-[11px] font-normal text-slate-600">{num.format(c.viewCount)} all-time</div>}
                </td>
                {moves && <td className="px-3 py-2 text-right tabular-nums text-slate-500">{m && m.kind !== "new" ? `#${m.prev}` : "—"}</td>}
                <td className="px-3 py-2 text-right tabular-nums text-slate-300">{low != null ? money(low, country) : "—"}</td>
                <td className="px-3 py-2 text-right text-xs text-slate-500">{c.lastViewedAt ? dateFmt.format(c.lastViewedAt) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Demand leaderboard</h1>
          <p className="text-sm text-slate-400">What people are searching and viewing.</p>
        </div>
        {/* Country affects the price display. */}
        <div className="flex flex-wrap gap-1 rounded-lg border border-ink-700 bg-ink-850 p-1">
          {COUNTRY_LIST.map((c) => {
            const active = c.code === country;
            return (
              <Link
                key={c.code}
                href={hrefFor({ country: c.code, range: range.key })}
                className={`rounded-md px-2.5 py-1 text-sm ${active ? "bg-brand-500 font-medium text-white" : "text-slate-400 hover:text-white"}`}
              >
                {c.flag} {c.code}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Time window. Applies to every section below. */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="text-xs uppercase tracking-wide text-slate-500">Window</span>
        <div className="flex flex-wrap gap-1 rounded-lg border border-ink-700 bg-ink-850 p-1">
          {ADMIN_DEMAND_RANGES.map((r) => {
            const active = r.key === range.key;
            return (
              <Link
                key={r.key}
                href={hrefFor({ country, range: r.key })}
                className={`rounded-md px-2.5 py-1 text-sm ${active ? "bg-brand-500 font-medium text-white" : "text-slate-400 hover:text-white"}`}
              >
                {r.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* What the card numbers below actually measure: the two sources window
          differently and one of them can fall short, so this is a correctness
          statement, not decoration. */}
      {range.days != null && (
        <div
          className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
            windowUsable ? "border-ink-700 bg-ink-850 text-slate-400" : "border-amber-500/30 bg-amber-500/[0.06] text-amber-200/90"
          }`}
        >
          {windowUsable && demandWindow?.baselineDay ? (
            <>
              Searches and views show activity in the{" "}
              <span className="font-semibold text-white">
                last {demandWindow.coveredDays} day{demandWindow.coveredDays === 1 ? "" : "s"}
              </span>
              , measured against the daily snapshot from <span className="tabular-nums">{day(demandWindow.baselineDay)}</span>.
              {demandWindow.coveredDays !== range.days && <> You asked for {range.days} days; that&apos;s the closest snapshot available.</>}{" "}
              <span className="text-slate-500">
                Card counters are cumulative with no per-event log, so they can only be windowed to daily resolution.
              </span>
              <span className="mt-2 block">
                {previous ? (
                  <>
                    <span className="text-emerald-400">▲</span>/<span className="text-rose-400">▼</span> compare each card&apos;s rank with
                    the previous {previous.coveredDays} day{previous.coveredDays === 1 ? "" : "s"} (
                    <span className="tabular-nums">{day(previous.startDay)}</span> to <span className="tabular-nums">{day(previous.endDay)}</span>),
                    ranked the same way across every card with activity then. <span className="font-semibold text-amber-300">NEW</span> means
                    none on that measure in the previous period.
                  </>
                ) : (
                  <span className="text-slate-500">
                    Rank movement appears once snapshots reach back two windows ({range.days * 2} days); they go back{" "}
                    {demandWindow.totalDays} day{demandWindow.totalDays === 1 ? "" : "s"}.
                  </span>
                )}
              </span>
            </>
          ) : (
            <>
              <span className="font-semibold">Showing all-time searches and views.</span>{" "}
              {data.windowFailed
                ? "The demand snapshot files couldn't be read just now."
                : demandWindow && demandWindow.totalDays === 0
                  ? "No daily demand snapshots exist yet — the price import writes one a day to the history branch, so a window becomes available once two have run."
                  : `Daily snapshots only go back ${demandWindow?.totalDays ?? 0} day${demandWindow?.totalDays === 1 ? "" : "s"}, which doesn't cover a ${range.days}-day window.`}{" "}
            </>
          )}
        </div>
      )}

      <section className="mb-10">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-white">Most searched</h2>
          <span className="text-xs text-slate-500">
            purest demand signal · {windowUsable ? `last ${range.label}` : "all time"} · top {ADMIN_DEMAND_TOP_N}
          </span>
        </div>
        {data.topSearched.length === 0 ? (
          <Empty>{windowUsable ? `No search activity in the last ${range.label}.` : "No search activity recorded yet."}</Empty>
        ) : (
          <CardTable rows={data.topSearched} metric="searchCount" moves={data.searchMoves} />
        )}
      </section>

      <section className="mb-10">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-white">Most viewed</h2>
          <span className="text-xs text-slate-500">
            all opens, incl. QuickView · {windowUsable ? `last ${range.label}` : "all time"} · top {ADMIN_DEMAND_TOP_N}
          </span>
        </div>
        {data.topViewed.length === 0 ? (
          <Empty>{windowUsable ? `No views in the last ${range.label}.` : "No views recorded yet."}</Empty>
        ) : (
          <CardTable rows={data.topViewed} metric="viewCount" moves={data.viewMoves} />
        )}
      </section>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-ink-700 bg-ink-850 px-4 py-10 text-center text-slate-400">{children}</div>;
}
