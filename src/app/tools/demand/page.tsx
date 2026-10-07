import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { isPremium, tierOf } from "@/lib/premium";
import { getTopDemand, type DemandPick } from "@/lib/data";
import {
  DEMAND_WINDOWS,
  FREE_DEMAND_ROWS,
  PREMIUM_DEMAND_ROWS,
  demandQueryFor,
  parseDemandList,
  parseDemandWindow,
  visibleDemandRows,
  type DemandAccess,
  type DemandList,
} from "@/lib/demand-view";
import { getCountry } from "@/lib/get-country";
import { type Country } from "@/lib/country";
import { money } from "@/lib/format";
import { cardImage } from "@/lib/images";
import { cardDisplayName } from "@/lib/rise-predictor";
import { SITE_URL } from "@/lib/site";
import { pageOg } from "@/lib/og/meta";
import PlanButton from "@/components/PlanButton";
import { HubIntro } from "@/components/HubIntro";
import { RelatedGuides } from "@/components/RelatedGuides";
import { guidesForTool } from "@/lib/content/tool-guides";
import { MoveBadge } from "@/components/MoveBadge";

// Demand Finder (RiftCompare's /tools/demand, for One Piece). Reads the
// viewer's session, so it renders per request. The ranking itself is one
// self-cached, day-keyed loader (lib/data.ts getTopDemand, over the demand
// snapshot files on the data branch), called here at the top level, never
// inside another cache.
export const dynamic = "force-dynamic";

// Demand Finder is Premium (RiftCompare, 2026-09-25). It describes what
// players are searching for and looking at — no "what to buy", prediction or
// investing language.
const TITLE = "Demand Finder — Most Searched & Viewed One Piece Cards | OP Compare";
const DESCRIPTION = `The One Piece Card Game cards players are searching for and opening on OP Compare, over the last 7 or 30 days. The top ${FREE_DEMAND_ROWS} most searched this week are free; Premium shows the top ${PREMIUM_DEMAND_ROWS} by searches and by card views.`;
export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: ["one piece most searched cards", "one piece popular cards", "one piece most viewed cards", "one piece card demand"],
  alternates: { canonical: "/tools/demand" },
  openGraph: pageOg("/tools/demand", { title: "Demand Finder — most searched & viewed One Piece cards", description: DESCRIPTION }),
};

const DEMAND_FAQS = [
  {
    q: "What is Demand Finder?",
    a: "A leaderboard of the One Piece cards OP Compare visitors are searching for and opening, counted from real traffic. Searches count a card picked from the search box; views count a card page opened. It is raw attention, not a score.",
  },
  {
    q: "What is free, and what needs Premium?",
    a: `Everyone sees the top ${FREE_DEMAND_ROWS} most searched cards of the last 7 days, here and on the price movers page. Premium shows the top ${PREMIUM_DEMAND_ROWS} by searches and the top ${PREMIUM_DEMAND_ROWS} by card views, over the last 7 or 30 days, with both counts for every card.`,
  },
  {
    q: "How are searches and views counted?",
    a: "Each browser counts a card once a day, bots and scripts are not counted, and the server limits how often one address can count a card, so one visitor refreshing a page cannot move a card up the list. Counts are worldwide, not per market.",
  },
  {
    q: "What do the 7-day and 30-day windows mean?",
    a: "The counters are running totals, so a window is measured against a daily snapshot taken that many days ago: the activity since then. If the snapshots don't reach back that far yet, the page says so instead of showing a shorter window under the longer label. The daily snapshots are published with OP Compare's price history.",
  },
  {
    q: "How is this different from Rising Cards?",
    a: "Rising Cards blends demand with where a card's price sits in its own range and how many stores have it, and marks down cards that have already jumped. Demand Finder is the plain count of searches and views, with nothing blended in. Neither one says where a price will go.",
  },
];

const LIST_LABEL: Record<DemandList, string> = { searched: "Most searched", viewed: "Most viewed" };

