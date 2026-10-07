import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";
import { getCachedRisingCards, getRisingWeekAgo } from "@/lib/data";
import { parseRiseScope, growthSpanLabel, MARKET_PREF, type RisePick, type RiseScope } from "@/lib/rise-predictor";
import { movementAgainst, weekAgoLabel } from "@/lib/rising-movement";
import type { Movement } from "@/lib/demand-movement";
import { MoveBadge } from "@/components/MoveBadge";
import { formatMoney } from "@/lib/format-currency";
import { currencyOf, COUNTRIES, COUNTRY_LIST } from "@/lib/country";
import { getCountry } from "@/lib/get-country";
import PlanButton from "@/components/PlanButton";
import { HubIntro } from "@/components/HubIntro";
import { RelatedGuides } from "@/components/RelatedGuides";
import { guidesForTool } from "@/lib/content/tool-guides";
import { SITE_URL } from "@/lib/site";
import { planPrice } from "@/lib/plans";
import { pageOg } from "@/lib/og/meta";
import { FREE_RISING_ROWS } from "@/lib/tier-limits";

export const dynamic = "force-dynamic";

// Rising Cards (RiftCompare's /tools/rising, for One Piece). No
// "backtested"/"validated" claim and no investing or price-prediction
// keywords: no track record is on the page, and the site's position is buying
// well, not speculating.
const TITLE = "Rising Cards — One Piece Cards With Rising Demand | OP Compare";
const DESCRIPTION =
  "One Piece Card Game cards ranked by demand and price-timing signals: search interest that is high or rising on cards whose price hasn't moved up yet, with the reason for every pick. Free accounts see the top three; Premium shows every pick. Not financial advice.";
export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: ["one piece rising cards", "one piece card demand", "one piece cards going up", "one piece trending cards"],
  alternates: { canonical: "/tools/rising" },
  openGraph: pageOg("/tools/rising", { title: "Rising Cards — One Piece cards with rising demand", description: DESCRIPTION }),
};

// How many ranked picks a signed-in FREE account sees (lib/tier-limits.ts).
// Premium sees all of them (Plus no longer does: owner, 2026-10-07).
const FREE_PREVIEW_ROWS = FREE_RISING_ROWS;

const RISING_FAQS = [
  {
    q: "What is Rising Cards?",
    a: "A screener that ranks One Piece Card Game cards by demand and price-timing signals: search interest that is high or rising on cards whose price hasn't moved up yet (low in their own recent range, few stores with it in stock, not already spiking). Every input is real OP Compare data, and every pick shows the plain reason it ranks where it does.",
  },
  {
    q: "What signals does the ranking use?",
    a: "How often a card is picked from OP Compare search and whether that is rising, where today's TCGplayer market price sits in the card's own recent range, how many tracked stores have it in stock, and how its price compares with last week. Cards already up sharply on last week are marked down, not rewarded. A card with too few weekly prices is ranked on demand and supply alone.",
  },
  {
    q: "Is this financial advice?",
    a: "No. It is a screen of public price and demand data, not a prediction, and no track record is published yet. Use it as a starting point and check a card's full price history before you buy.",
  },
  {
    q: "Do I need Premium?",
    a: `Not to start. A free account shows the top ${FREE_PREVIEW_ROWS} ranked picks with their reasons. Premium (${planPrice("premium", "month")}/month) shows every ranked pick, in every market or Global.`,
  },
  {
    q: "How often does it update?",
    a: "Demand and stock update with every price import; the price signals read one price a week. Demand velocity needs a few days of daily demand snapshots before it counts for a card — until then the ranking leans on overall search volume.",
  },
];

