import Link from "next/link";
import type { Metadata } from "next";
import { adminMetadata, requireAdminPage } from "@/lib/admin";
import { formatMoney } from "@/lib/format-currency";
import { currencyOf, COUNTRY_LIST } from "@/lib/country";
import { getCachedRisingCards, getRisingWeekAgo } from "@/lib/data";
import { parseRiseScope, type RisePick, type RiseComponents, type RiseScope } from "@/lib/rise-predictor";
import { RisingSnapshotPanel } from "@/components/admin/RisingSnapshotPanel";
import { MoveBadge } from "@/components/MoveBadge";
import { movementAgainst, weekAgoLabel } from "@/lib/rising-movement";

export const dynamic = "force-dynamic";
export const generateMetadata = (): Promise<Metadata> => adminMetadata({ title: "Rising" });

// RiftCompare's /admin/rising, for OP Compare: the full Rising Cards ranking
// with its signal breakdown, the validation tiles, and the Hot 40 snapshot
// panel. requireAdminPage first (fails closed with a 404).

// Tiny server-rendered price sparkline (no client JS) from a cents series.
function Spark({ values, w = 96, h = 28 }: { values: number[]; w?: number; h?: number }) {
  if (values.length < 2) return <span className="text-slate-600">—</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / span) * (h - 4) - 2).toFixed(1)}`);
  const up = values[values.length - 1] >= values[0];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts.join(" ")} fill="none" stroke={up ? "#34d17e" : "#fb7185"} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Signed % chip (green up / red down / grey flat).
function Pct({ v, dp = 1 }: { v: number | null; dp?: number }) {
  if (v == null) return <span className="text-slate-600">—</span>;
  const tone = v > 0 ? "text-up" : v < 0 ? "text-down" : "text-slate-400";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return <span className={`num ${tone}`}>{sign}{Math.abs(v).toFixed(dp)}%</span>;
}

// One z-score component as a diverging bar (centred at 0; right=positive).
function ZBar({ z }: { z: number }) {
  const mag = Math.min(1, Math.abs(z) / 2.5); // ±2.5σ fills the half-bar
  const pos = z >= 0;
  return (
    <div className="relative h-2 w-14 rounded-full bg-ink-800" title={z.toFixed(2)}>
      <div
        className={`absolute top-0 h-2 ${pos ? "rounded-r-full bg-brand-500/80" : "rounded-l-full bg-rose-500/70"}`}
        style={pos ? { left: "50%", width: `${mag * 50}%` } : { right: "50%", width: `${mag * 50}%` }}
      />
      <div className="absolute left-1/2 top-0 h-2 w-px -translate-x-1/2 bg-ink-600" />
    </div>
  );
}

const COMPONENTS: { key: keyof RiseComponents; label: string }[] = [
  { key: "demand", label: "Demand" },
  { key: "velocity", label: "Velocity" },
  { key: "room", label: "Room" },
  { key: "scarcity", label: "Scarcity" },
  { key: "momentum", label: "Momentum" },
];

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-950/60 p-3">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="num mt-0.5 text-lg font-extrabold text-white">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

export default async function AdminRisingPage({ searchParams }: { searchParams: { country?: string } }) {
  await requireAdminPage();

  // Scope defaults to GLOBAL (like the RiftCompare Index): demand is market-agnostic,
  // so Global uses total cross-market supply. Every COUNTRY_LIST market parses
  // (SG/CA/EU fell back to Global here until 2026-09-25, so no snapshot could be
  // minted for them).
  const scope: RiseScope = parseRiseScope(searchParams.country, "GLOBAL");
  const isGlobal = scope === "GLOBAL";

  // The same loaders /tools/rising and the homepage read (weekly history,
  // daily operational inputs — rise-predictor.ts), so an admin load never
  // triggers a second copy of the scan under its own key.
  //
  // Last week's chart for this scope (lib/rising-movement.ts): the most recent
  // Hot 40 snapshot at least six days old — what next week's snapshot will be
  // compared with too. None → no Move column, and the panel above says so.
  const [analysis, weekAgo] = await Promise.all([getCachedRisingCards(scope), getRisingWeekAgo(scope)]);
  const moves = movementAgainst(analysis.picks.map((p) => p.id), weekAgo);

  const bt = analysis.backtest;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Rising — likely to go up</h1>
          <p className="max-w-3xl text-sm text-slate-400">
            Cards ranked by a composite of demand and price‑timing signals: high or rising search
            interest that hasn&apos;t re‑rated yet (near its range low, thin supply, not already
            spiking). Every column is real data; the score is a transparent weighted sum of
            cross‑sectional z‑scores. Not financial advice.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-ink-700 bg-ink-850 p-1">
          {[{ code: "GLOBAL" as RiseScope, flag: "🌐", label: "Global" }, ...COUNTRY_LIST.map((c) => ({ code: c.code as RiseScope, flag: c.flag, label: c.code }))].map((opt) => {
            const active = opt.code === scope;
            const params = new URLSearchParams();
            if (opt.code !== "GLOBAL") params.set("country", opt.code);
            const qs = params.toString();
            return (
              <Link
                key={opt.code}
                href={`/admin/rising${qs ? `?${qs}` : ""}`}
                className={`rounded-md px-2.5 py-1 text-sm ${active ? "bg-brand-500 font-medium text-white" : "text-slate-400 hover:text-white"}`}
              >
                {opt.flag} {opt.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Mint a public, frozen copy of exactly this ranking — see the doc
          comment on model RisingSnapshot in prisma/schema.prisma. Sits ABOVE
          the tiles because it acts on what the page is showing: an operator
          reads the table, decides this run is worth sharing, and the control
          for that should not be at the bottom of a long table. */}
      <RisingSnapshotPanel scope={scope} />
      <p className="-mt-4 mb-6 text-xs text-slate-500">
        {weekAgo ? (
          <>
            Move ▲▼ compares today&apos;s ranking with the same ranking rebuilt as of {weekAgoLabel(weekAgo)}, 7 days
            earlier: demand and prices as they stood then, today&apos;s stock counts (nothing records those
            historically). NEW means the card had no searches by then. Snapshots freeze this movement.
          </>
        ) : (
          <>
            The ranking from 7 days ago couldn&apos;t be rebuilt (no demand snapshots that far back, or a failed read),
            so there is no movement. Snapshots still generate as normal, without arrows.
          </>
        )}
      </p>

      {/* Validation + status tiles */}
      <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {/* `qualifying` is cards with ENOUGH points to score, not cards with any
            history — labelling it "with price history" read as "the importer has
            recorded nothing" when in fact every card had a series, just a short
            one. Report both, and name the threshold. */}
        <Stat
          label="Universe"
          value={analysis.failed ? "Failed" : String(analysis.universeSize)}
          sub={
            analysis.failed
              ? "load failed — see the function logs; retrying in ~5 min"
              : analysis.withAnyHistory === 0
                ? "no price history recorded"
                : `${analysis.withAnyHistory} with history · ${analysis.qualifying} with price signals (≥${analysis.minPointsRequired} clean weekly pts)`
          }
        />
        <Stat
          label="Demand velocity"
          value={analysis.velocityActive ? "Active" : "Warming up"}
          sub={analysis.velocityActive ? `${analysis.snapshotDays} snapshot days` : `${analysis.snapshotDays}/3+ days needed`}
        />
        <Stat
          label="Backtest signal"
          value={bt ? bt.spearman.toFixed(2) : "—"}
          sub={bt ? `ρ, room→${bt.lagDays}d return (n=${bt.n})` : `needs ${analysis.minPointsRequired}+ pts/card`}
        />
        <Stat
          label="Top‑third return"
          value={bt ? `${bt.topTercileReturnPct > 0 ? "+" : ""}${bt.topTercileReturnPct}%` : "—"}
          sub={bt ? `vs median ${bt.medianReturnPct > 0 ? "+" : ""}${bt.medianReturnPct}%` : ""}
        />
        <Stat
          label="Bottom‑third"
          value={bt ? `${bt.bottomTercileReturnPct > 0 ? "+" : ""}${bt.bottomTercileReturnPct}%` : "—"}
          sub={bt ? "weakest signal" : ""}
        />
        <Stat label="Demand↔price ρ" value={analysis.demandPriceSpearman.toFixed(2)} sub="rank correlation" />
      </div>

      {analysis.picks.length === 0 ? (
        <div className="rounded-xl border border-ink-700 bg-ink-850 px-4 py-10 text-center text-sm text-slate-400">
          {analysis.failed ? (
            <>
              <p className="font-semibold text-white">The analysis failed to load</p>
              <p className="mt-1">A loader threw; the error is in the function logs. The failure is not cached — the next attempt runs within about five minutes.</p>
            </>
          ) : analysis.withAnyHistory === 0 ? (
            <>
              <p className="font-semibold text-white">No price history in {isGlobal ? "any market" : scope} yet</p>
              <p className="mt-1">
                Nothing has been recorded for these cards. Check that the price import is running and publishing
                history/rising.json to the data branch.
              </p>
            </>
          ) : (
            <>
              {/* The state this page was previously mis-describing: the importer IS
                  working, there just aren't enough DAYS yet. Say exactly how far
                  off it is instead of implying a broken pipeline. */}
              <p className="font-semibold text-white">
                Price history is building — {analysis.deepestSeries} of {analysis.minPointsRequired} weekly points
              </p>
              <p className="mx-auto mt-1 max-w-xl">
                {analysis.withAnyHistory.toLocaleString()} cards already have price history in{" "}
                {isGlobal ? "at least one market" : scope}, but price signals need {analysis.minPointsRequired} clean weekly
                points per card (today&apos;s live price counts as one) and the deepest series so far is {analysis.deepestSeries}.
                The importer is recording normally; signals switch on by themselves in about{" "}
                {Math.max(1, analysis.minPointsRequired - analysis.deepestSeries)}{" "}
                {Math.max(1, analysis.minPointsRequired - analysis.deepestSeries) === 1 ? "week" : "weeks"}.
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink-700 bg-ink-850">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-medium">#</th>
                {moves && (
                  <th className="px-1 py-2 font-medium" title="Place against the ranking 7 days ago">
                    Move
                  </th>
                )}
                <th className="px-3 py-2 font-medium">Card</th>
                <th className="px-3 py-2 text-right font-medium">Score</th>
                <th className="px-3 py-2 font-medium">Signal breakdown</th>
                <th className="px-3 py-2 text-right font-medium">Price{isGlobal ? "" : ` (${currencyOf(scope)})`}</th>
                <th className="px-3 py-2 text-right font-medium">vs last week</th>
                <th className="px-3 py-2 text-right font-medium">In range</th>
                <th className="px-3 py-2 text-right font-medium">Searches</th>
                <th className="px-3 py-2 text-right font-medium">/day</th>
                <th className="px-3 py-2 text-right font-medium">Stores</th>
                <th className="px-3 py-2">16 wk</th>
                <th className="px-3 py-2 text-right font-medium">Conf.</th>
              </tr>
            </thead>
            <tbody>
              {analysis.picks.map((p: RisePick, i) => (
                <tr key={p.id} className="border-b border-ink-800 last:border-0 hover:bg-ink-800/60">
                  <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                  {moves && (
                    <td className="px-1 py-2">
                      <MoveBadge move={moves.get(p.id)} newTitle="Not ranked 7 days ago" />
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <Link href={`/card/${p.slug}`} className="flex items-center gap-2.5">
                      {p.imageThumbUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageThumbUrl} alt={`${p.displayName} ${p.collectorNumber} card`} width={26} height={36} loading="lazy" decoding="async" className="h-9 w-[26px] shrink-0 rounded-sm object-cover" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-white hover:text-brand-400">{p.displayName}</span>
                        <span className="block text-[11px] text-slate-500">{p.setCode} · {p.collectorNumber}{p.overheated ? " · ⚠ hot" : ""}</span>
                        <span className="block text-[11px] text-slate-400">{p.reason}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="num text-base font-extrabold text-brand-300">{p.score}</span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {COMPONENTS.map((c) => (
                        <span key={c.key} className="flex items-center gap-1.5" title={`${c.label}: z=${p.components[c.key]}`}>
                          <span className="w-[52px] text-[10px] uppercase tracking-wide text-slate-500">{c.label}</span>
                          <ZBar z={p.components[c.key]} />
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right num tabular-nums text-slate-200">{p.priceCents != null ? formatMoney(p.priceCents, p.currency) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums"><Pct v={p.vsLastWeekPct} /></td>
                  <td className="px-3 py-2 text-right num tabular-nums text-slate-300">{p.priceSignals ? `${Math.round(p.posPct * 100)}%` : "—"}</td>
                  <td className="px-3 py-2 text-right num tabular-nums text-slate-300">{p.searchCount.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {p.searchPerDay != null ? <span className={`num ${p.searchPerDay > 0 ? "text-up" : "text-slate-400"}`}>{p.searchPerDay > 0 ? "+" : ""}{p.searchPerDay}</span> : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right num tabular-nums text-slate-300">{p.listings}</td>
                  <td className="px-3 py-2"><Spark values={p.spark} /></td>
                  <td className="px-3 py-2 text-right">
                    <span className={`chip ${p.confidence === "High" ? "bg-brand-500/15 text-brand-300" : p.confidence === "Medium" ? "bg-gold/15 text-gold" : "bg-ink-800 text-slate-400"}`}>{p.confidence}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Methodology + honest limitations */}
      <section className="mt-8 rounded-xl border border-ink-800 bg-ink-900/40 p-5 text-sm leading-relaxed text-slate-400">
        <h2 className="text-base font-bold text-white">How the score works</h2>
        <p className="mt-2">
          For the {analysis.universeSize} most‑searched priced cards, each of six signals is turned into a
          cross‑sectional z‑score and combined into a weighted sum, then shown as a 0–100 percentile. The
          three price‑timing signals (room, momentum, volatility) are z‑scored only among the{" "}
          {analysis.qualifying} with ≥{analysis.minPointsRequired} clean weekly points; every other card gets a
          neutral 0 for them:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><strong className="text-slate-300">Demand</strong> — search volume (log). The purest attention signal.</li>
          <li><strong className="text-slate-300">Velocity</strong> — extra searches/day from daily demand snapshots. The leading indicator; <em>0 for everyone until ~3+ snapshot days accrue</em> ({analysis.velocityActive ? "active now" : `warming up — ${analysis.snapshotDays} days so far`}).</li>
          <li><strong className="text-slate-300">Room to run</strong> — how near the card sits to its own range low (1 − position‑in‑range), over weekly TCGplayer market prices. 0 for cards without {analysis.minPointsRequired} such points, as are momentum and volatility.</li>
          <li><strong className="text-slate-300">Scarcity</strong> — few in‑stock listings, so demand bites harder.</li>
          <li><strong className="text-slate-300">Momentum</strong> — today&apos;s price vs last week, capped so already‑spiked cards (⚠ hot, &gt;{35}% on last week) are penalised, not rewarded.</li>
          <li><strong className="text-slate-300">Volatility</strong> — week‑to‑week movement (a small &ldquo;will it move&rdquo; tilt).</li>
        </ul>
        <h2 className="mt-4 text-base font-bold text-white">Validation &amp; limits</h2>
        <p className="mt-2">
          {bt ? (
            <>
              Backtest (no forward leakage) on {bt.n} cards: the &ldquo;room to run&rdquo; signal measured {bt.lagDays} days
              ago has a rank correlation of <strong className="text-slate-300">ρ={bt.spearman}</strong> with the
              realised {bt.lagDays}‑day forward return; the strongest‑signal third returned{" "}
              <strong className="text-slate-300">{bt.topTercileReturnPct > 0 ? "+" : ""}{bt.topTercileReturnPct}%</strong> vs a
              median of {bt.medianReturnPct > 0 ? "+" : ""}{bt.medianReturnPct}%. The historical signal uses only price data
              up to T−{bt.lagDays}d, but two caveats <strong className="text-slate-300">bias the returns upward</strong>: the
              cohort is today&apos;s top‑searched, still‑priced cards (so cards that have since delisted or faded are excluded —
              survivorship), and only the price‑timing component is backtestable (demand isn&apos;t historically
              reconstructable). Read ρ and the tercile spread as <em>directional evidence the signal has some edge</em>, not a
              track record.
            </>
          ) : (
            <>The backtest needs more price history than exists yet ({analysis.qualifying} cards qualify; ≥{20} with a {14}‑day window are required). It activates automatically as the price history accrues.</>
          )}{" "}
          Thin history ⇒ lower confidence. This is a heuristic screen of public price/demand data, not
          financial advice. Generated {new Date(analysis.generatedAt).toISOString().slice(0, 16).replace("T", " ")} UTC.
        </p>
      </section>
    </div>
  );
}