function DemandRow({
  p,
  rank,
  list,
  showViews,
  showMove,
  country,
}: {
  p: DemandPick;
  rank: number;
  list: DemandList;
  showViews: boolean;
  showMove: boolean;
  country: Country;
}) {
  const price = p.card.low[country];
  return (
    <tr className="hover:bg-ink-800">
      <td className="num px-3 py-2 text-slate-500">{rank}</td>
      {showMove && (
        <td className="px-1 py-2">
          <MoveBadge move={p.move} newTitle={`No ${list === "viewed" ? "views" : "searches"} in the previous period`} />
        </td>
      )}
      <td className="px-3 py-2">
        <Link href={`/card/${p.card.slug}`} prefetch={false} className="flex items-center gap-2.5">
          <span className="h-10 w-7 shrink-0 overflow-hidden rounded-sm bg-ink-900">
            {p.card.hasImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cardImage.thumb(p.card.id)} alt={`${p.card.name}${p.card.number ? ` ${p.card.number}` : ""} card`} width={28} height={39} loading="lazy" decoding="async" className="h-full w-full object-cover" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block max-w-[10rem] truncate font-semibold text-white sm:max-w-none">{cardDisplayName(p.card.name, p.card)}</span>
            <span className="block text-[11px] text-slate-500">{p.card.setCode} · {p.card.number}</span>
          </span>
        </Link>
      </td>
      <td className={`num px-2 py-2 text-right ${list === "searched" ? "font-extrabold text-brand-300" : "text-slate-400"}`}>
        {p.searches.toLocaleString("en-US")}
      </td>
      {showViews && (
        <td className={`num px-2 py-2 text-right ${list === "viewed" ? "font-extrabold text-brand-300" : "text-slate-400"}`}>
          {p.views.toLocaleString("en-US")}
        </td>
      )}
      <td className="num whitespace-nowrap px-3 py-2 text-right text-slate-200">
        {price != null ? money(price, country) : <span className="text-xs text-slate-500">No price here</span>}
      </td>
    </tr>
  );
}

