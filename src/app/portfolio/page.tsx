import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isPremium, tierOf } from "@/lib/premium";
import { getPremiumNudge, nudgeCopy } from "@/lib/premium-nudge";
import { PremiumNudgeCard } from "@/components/PremiumNudgeCard";
import { getEmailStatus } from "@/lib/data";
import { getPortfolio, PORTFOLIO_FREE, type Portfolio } from "@/lib/collection-server";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES, type Country } from "@/lib/country";
import { money } from "@/lib/format";
import { CONDITION_MULTIPLIER } from "@/lib/collection-conditions";
import { LineChart } from "@/components/LineChart";
import { MyCollection } from "@/components/MyCollection";
import { CollectionShare } from "@/components/CollectionShare";
import { HoldingsGrid } from "@/components/HoldingsGrid";
import { PortfolioReplacementCost } from "@/components/PortfolioReplacementCost";
import { PortfolioQuickAdd } from "@/components/PortfolioQuickAdd";
import { NavIcon } from "@/components/NavIcon";
import { FREE_PORTFOLIO_LIMIT } from "@/lib/free-limits";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My binder — track your Magic collection",
  robots: { index: false, follow: false }, // personal page, never indexed
};

// Every read is per-user and uncached through lib/collection-server.ts (CLAUDE.md,
// the accounts exception); cards and prices come from the published data (a binder
// row is a product in a finish, valued at that finish's TCGplayer market price) and
// the value history from the published history files (US market-price ratios per
// unit, anchored at today's total in the visitor's currency).
//
// ── Why this page stopped talking like a trading desk (2026-09-16) ───────────
// It was "My portfolio", with Profit & Loss, Invested, Return and holdings. That
// is finance vocabulary for a shoebox of cardboard, and a reader told us more
// than once that the site reads as "too greedy/capitalistic/money focused ... for
// a card GAME". Every number on this page is unchanged — what changed is that it
// now says "what you paid" and "worth now" rather than borrowing the language of
// an asset class. "Binder" is what a player calls the place they keep cards, and
// it is already the word this site's own share copy uses ("<name>'s binder", see
// app/c/[token]/opengraph-image.tsx).
//
// The ROUTE stays /portfolio: it is noindex, so nothing SEO rides on it, and
// changing it would break every bookmark for no gain. "portfolio" also stays a
// ⌘K search keyword in nav-groups.ts, so typing the old word still lands here.

function Delta({ label, pct }: { label: string; pct: number | null }) {
  if (pct == null) return null;
  const up = pct > 0;
  return (
    <div className="rounded-lg bg-ink-900 px-3 py-2 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-sm font-extrabold ${pct === 0 ? "text-slate-300" : up ? "text-brand-400" : "text-rose-400"}`}>
        {pct === 0 ? "—" : `${up ? "▲" : "▼"} ${Math.abs(pct)}%`}
      </div>
    </div>
  );
}

const pctText = (p: number | null) => (p == null ? "—" : `${p > 0 ? "+" : ""}${p}%`);
const pctClass = (p: number | null) => (p == null || p === 0 ? "text-slate-300" : p > 0 ? "text-brand-400" : "text-rose-400");