// Compact server-rendered sparkline (no client JS) from a cents series.
function Spark({ values, w = 88, h = 26 }: { values: number[]; w?: number; h?: number }) {
  if (values.length < 2) return <span className="text-slate-600">—</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / span) * (h - 4) - 2).toFixed(1)}`);
  const up = values[values.length - 1] >= values[0];
  // Coloured through currentColor from the themed text-brand-400 / text-rose-400
  // tokens (2026-09-23), the same as PriceChart's Sparkline: the old literal
  // #34d17e / #fb7185 were the dark theme's values and measured ~2:1 on the light
  // theme's white rows. Dark is pixel-identical (brand-400 and rose-400 resolve
  // to exactly those two hexes there).
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" className={up ? "text-brand-400" : "text-rose-400"}>
      <polyline points={pts.join(" ")} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Pct({ v }: { v: number | null }) {
  if (v == null) return <span className="text-slate-600">—</span>;
  const tone = v > 0 ? "text-up" : v < 0 ? "text-down" : "text-slate-400";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return <span className={`num ${tone}`}>{sign}{Math.abs(v).toFixed(1)}%</span>;
}

// Where today's price sits in the card's own recent range, as a labelled bar:
// the plain replacement for the unlabelled z-score bars (2026-09-25).
function RangePosition({ p }: { p: RisePick }) {
  if (!p.priceSignals) return <span className="text-[11px] text-slate-600" title="Not enough weekly prices yet">—</span>;
  const pct = Math.round(p.posPct * 100);
  return (
    <span className="flex flex-col items-end gap-1" title={`${pct}% of the way from its ${p.rangeWeeks}-week low to its high`}>
      <span className="relative block h-1.5 w-16 rounded-full bg-ink-800">
        <span className="absolute top-1/2 h-2.5 w-1 -translate-y-1/2 rounded-sm bg-brand-400" style={{ left: `calc(${pct}% - 2px)` }} />
      </span>
      <span className="num text-[11px] text-slate-400">{pct <= 25 ? "near low" : pct >= 75 ? "near high" : `${pct}%`}</span>
    </span>
  );
}

function Searches({ p }: { p: RisePick }) {
  if (p.searchPerDay == null) return <span className="text-slate-600">—</span>;
  return (
    <span className="flex flex-col items-end">
      <span className="num text-slate-200">{p.searchPerDay >= 10 ? Math.round(p.searchPerDay) : p.searchPerDay.toFixed(1)}</span>
      {/* Growth over the span the card's demand snapshots really cover (it
          said "/ 3 wk" for every card, including ones first snapshotted days
          ago); null below a week, where a percentage is noise. */}
      {p.searchGrowthPct != null && p.searchGrowthDays != null && (
        <span className={`num text-[11px] ${p.searchGrowthPct > 0 ? "text-up" : "text-slate-500"}`}>
          {p.searchGrowthPct > 0 ? "+" : ""}{Math.round(p.searchGrowthPct)}% in {growthSpanLabel(p.searchGrowthDays, true)}
        </span>
      )}
    </span>
  );
}

function ConfidenceChip({ c }: { c: RisePick["confidence"] }) {
  return (
    <span className={`chip ${c === "High" ? "bg-brand-500/15 text-brand-300" : c === "Medium" ? "bg-gold/15 text-gold" : "bg-ink-800 text-slate-400"}`}>
      {c}
    </span>
  );
}

function CardCell({ p }: { p: RisePick }) {
  return (
    <Link href={`/card/${p.slug}`} prefetch={false} className="flex items-start gap-2.5">
      {p.imageThumbUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.imageThumbUrl} alt={`${p.displayName} ${p.collectorNumber} card`} width={28} height={39} loading="lazy" decoding="async" className="h-10 w-7 shrink-0 rounded-sm object-cover" />
      )}
      <span className="min-w-0">
        <span className="block truncate font-semibold text-white">{p.displayName}</span>
        <span className="block text-[11px] text-slate-500">{p.setCode} · {p.collectorNumber}{p.overheated ? " · ⚠ hot" : ""}</span>
        {/* The one-line reason: visible at every width, and the only signal
            summary a phone gets (the signal columns are hidden below sm). */}
        <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">{p.reason}</span>
      </span>
    </Link>
  );
}

// Every price renders in ITS OWN currency (p.currency). Global mixes each
// card's basis-market price, and until 2026-09-25 this table printed all of
// them under one "A$" — a US$10.00 card read as A$10.00.
function RisingRow({ p, rank, move }: { p: RisePick; rank: number; move: Movement | null | undefined }) {
  return (
    <tr className="align-top hover:bg-ink-800">
      <td className="px-3 py-2 text-slate-500">{rank}</td>
      {move !== undefined && (
        <td className="px-1 py-2">
          <MoveBadge move={move} newTitle="Not ranked 7 days ago" />
        </td>
      )}
      <td className="px-3 py-2">
        <CardCell p={p} />
      </td>
      <td className="num whitespace-nowrap px-2 py-2 text-right text-slate-200">{p.priceCents != null ? formatMoney(p.priceCents, p.currency) : "—"}</td>
      <td className="px-2 py-2 text-right"><Pct v={p.vsLastWeekPct} /></td>
      <td className="hidden px-2 py-2 text-right sm:table-cell"><RangePosition p={p} /></td>
      <td className="hidden px-2 py-2 text-right sm:table-cell"><Searches p={p} /></td>
      <td className="num hidden px-2 py-2 text-right text-slate-300 sm:table-cell">{p.listings}</td>
      <td className="hidden px-2 py-2 md:table-cell"><Spark values={p.spark} /></td>
      <td className="hidden px-3 py-2 text-right sm:table-cell"><ConfidenceChip c={p.confidence} /></td>
    </tr>
  );
}

function TableHead({ priceLabel, showMove }: { priceLabel: string; showMove: boolean }) {
  return (
    <thead>
      <tr className="border-b border-ink-700 text-left text-[10px] uppercase tracking-wide text-slate-500">
        <th className="px-3 py-2.5 font-semibold">#</th>
        {showMove && (
          <th className="px-1 py-2.5 font-semibold" title="Place against the ranking 7 days ago">
            Move
          </th>
        )}
        <th className="px-3 py-2.5 font-semibold">Card · why it ranks</th>
        <th className="px-2 py-2.5 text-right font-semibold">{priceLabel}</th>
        <th className="px-2 py-2.5 text-right font-semibold">vs last week</th>
        <th className="hidden px-2 py-2.5 text-right font-semibold sm:table-cell">In its range</th>
        <th className="hidden px-2 py-2.5 text-right font-semibold sm:table-cell">Searches/day</th>
        <th className="hidden px-2 py-2.5 text-right font-semibold sm:table-cell">Stores</th>
        <th className="hidden px-2 py-2.5 font-semibold md:table-cell">16 wk</th>
        <th className="hidden px-3 py-2.5 text-right font-semibold sm:table-cell">Conf.</th>
      </tr>
    </thead>
  );
}

export default async function RisingPage({ searchParams }: { searchParams: { scope?: string } }) {
  const user = await getCurrentUser();
  // PREMIUM ONLY (owner, 2026-10-07): Plus no longer unlocks the full list.
  const premium = isPremium(user, "premium");
  // THREE LEVELS (RiftCompare, 2026-09-23). Premium sees every pick; a
  // signed-in FREE or Plus account sees the top FREE_PREVIEW_ROWS; signed out sees no
  // pick, only the ask for a free account. The slice happens HERE, on the
  // server: only the rows a visitor is entitled to are rendered, and nothing
  // below passes `analysis` to a client component, so the rest of the ranking
  // never reaches the HTML or the RSC payload.
  const access: "full" | "top3" | "none" = premium ? "full" : user ? "top3" : "none";
  const country = getCountry();

  // The visitor's own market by default (2026-09-25; it was Global priced in
  // AUD for everyone, and the homepage column it links from is per-market).
  // Members can switch to any market or Global; every COUNTRY_LIST code parses
  // (SG, CA and EU used to fall back to Global silently). A free account's
  // top three stay in its own market.
  const scope: RiseScope = access === "full" ? parseRiseScope(searchParams.scope, country) : country;
  const isGlobal = scope === "GLOBAL";
  const where = isGlobal ? "" : ` in ${COUNTRIES[scope].place}`;
  const priceLabel = isGlobal ? "Price" : `Price (${currencyOf(scope)})`;

  // Self-caching loaders and an in-process assembly (lib/data.ts
  // getCachedRisingCards over lib/rise-predictor.ts). Shared with /admin/rising
  // and the snapshot mint, so any of them warms the rest. The ranking rebuilt
  // as of a week ago gives the movement; none → no movement column.
  const [analysis, weekAgo] = await Promise.all([getCachedRisingCards(scope), getRisingWeekAgo(scope)]);
  const moves = movementAgainst(analysis.picks.map((p) => p.id), weekAgo);
  const visible = access === "full" ? analysis.picks : access === "top3" ? analysis.picks.slice(0, FREE_PREVIEW_ROWS) : [];
  const hiddenCount = Math.min(40, analysis.picks.length) - visible.length;
  const rebuilding = analysis.picks.length > 0 && analysis.qualifying === 0;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <Link href="/tools" className="hover:text-slate-300">Tools</Link>
          <span>/</span>
          <span className="text-slate-300">Rising Cards</span>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">Rising Cards</h1>
          {access === "full" && (
            <div className="flex flex-wrap gap-1 rounded-lg border border-ink-700 bg-ink-900 p-1">
              {[{ code: "GLOBAL" as RiseScope, flag: "🌐", label: "Global" }, ...COUNTRY_LIST.map((c) => ({ code: c.code as RiseScope, flag: c.flag, label: c.code }))].map((opt) => {
                const active = opt.code === scope;
                return (
                  <Link
                    key={opt.code}
                    href={`/tools/rising?scope=${opt.code === "GLOBAL" ? "global" : opt.code}`}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-md px-2.5 py-1 text-sm ${active ? "bg-brand-500 font-medium text-white" : "text-slate-400 hover:text-white"}`}
                  >
                    {opt.flag} {opt.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
        {/* The four signals and their cadence, above the access split so a
            signed-out visitor and a crawler get them (2026-09-26, "Blog and
            tools, joined up"): lib/content/hub-intros.ts, in place of a
            one-paragraph lede. */}
        <HubIntro path="/tools/rising" />
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-500">
          Not financial advice. Looking for boxes and packs instead?{" "}
          <Link href="/sealed" className="text-brand-400 hover:underline">See sealed prices →</Link>
        </p>
      </div>

      {/* ORDER MATTERS: the empty states below are checked FIRST, so a free
          visitor on a scope with no ranked picks is told the truth rather than
          shown a locked preview of a list that does not exist.

          SIGNED OUT, NOTHING REAL IS RENDERED; A FREE ACCOUNT GETS THE TOP
          FREE_PREVIEW_ROWS (see `access` above). The page keeps its intro, its
          "How Rising Cards works" FAQ and its FAQPage schema either way, which
          is what keeps it from being a thin page when gated. */}
      {analysis.picks.length === 0 ? (
        <div className="card-surface grid place-items-center p-12 text-center text-sm text-slate-400">
          {analysis.failed ? (
            // A failed load is never presented as "no history yet" (it was, for
            // up to a day, while a failure sat in the cache as an empty result).
            <div>
              <p className="font-semibold text-white">Rising Cards is temporarily unavailable</p>
              <p className="mx-auto mt-1 max-w-lg">We couldn&apos;t load the latest data. Try again in a few minutes.</p>
            </div>
          ) : analysis.withAnyHistory > 0 ? (
            <div>
              <p className="font-semibold text-white">Signals are still building</p>
              <p className="mx-auto mt-1 max-w-lg">
                We track {analysis.withAnyHistory.toLocaleString()} cards&apos; prices{where}, but ranking them needs{" "}
                {analysis.minPointsRequired} weekly prices per card and we have {analysis.deepestSeries} so far.
              </p>
            </div>
          ) : (
            <div>
              <p className="font-semibold text-white">No ranked cards yet{where}</p>
              <p className="mt-1">Picks appear once cards here have search activity and a live price.</p>
            </div>
          )}
        </div>
      ) : access === "none" ? (
        <div className="card-surface relative overflow-hidden">
          {/* Placeholder bars only — no pick, no card, no score. aria-hidden
              because they carry no information; the heading and CTA below are
              the real content of this state. */}
          <ul className="divide-y divide-ink-800" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <li key={i} className="flex items-center gap-2.5 px-4 py-3 opacity-40">
                <div className="h-10 w-7 shrink-0 rounded-sm bg-ink-800" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-2.5 w-2/5 rounded bg-ink-800" />
                  <div className="h-2 w-1/4 rounded bg-ink-800" />
                </div>
                <div className="h-3 w-10 rounded bg-ink-800" />
              </li>
            ))}
          </ul>
          <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-ink-900/60 via-ink-900/80 to-ink-900/95 p-4 text-center">
            <div>
              <p className="text-sm font-bold text-white">See the top {FREE_PREVIEW_ROWS} rising cards, free</p>
              <p className="mx-auto mt-0.5 max-w-sm text-xs text-slate-400">
                A free account shows the {FREE_PREVIEW_ROWS} highest-ranked picks and why each one ranks. Premium shows all{" "}
                {Math.min(40, analysis.picks.length)}, in every market or Global.
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <Link href="/login?next=/tools/rising&src=tool_preview" rel="nofollow" className="btn-primary text-sm">Create a free account</Link>
                <Link href="/movers" className="btn-ghost text-sm">Free price movers →</Link>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {rebuilding && (
            <div className="mb-3 rounded-lg border border-ink-700 bg-ink-900 px-4 py-3 text-xs leading-relaxed text-slate-400">
              <strong className="text-slate-200">Price signals are still building.</strong>{" "}
              Until a card has {analysis.minPointsRequired} weekly prices (the deepest has{" "}
              {analysis.deepestSeries} so far), it is ranked on demand and stores in stock alone, and its reason says so.
            </div>
          )}
          <div className="card-surface overflow-x-auto">
            <table className="w-full text-sm sm:min-w-[760px]">
              <TableHead priceLabel={priceLabel} showMove={!!moves} />
              <tbody className="divide-y divide-ink-800">
                {visible.map((p, i) => <RisingRow key={p.id} p={p} rank={i + 1} move={moves ? moves.get(p.id) ?? null : undefined} />)}
              </tbody>
            </table>
            <p className="p-3 text-[11px] leading-relaxed text-slate-600">
              {isGlobal
                ? `Global shows each card's price in the first market that sells it (${MARKET_PREF.join(", ")}, in that order), in that market's currency. `
                : `Price is the cheapest in-stock listing in ${COUNTRIES[scope].place}. `}
              &ldquo;vs last week&rdquo;, the range and the 16-week chart follow TCGplayer&apos;s US market price
              {isGlobal ? "" : ", converted"} — one price a week from the history OP Compare records — with today&apos;s price as the newest point. Ranked among the{" "}
              {analysis.universeSize} most-searched priced cards{where}. A research signal, not financial advice — check a card&apos;s own
              price history before you buy.
              {weekAgo && (
                <>
                  {" "}
                  <span className="text-emerald-400">▲</span>/<span className="text-rose-400">▼</span> compare each card&apos;s
                  place with its place 7 days earlier ({weekAgoLabel(weekAgo)}), ranked the same way on the demand and prices
                  of that day;{" "}
                  <span className="font-semibold text-amber-300">NEW</span> means it had no searches by then.
                </>
              )}
            </p>
          </div>
          {access === "top3" && hiddenCount > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold/30 bg-gold/5 px-4 py-3">
              <p className="text-sm text-slate-300">
                <strong className="text-white">{hiddenCount} more ranked picks</strong>
                {where} — Premium shows every one, in every market or Global.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <PlanButton tier="premium" surface="gate:rising" />
                <Link href="/movers" className="btn-ghost text-sm">Free price movers →</Link>
              </div>
            </div>
          )}
        </>
      )}

      {/* The guides behind the signals, after the list and outside the access
          split, so a signed-out visitor gets them too. */}
      <RelatedGuides guides={guidesForTool("/tools/rising")} className="card-surface mt-8 p-5" />

      <section className="mt-10">
        <h2 className="mb-3 text-xl font-extrabold text-white">How Rising Cards works</h2>
        <div className="card-surface divide-y divide-ink-800">
          {RISING_FAQS.map((f) => (
            <div key={f.q} className="px-5 py-4">
              <h3 className="font-bold text-white">{f.q}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* No `offers` on the WebApplication (2026-09-25): it said price "0" for a
          list that is paid past the top three. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: RISING_FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            },
            {
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
                { "@type": "ListItem", position: 2, name: "Tools", item: `${SITE_URL}/tools` },
                { "@type": "ListItem", position: 3, name: "Rising Cards", item: `${SITE_URL}/tools/rising` },
              ],
            },
            {
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "One Piece Rising Cards",
              url: `${SITE_URL}/tools/rising`,
              applicationCategory: "UtilitiesApplication",
              operatingSystem: "Web",
              description: "Ranks One Piece Card Game cards by demand and price-timing signals, with a plain reason for each pick.",
            },
          ]),
        }}
      />
    </div>
  );
}