export default async function DemandFinderPage({ searchParams }: { searchParams: { view?: string; range?: string } }) {
  const user = await getCurrentUser();
  // THE GATE: Premium only (never the Plus default of isPremium).
  const premium = isPremium(user, "premium");
  const access: DemandAccess = premium ? "full" : "free";
  const tier = tierOf(user);
  const country = getCountry();

  // Below Premium the window and list are fixed to the /movers strip's (7 days,
  // most searched), whatever the query string says, and the loader is asked
  // for FREE_DEMAND_ROWS rows only — lib/demand-view.ts.
  const days = access === "full" ? parseDemandWindow(searchParams.range) : 7;
  const list: DemandList = access === "full" ? parseDemandList(searchParams.view) : "searched";
  const query = demandQueryFor(access, days);
  const result = await getTopDemand(query.days, query.limit);
  const rows = visibleDemandRows(result, access, list);
  const showViews = access === "full";
  const covered = result.coveredDays && result.coveredDays > 0 ? result.coveredDays : days;
  // Rank movement against the equal-length period before the window, when the
  // daily snapshots reach back that far (lib/demand.ts, 2026-09-28).
  const previous = result.previous ?? null;
  const showMove = !!previous;
  const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <Link href="/tools" className="hover:text-slate-300">Tools</Link>
          <span>/</span>
          <span className="text-slate-300">Demand Finder</span>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">Demand Finder</h1>
          {access === "full" && (
            <div className="flex gap-1 rounded-lg border border-ink-700 bg-ink-900 p-1">
              {DEMAND_WINDOWS.map((d) => (
                <Link
                  key={d}
                  href={`/tools/demand?view=${list}&range=${d}`}
                  aria-current={d === days ? "page" : undefined}
                  className={`rounded-md px-2.5 py-1 text-sm ${d === days ? "bg-brand-500 font-medium text-white" : "text-slate-400 hover:text-white"}`}
                >
                  {d} days
                </Link>
              ))}
            </div>
          )}
        </div>
        {/* What is counted, how, and over which window (2026-09-26, "Blog and
            tools, joined up"): lib/content/hub-intros.ts, in place of a
            one-paragraph lede. Above the Premium split, for every visitor. */}
        <HubIntro path="/tools/demand" />
        {access === "full" && (
          <div className="mt-3 flex gap-1 rounded-lg border border-ink-700 bg-ink-900 p-1 sm:inline-flex">
            {(["searched", "viewed"] as const).map((l) => (
              <Link
                key={l}
                href={`/tools/demand?view=${l}&range=${days}`}
                aria-current={l === list ? "page" : undefined}
                className={`flex-1 rounded-md px-3 py-1.5 text-center text-sm sm:flex-none sm:px-4 ${
                  l === list ? "bg-brand-500 font-medium text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                {LIST_LABEL[l]}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ORDER MATTERS: a failed read and a window the snapshots don't reach
          are said plainly before anything else, for every viewer. Below
          Premium the table holds exactly the /movers strip's rows (top
          FREE_DEMAND_ROWS most searched over 7 days, searches only). */}
      {result.failed ? (
        <div className="card-surface grid place-items-center p-12 text-center text-sm text-slate-400">
          <div>
            <p className="font-semibold text-white">Demand Finder is temporarily unavailable</p>
            <p className="mx-auto mt-1 max-w-lg">We couldn&apos;t load the latest counts. Try again in a few minutes.</p>
          </div>
        </div>
      ) : !result.windowUsable ? (
        <div className="card-surface grid place-items-center p-12 text-center text-sm text-slate-400">
          <div>
            <p className="font-semibold text-white">Not enough history for a {days}-day window yet</p>
            <p className="mx-auto mt-1 max-w-lg">
              Counts are measured against a daily snapshot, and the snapshots don&apos;t reach back {days} days yet.
              {access === "full" && days !== 7 ? " Try the 7-day window." : " Check back after the next update."}
            </p>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="card-surface grid place-items-center p-12 text-center text-sm text-slate-400">
          No {list === "viewed" ? "card views" : "searches"} in this window yet. Check back soon.
        </div>
      ) : (
        <div className="card-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-left text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5 font-semibold">#</th>
                {showMove && (
                  <th className="px-1 py-2.5 font-semibold" title="Rank movement against the previous period">
                    Move
                  </th>
                )}
                <th className="px-3 py-2.5 font-semibold">Card</th>
                <th className="px-2 py-2.5 text-right font-semibold">Searches</th>
                {showViews && <th className="px-2 py-2.5 text-right font-semibold">Views</th>}
                <th className="px-3 py-2.5 text-right font-semibold">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {rows.map((p, i) => (
                <DemandRow key={p.card.id} p={p} rank={i + 1} list={list} showViews={showViews} showMove={showMove} country={country} />
              ))}
            </tbody>
          </table>
          <p className="p-3 text-[11px] leading-relaxed text-slate-600">
            {showViews ? "Searches and views" : "Searches"} in the last {covered} {covered === 1 ? "day" : "days"}. What
            players are looking at, not a price forecast. Check a card&apos;s own price history before you buy.
            {previous ? (
              <>
                {" "}
                <span className="text-emerald-400">▲</span>/<span className="text-rose-400">▼</span> compare each card&apos;s
                place with the {previous.coveredDays} days before ({dayFmt.format(new Date(previous.startDay))} to{" "}
                {dayFmt.format(new Date(previous.endDay))}); <span className="font-semibold text-amber-300">NEW</span> means
                none in that period.
              </>
            ) : (
              " Rank movement appears once the daily snapshots reach back two windows."
            )}
          </p>
        </div>
      )}

      {access === "free" && !result.failed && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold/30 bg-gold/5 px-4 py-3">
          <p className="text-sm text-slate-300">
            {tier === "plus" ? (
              <>
                <strong className="text-white">Demand Finder is part of Premium.</strong> Your Plus plan includes the free top{" "}
                {FREE_DEMAND_ROWS}; Premium adds the top {PREMIUM_DEMAND_ROWS} by searches and by card views, over 7 or 30 days.
              </>
            ) : (
              <>
                <strong className="text-white">The top {FREE_DEMAND_ROWS} most searched this week are free.</strong> Premium shows
                the top {PREMIUM_DEMAND_ROWS} by searches and by card views, over 7 or 30 days.
              </>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {user ? (
              <PlanButton surface="gate:demand" tier="premium" />
            ) : (
              <Link href="/login?next=/tools/demand&src=tool_gate" rel="nofollow" className="btn-primary text-sm">Sign in</Link>
            )}
            <Link href="/movers#most-searched" className="btn-ghost text-sm">Free on price movers →</Link>
          </div>
        </div>
      )}

      {/* The guides behind the counts, after the table and outside the Premium
          split, so every visitor gets them. */}
      <RelatedGuides guides={guidesForTool("/tools/demand")} className="card-surface mt-8 p-5" />

      <section className="mt-10">
        <h2 className="mb-3 text-xl font-extrabold text-white">How Demand Finder works</h2>
        <div className="card-surface divide-y divide-ink-800">
          {DEMAND_FAQS.map((f) => (
            <div key={f.q} className="px-5 py-4">
              <h3 className="font-bold text-white">{f.q}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* No `offers` on the WebApplication: a price "0" would misstate a tool
          whose full lists are paid (the same fix Rising Cards got on 2026-09-25). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: DEMAND_FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            },
            {
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
                { "@type": "ListItem", position: 2, name: "Tools", item: `${SITE_URL}/tools` },
                { "@type": "ListItem", position: 3, name: "Demand Finder", item: `${SITE_URL}/tools/demand` },
              ],
            },
            {
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "One Piece Demand Finder",
              url: `${SITE_URL}/tools/demand`,
              applicationCategory: "UtilitiesApplication",
              operatingSystem: "Web",
              description: "A leaderboard of the One Piece Card Game cards most searched and most viewed on OP Compare over the last 7 or 30 days.",
            },
          ]),
        }}
      />
    </div>
  );
}