// The "Since you bought" panel: cost-basis P&L for the cards with a recorded
// price, and the portfolio's move beside the MTG Compare Index over the same windows.
function PnlView({
  pnl,
  index,
  d7,
  d30,
  country,
}: {
  pnl: NonNullable<Portfolio["pnl"]>;
  index: Portfolio["index"];
  d7: number | null;
  d30: number | null;
  country: Country;
}) {
  // 2026-09-29 (the personas pass): the panel used to say "Beating the market by
  // X%" / "Trailing the market by X%" under each window, the most flipper-sounding
  // line left in the binder. It now says what it is: the cards you recorded a price
  // for, "Since you bought", and the two plain numbers (yours, the index's) with no
  // verdict between them.
  return (
    <div className="mt-3 space-y-4">
      <div>
        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">Since you bought</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="You paid" value={money(pnl.investedCents, country)} />
          <Stat label="Worth now" value={money(pnl.valueCents, country)} />
          <Stat label="Up / down" value={`${pnl.plCents >= 0 ? "+" : "−"}${money(Math.abs(pnl.plCents), country)}`} cls={pctClass(pnl.plCents)} />
          <Stat label="Change" value={pctText(pnl.plPct)} cls={pctClass(pnl.plPct)} />
        </div>
      </div>
      {index && (index.d7 != null || index.d30 != null) && (
        <div className="rounded-lg border border-ink-700 bg-ink-900/60 p-3 text-sm">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">vs the market (MTG Compare Index)</div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { w: "7-day", port: d7, idx: index.d7 },
              { w: "30-day", port: d30, idx: index.d30 },
            ].map(({ w, port, idx }) => (
              <div key={w} className="flex flex-col">
                <span className="text-xs text-slate-500">{w}: you <span className={pctClass(port)}>{pctText(port)}</span> · index <span className={pctClass(idx)}>{pctText(idx)}</span></span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-[11px] text-slate-600">
        This covers the {pnl.costedRows} card{pnl.costedRows === 1 ? "" : "s"} you&apos;ve recorded a price for. Add a
        &quot;paid&quot; price on any card in <a href="#collection" className="text-brand-400 hover:underline">My Collection</a> to include it.
      </p>
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="rounded-lg bg-ink-900 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-base font-extrabold ${cls ?? "text-white"}`}>{value}</div>
    </div>
  );
}

export default async function PortfolioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/portfolio");

  const country = getCountry();
  const info = COUNTRIES[country];
  const portfolio = await getPortfolio(user.id, country);
  const premium = isPremium(user); // session user carries premiumUntil + isAdmin
  const tier = tierOf(user);
  // Portfolio analytics are free (PORTFOLIO_FREE); `pro` gates the
  // value-history chart, P&L panel and CSV export so re-gating is one flag.
  const pro = premium || PORTFOLIO_FREE;
  // The owned-cards Rising picks nudge (surface "nudge:portfolio"): a Premium
  // upsell for a free account, a link into the list for a member. It renders only
  // when there is something true and specific to say, and never fails the page.
  const emailOn = (await getEmailStatus()) === "on";   // environment only: it cannot fail
  let nudge: Awaited<ReturnType<typeof getPremiumNudge>> | null = null;
  try {
    nudge = await getPremiumNudge(user.id, country);
  } catch {
    nudge = null;
  }
  const ownedNudge = nudge ? nudgeCopy(nudge, "owned", premium ? "member" : "free", emailOn) : null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold text-white">
            <NavIcon name="collection" className="h-6 w-6 text-brand-400" />
            My binder
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Your cards, valued at TCGplayer&apos;s market price for the finish you hold (Normal or Foil) in {info.currency}, adjusted for condition.
            {!premium && (
              <> A free account tracks up to {FREE_PORTFOLIO_LIMIT} cards; if you already have more, you keep them all.</>
            )}{" "}
            Want to know what a set is missing?{" "}
            <Link href="/portfolio/sets" className="font-semibold text-brand-300 underline-offset-2 hover:underline">Open the set checklist</Link>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* The set tracker: what the binder is missing, per set. Free. */}
          <Link href="/portfolio/sets" className="btn-ghost text-sm">Set checklist</Link>
          {tier && (
            <span className={`chip text-xs font-bold ${tier === "plus" ? "bg-slate-500/15 text-slate-200" : "bg-gold/15 text-gold"}`}>
              ★ {tier === "plus" ? "PLUS" : "PREMIUM"}
            </span>
          )}
        </div>
      </div>

      {ownedNudge && <PremiumNudgeCard {...ownedNudge} member={premium} surface="nudge:portfolio" />}

      {/* Headline value — always shown, even before the first card is added,
          so a brand-new free account has a reason to come back. */}
      {/* overflow-hidden only once there are holdings: the zero state's quick-add
          suggestions drop below the card. */}
      <section className={`card-surface ${portfolio.holdings.length > 0 ? "overflow-hidden " : ""}bg-gradient-to-br from-brand-600/15 via-ink-850 to-gold/10 p-5`}>
        {portfolio.holdings.length > 0 ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  Collection value · {info.code} market
                </div>
                <div className="font-display text-5xl font-extrabold text-white">{money(portfolio.totalCents, country)}</div>
                <p className="mt-1 text-xs text-slate-500">
                  {portfolio.pricedCount} card{portfolio.pricedCount === 1 ? "" : "s"} with a live price
                  {portfolio.unpricedCount > 0 && <> · {portfolio.unpricedCount} awaiting a live price</>}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Delta label="7 days" pct={portfolio.d7} />
                <Delta label="30 days" pct={portfolio.d30} />
              </div>
            </div>

            {pro && (
              <div className="mt-4">
                {portfolio.series.length >= 2 ? (
                  <>
                    <LineChart
                      series={[{ label: "Your binder", color: "#a259e6", points: portfolio.series.map((p) => ({ x: new Date(p.t).toISOString().slice(0, 10), y: p.v })) }]}
                      format={(v) => money(Math.round(v), country)}
                      height={220}
                    />
                    <p className="mt-2 text-[11px] text-slate-500">
                      Your cards at each daily price snapshot (daily since 2026-10-03), each copy in its own finish. The movement comes from TCGplayer market prices (US),
                      shown in your currency and anchored at today&apos;s value. A card starts counting toward a move once it has a price at
                      both ends of a step, so a newly priced card never shows up as a gain, as on the{" "}
                      <Link href="/market" className="text-brand-400 hover:underline">MTG Compare Index</Link>.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">Your value history starts charting after the next daily snapshot.</p>
                )}
              </div>
            )}

            {pro && (
              <div className="mt-3 text-right">
                <a href="/api/portfolio/export" className="btn-ghost text-xs">⬇ Export CSV</a>
              </div>
            )}
          </>
        ) : (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Collection value · {info.code} market
            </div>
            <div className="font-display text-5xl font-extrabold text-white">{money(0, country)}</div>
            <p className="mt-1 text-sm text-slate-400">Add your first card to start valuing your collection.</p>
            <div className="mt-4 max-w-sm">
              <PortfolioQuickAdd />
            </div>
          </div>
        )}
      </section>

      {portfolio.holdings.length > 0 && (
        <>
          {/* What re-buying the collection would actually cost. Sits directly
              under the headline because it answers the question the headline
              raises. */}
          {pro && <PortfolioReplacementCost />}

          {pro && (
            <section className="card-surface p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-lg font-extrabold text-white">
                  <NavIcon name="chart" className="h-5 w-5 text-brand-400" />
                  Since you bought
                </h2>
              </div>
              {portfolio.pnl ? (
                <PnlView pnl={portfolio.pnl} index={portfolio.index} d7={portfolio.d7} d30={portfolio.d30} country={country} />
              ) : (
                <p className="mt-2 text-sm text-slate-400">
                  Record what you paid for a card (the <strong className="text-slate-200">paid</strong> field in My Collection below) and
                  how it&apos;s done since — plus how that tracks the wider market — appears here.
                </p>
              )}
            </section>
          )}

          {/* Your cards — a visual showcase, dearest first. */}
          <section>
            <div className="mb-3 flex items-end justify-between gap-2">
              <h2 className="text-lg font-extrabold text-white">Your cards</h2>
              <span className="text-xs text-slate-500">{portfolio.holdings.length} {portfolio.holdings.length === 1 ? "entry" : "entries"} · dearest first</span>
            </div>
            <HoldingsGrid holdings={portfolio.holdings} country={country} />
            <p className="mt-3 text-[11px] text-slate-600">
              Values are TCGplayer&apos;s market price for the finish you hold (a card with no market price, only a thin listing, is not valued) × the standard condition multiplier
              ({Object.entries(CONDITION_MULTIPLIER).map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(" · ")}).
              The green/red chip shows how a card has moved since you paid for it, where you&apos;ve recorded that.
            </p>
          </section>
        </>
      )}

      {/* Add & edit your collection; an edit re-renders this server page
          (debounced), so the headline and panels follow it. */}
      <MyCollection refreshPage />

      {/* Below the collection editor on purpose: sharing is something you do
          once the binder is worth showing, not the first thing you meet. */}
      <CollectionShare />
    </div>
  );
}
