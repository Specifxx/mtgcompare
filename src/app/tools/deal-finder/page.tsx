import type { Metadata } from "next";
import Link from "next/link";
import { CheapestOnEbay } from "@/components/CheapestOnEbay";
import { RegionToggle } from "@/components/RegionToggle";
import { DealPager, TcgDealTable, VsEbayTable } from "@/components/DealTable";
import { EbaySearchPanel } from "@/components/EbaySearchPanel";
import { Icon } from "@/components/Icon";
import PlanButton from "@/components/PlanButton";
import { MoreWithPlan } from "@/components/Upsell";
import { withArticle } from "@/lib/filter-chips";
import { StorePicker } from "@/components/StorePicker";
import { Breadcrumbs, JsonLd } from "@/components/ui";
import { ViewTabs } from "@/components/ViewTabs";
import { currentEntitlement } from "@/lib/auth";
import { COUNTRIES, type Country } from "@/lib/country";
import { getDealCount, getSiteStats } from "@/lib/data";
import { getCountry } from "@/lib/get-country";
import { getCheapestOnEbayDeals, getTcgDeals, getVsEbayDeals } from "@/lib/deal-pages";
import { hrefFor, parseDealFinderParams, type DealFinderParams, type DealFinderSearchParams, type MineFilter } from "@/lib/deal-finder-href";
import { DEAL_PAGE_SIZE, EBAY_FEED, dealFinderSources, defaultBuyKeys, resolveBuyKeys, type DealSort } from "@/lib/deals";
import { FREE_DEAL_ROWS } from "@/lib/tier-limits";
import { money } from "@/lib/format";
import { USD_TO } from "@/lib/fx";
import { pageOg } from "@/lib/og/meta";
import { accessFor, rowLimit, type Access } from "@/lib/premium-gates";
import { SITE_URL } from "@/lib/site";
import { MineDeals } from "./MineDeals";

export const metadata: Metadata = {
  title: "Magic: The Gathering Deal Finder — Underpriced vs TCGplayer & eBay",
  description:
    "Magic: The Gathering cards a store in your market sells for less than TCGplayer's market price, the cards whose cheapest copy is on eBay, and the cards a store sells for less than eBay. Direct links to each listing. Cheapest on eBay is free.",
  alternates: { canonical: "/tools/deal-finder" },
  openGraph: pageOg("/tools/deal-finder"),
};

export const dynamic = "force-dynamic";

// THREE VIEWS (RiftCompare's Deal Finder, ported 2026-10-03; DECISIONS.md "Deal
// Finder: RiftCompare's three views; TCGplayer is the reference, never the buy
// side"). Tabs are links (?view=, lib/deal-finder-href.ts):
//
//   tcg      "Underpriced vs TCGplayer" (default): store picker, sort, paging,
//            "Only my cards". Gated.
//   ebay     "Cheapest on eBay": FREE for everyone, signed out included — every
//            row is an eBay affiliate link to the cheapest copy we track.
//   vs-ebay  "Underpriced vs eBay": the mirror. Gated like tcg.
//
// ACCESS (lib/premium-gates.ts accessFor, rowLimit): full (Plus/Premium) — every
// row, filters, pages, "only my cards" (watchlist or binder); preview (signed-in
// free) — the first FREE_DEAL_ROWS rows of the DEFAULT ranking, limited in the
// loader (getDealList cuts the ranking once, for the session's Entitlement), then
// the real count of the rest; none (signed out) — NO ranking query on the gated
// views, a locked preview that shows the real count and no row, and an eBay
// search beside it.
//
// Every link on the page is built by hrefFor() from ONE parsed parameter set.

const SORTS: { key: DealSort; label: string }[] = [
  { key: "saving", label: "Most below market" },
  { key: "pct", label: "Biggest % below" },
];
const VS_EBAY_SORTS: { key: DealSort; label: string }[] = [
  { key: "saving", label: "Most below eBay" },
  { key: "pct", label: "Biggest % below" },
];
const MINE_CHIPS: { key: MineFilter | null; label: string }[] = [
  { key: null, label: "All cards" },
  { key: "watch", label: "My watchlist" },
  { key: "binder", label: "My binder" },
];
const PLUS_GATE_LINE = "Plus shows every one, with the store filter, sorting and your watchlist, and no ads.";

const EBAY_SEARCHES = [
  { label: "Magic singles", query: "Magic: The Gathering singles" },
  { label: "Foils & showcase", query: "Magic: The Gathering foil showcase" },
  { label: "Commander staples", query: "Magic: The Gathering commander staples" },
  { label: "Booster boxes", query: "Magic: The Gathering booster box" },
];

// Visible AND as FAQPage JSON-LD from the same array, so the two never drift.
const DEAL_FAQS = [
  {
    q: "What does Deal Finder compare?",
    a: "Three things, one per tab. Underpriced vs TCGplayer sets the cheapest in-stock store price we track for each card in your market against TCGplayer's US market price converted into your currency; a card is listed when it sits at least one whole unit of your currency below it, and in the United States it must also be cheaper than TCGplayer's own lowest listing. Cheapest on eBay lists the cards whose cheapest eBay listing costs less than every store we track. Underpriced vs eBay is the reverse: cards a store sells for less than the cheapest eBay listing. Each list is ranked by how far below the other price it sits.",
  },
  {
    q: "Why is TCGplayer never on the buy side?",
    a: "TCGplayer's market price is the yardstick every row is measured against, so TCGplayer itself is never one of the deals. In the US its own lowest listing is a real option, so a store or eBay price only counts when it beats that listing too. That lowest listing can be any condition, so a store is only dropped when TCGplayer genuinely sells a copy for no more.",
  },
  {
    q: "How often do the numbers update?",
    a: "Store prices are read once a day, after the 21:25 UTC import, and every figure here comes from the same prices the rest of the site runs on; the line above each list says when they were last read. When we collect eBay listings, the most valuable cards are looked up every day and the next tier every three days (outside the US only a short list of chase cards), so an eBay row can be up to three days old.",
  },
  {
    q: "Does the price include postage?",
    a: "Store prices are the item price only, because most shops quote postage at checkout and we never guess it. eBay rows include the postage the seller states and say delivered. When a seller states none, the row reads eBay + postage and is ranked on the item price alone, so the real cost is higher than the figure shown. In Canada the eBay rows are US listings with international postage on top, so they are left out of the default list and there is no eBay comparison at all.",
  },
  {
    q: "Is a big gap always a good deal?",
    a: "No. TCGplayer's market price is a reference built from recent US sales, not a price you can check out at, and outside the US the gap also moves with the exchange rate shown above the list. The condition beside a store price is what the store lists; a played copy is often why it is cheap. An eBay price is one seller's asking price. Open the card to see every store before buying.",
  },
  {
    q: "Do I need to pay to use it?",
    a: "Not to start. Cheapest on eBay is free for everyone, no account needed. For the other two lists a free account shows the top three cards; Plus shows every one, with the store filter, sorting and a filter for just the cards on your watchlist, and takes the ads off every page. Price comparison, the card database and price movers are free for everyone.",
  },
];

export default async function DealFinderPage({ searchParams }: { searchParams: DealFinderSearchParams }) {
  const who = await currentEntitlement();
  const viewer = who.viewer;
  const access: Access = accessFor("deal-finder", viewer);
  const member = access === "full";
  const rows = rowLimit("deal-finder", access, viewer); // 0 = the ranking is not even queried
  const country = getCountry();
  const info = COUNTRIES[country];
  // The picker's sources: every store and eBay, never TCGplayer (the reference side).
  const sources = dealFinderSources(country).filter((x) => !x.isEbay); // eBay is never on the TCGplayer comparison's buy side
  const defaultBuy = defaultBuyKeys(country).filter((k) => sources.some((x) => x.key === k));
  // ?mine= is honoured only for a real Plus+ member; anyone else's is ignored.
  const params = parseDealFinderParams(searchParams, { allowMine: member });
  const { view, sort, page, mine } = params;
  const buy = params.buy === null ? defaultBuy : resolveBuyKeys(country, params.buy).filter((k) => defaultBuy.includes(k));
  const island = access === "full" && mine !== null;

  // Each view queries only its own list. Signed out runs nothing on the gated
  // views; a free account gets the first rows of the DEFAULT ranking only.
  const stats = await getSiteStats();
  const tcg =
    view !== "tcg" || island || rows === 0
      ? null
      : await getTcgDeals(country, { buy: params.buy === null ? undefined : buy, sort, page, pageSize: DEAL_PAGE_SIZE }, who);
  const vsEbay =
    view !== "vs-ebay" || island || rows === 0
      ? null
      : await getVsEbayDeals(country, { sort, page, pageSize: DEAL_PAGE_SIZE }, who);
  // Free for everyone: the same page for every visitor.
  const cheapest = view === "ebay" ? await getCheapestOnEbayDeals(country, { page, pageSize: DEAL_PAGE_SIZE }) : null;
  // The signed-out preview shows the REAL count of today's deals and no row.
  const dealCount = view !== "ebay" && access === "none" ? await getDealCount(country).catch(() => 0) : 0;

  const gatedLocked = view !== "ebay" && access === "none";
  const priceLine = gatedLocked ? null : (
    <p className="mb-3 text-xs text-slate-500">
      {stats.lastImportAt ? <>Prices as of {formatAsOf(stats.lastImportAt)}. </> : null}
      {view === "tcg" && country !== "US" ? (
        <>Converted at US$1 = {money(Math.round((USD_TO[info.currency] ?? 1) * 100), country)}, an approximate reference rate. </>
      ) : null}
      {view !== "tcg" && stats.ebayLive && EBAY_FEED[country] === "own" ? (
        country === "US" ? <>eBay listings: the most valuable cards are refreshed daily, the next tier every three days. </> : <>eBay listings: a short list of chase cards is refreshed daily. </>
      ) : null}
    </p>
  );
  const mineChips = member && view !== "ebay" ? <MineChips params={params} /> : null;
  const ebayAvailable = EBAY_FEED[country] === "own" && stats.ebayLive;

  return (
    <div>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: "Magic: The Gathering Deal Finder",
            url: `${SITE_URL}/tools/deal-finder`,
            applicationCategory: "UtilitiesApplication",
            operatingSystem: "Web",
            description:
              "Magic: The Gathering cards underpriced against TCGplayer's market price or against eBay in the buyer's market, and the cards whose cheapest copy is an eBay listing, in the buyer's currency.",
          },
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: DEAL_FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
          },
        ]}
      />
      <div className="mx-auto max-w-4xl">
        <Breadcrumbs trail={[{ href: "/tools", name: "Tools" }, { name: "Deal Finder" }]} />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">Deal Finder</h1>
          <RegionToggle />
        </div>
        <p className="mb-5 mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-300">
          Magic cards you can buy for less than they usually go for. Each list sets the cheapest in-stock copy we track in {info.place}{" "}
          against a reference — TCGplayer&apos;s market price, or the cheapest eBay listing — and links straight to that listing.
        </p>

        <ViewTabs params={params} />

        {view === "tcg" ? (
          <section aria-labelledby="df-tcg">
            <h2 id="df-tcg" className="mb-1 text-xl text-white">Underpriced vs TCGplayer</h2>
            <p className="mb-2 max-w-3xl text-sm leading-relaxed text-slate-400">
              Cards {withArticle(info.adjective)} store is selling
              for less than <strong className="text-slate-200">TCGplayer&apos;s</strong> US market price
              {country === "US" ? " — and for less than TCGplayer's own lowest listing" : ` (converted to ${info.currency})`}. Store prices are the item
              price; postage is added at checkout.
            </p>
            {priceLine}
            {mineChips}
            {access === "full" ? (
              <div className="card-surface mb-4 flex flex-wrap items-end justify-between gap-4 p-4">
                <StorePicker sources={sources} buy={buy} defaultBuy={defaultBuy} params={params} />
                <SortTabs sorts={SORTS} active={sort} linkFor={(s) => hrefFor(params, { sort: s, page: 1 })} />
              </div>
            ) : null}
            {island ? (
              <MineDeals params={params} country={country} buy={params.buy === null ? null : buy} />
            ) : tcg === null ? (
              <Locked country={country} count={dealCount} />
            ) : tcg.rows.length === 0 ? (
              <Empty>
                {buy.length === 0 ? (
                  <>Pick at least one store on the buy side to see results.</>
                ) : (
                  <>
                    No cards are below TCGplayer market from these sources in {info.place} right now.
                    {params.buy !== null ? (
                      <>
                        {" "}
                        <Link href={hrefFor(params, { buy: null, page: 1 })} className="text-brand-400 hover:underline">
                          Try every store
                        </Link>
                        .
                      </>
                    ) : null}
                  </>
                )}
              </Empty>
            ) : (
              <>
                <div className="card-surface overflow-x-auto">
                  <TcgDealTable rows={tcg.rows} country={country} />
                </div>
                {access === "full" ? (
                  <DealPager total={tcg.total} page={tcg.page} pageCount={tcg.pageCount} linkFor={(p) => hrefFor(params, { page: p })} />
                ) : (
                  <MorePremium more={tcg.total - tcg.rows.length} />
                )}
                <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                  Best price is the cheapest in-stock copy at a store we track: its item price (postage extra) with the condition it lists.
                  TCGplayer market is a reference from recent US sales, not a price you can check out at.
                </p>
              </>
            )}
          </section>
        ) : null}

        {view === "ebay" && cheapest ? (
          <section aria-labelledby="df-ebay">
            <h2 id="df-ebay" className="mb-1 text-xl text-white">Cheapest on eBay</h2>
            <p className="mb-2 max-w-3xl text-sm leading-relaxed text-slate-400">
              Cards whose cheapest <strong className="text-slate-200">eBay</strong> listing in {info.place} costs less than every store we track
              there{country === "US" ? " and TCGplayer's own lowest listing" : ""}, ranked by how much less. Free for everyone. The eBay price
              includes the seller&apos;s stated postage where there is one; the store prices it beats are item prices, postage extra.
            </p>
            {priceLine}
            {!cheapest.available || !ebayAvailable ? (
              <>
                <Empty>
                  <NoEbayComparison country={country} live={stats.ebayLive} />
                </Empty>
                <div className="mt-4">
                  <EbaySearchPanel heading="Search eBay instead" links={EBAY_SEARCHES} country={country} page="deal-finder" />
                </div>
              </>
            ) : cheapest.rows.length === 0 ? (
              <Empty>No card&apos;s cheapest eBay listing beats every store we track in {info.place} right now.</Empty>
            ) : (
              <>
                <CheapestOnEbay rows={cheapest.rows} country={country} positionOffset={(cheapest.page - 1) * DEAL_PAGE_SIZE} />
                <DealPager total={cheapest.total} page={cheapest.page} pageCount={cheapest.pageCount} linkFor={(p) => hrefFor(params, { page: p })} />
              </>
            )}
          </section>
        ) : null}

        {view === "vs-ebay" ? (
          <section aria-labelledby="df-vs-ebay">
            <h2 id="df-vs-ebay" className="mb-1 text-xl text-white">Underpriced vs eBay</h2>
            <p className="mb-2 max-w-3xl text-sm leading-relaxed text-slate-400">
              Cards {withArticle(info.adjective)} store sells for less than the cheapest <strong className="text-slate-200">eBay</strong> listing in {info.place}.
              An eBay listing is one seller&apos;s asking price, not a sale. Store prices are the item price — postage is added at checkout, so the
              real gap is smaller by the store&apos;s postage.
            </p>
            {priceLine}
            {mineChips}
            {access === "full" && EBAY_FEED[country] === "own" ? (
              <div className="card-surface mb-4 flex flex-wrap items-end justify-end gap-4 p-4">
                <SortTabs sorts={VS_EBAY_SORTS} active={sort} linkFor={(s) => hrefFor(params, { sort: s, page: 1 })} />
              </div>
            ) : null}
            {EBAY_FEED[country] !== "own" ? (
              <Empty>
                <NoEbayComparison country={country} live={stats.ebayLive} />
              </Empty>
            ) : island ? (
              <MineDeals params={params} country={country} buy={null} />
            ) : vsEbay === null ? (
              <Locked country={country} count={dealCount} />
            ) : !ebayAvailable ? (
              <Empty>
                <NoEbayComparison country={country} live={stats.ebayLive} />
              </Empty>
            ) : vsEbay.rows.length === 0 ? (
              <Empty>No store we track in {info.place} sells a card for less than its cheapest eBay listing right now.</Empty>
            ) : (
              <>
                <div className="card-surface overflow-x-auto">
                  <VsEbayTable rows={vsEbay.rows} country={country} />
                </div>
                {access === "full" ? (
                  <DealPager total={vsEbay.total} page={vsEbay.page} pageCount={vsEbay.pageCount} linkFor={(p) => hrefFor(params, { page: p })} />
                ) : (
                  <MorePremium more={vsEbay.total - vsEbay.rows.length} />
                )}
                <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                  Best store price is the cheapest in-stock copy at a store we track, item price only. Cheapest on eBay is the cheapest in-stock
                  listing&apos;s asking price — &ldquo;delivered&rdquo; includes the seller&apos;s stated postage, &ldquo;+ postage&rdquo; means none
                  was stated. % below is a share of the eBay price.
                </p>
              </>
            )}
          </section>
        ) : null}

        <p className="mt-6 text-xs text-slate-500">
          Looking for cards that cost less in another market?{" "}
          {/* ?market= is this page's market: /market/records reads its market from the URL. */}
          <Link href={`/market/records?market=${country}#gaps`} className="text-brand-400 hover:underline">
            The cross-market board
          </Link>{" "}
          ranks the biggest price gaps between the markets we track, free.
        </p>
        <p className="mt-2 text-center text-[11px] text-slate-500">
          Affiliate links: as an eBay Partner Network affiliate and a TCGplayer affiliate, MTG Compare earns from qualifying purchases — at no extra
          cost to you. Store links are plain links.
        </p>

        <section className="mt-10">
          <h2 className="mb-3 text-2xl text-white">How Deal Finder works</h2>
          <div className="card-surface divide-y divide-ink-800">
            {DEAL_FAQS.map((f) => (
              <div key={f.q} className="px-5 py-4">
                <h3 className="font-semibold text-white">{f.q}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">{f.a}</p>
              </div>
            ))}
          </div>
        </section>
        <nav className="mt-6 flex flex-wrap gap-2 text-sm" aria-label="Related">
          <Link href="/movers" className="btn-ghost">
            This week&apos;s movers →
          </Link>
          <Link href="/price-guide" className="btn-ghost">
            Price guide →
          </Link>
          <Link href="/market" className="btn-ghost">
            Market index →
          </Link>
        </nav>
      </div>
    </div>
  );
}

// "Only my cards" (Plus): on the two gated views. Every link through hrefFor.
function MineChips({ params }: { params: DealFinderParams }) {
  return (
    <nav aria-label="Which cards" className="mb-3 flex flex-wrap items-center gap-1.5">
      {MINE_CHIPS.map((c) => {
        const active = params.mine === c.key;
        return (
          <Link
            key={c.label}
            href={hrefFor(params, { mine: c.key, page: 1 })}
            aria-current={active ? "true" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full px-3.5 text-sm font-semibold ${active ? "bg-brand-500 text-[#ffffff]" : "bg-ink-900 text-slate-400 hover:bg-ink-800 hover:text-white"}`}
          >
            {c.label}
          </Link>
        );
      })}
    </nav>
  );
}

// Canada, Singapore, or eBay not being collected: say why there is no eBay
// list, rather than "nothing today", which would imply there sometimes is.
function NoEbayComparison({ country, live }: { country: Country; live: boolean }) {
  if (country === "CA") {
    return (
      <>
        There is no eBay comparison for Canada. The eBay listings we track for Canadian buyers are US listings with international postage on top
        that no seller has quoted, so we can&apos;t honestly say one costs more or less than a Canadian store.
      </>
    );
  }
  if (EBAY_FEED[country] !== "own") return <>We don&apos;t track eBay listings in {COUNTRIES[country].place}, so there is nothing to compare against.</>;
  if (!live) return <>We aren&apos;t collecting eBay listings right now, so there is nothing to compare against. You can still search eBay below.</>;
  return <>No eBay listings to compare against right now.</>;
}

function formatAsOf(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" }).format(
    new Date(iso),
  );
}

function SortTabs({ sorts, active, linkFor }: { sorts: { key: DealSort; label: string }[]; active: DealSort; linkFor: (s: DealSort) => string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Sort</div>
      <div className="mt-0.5 flex flex-wrap gap-1">
        {sorts.map((s) => (
          <Link
            key={s.key}
            href={linkFor(s.key)}
            aria-current={active === s.key ? "true" : undefined}
            className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold ${active === s.key ? "bg-brand-500/20 text-white ring-1 ring-brand-500/60" : "bg-ink-950 text-slate-400 hover:text-white"}`}
          >
            {s.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card-surface grid place-items-center p-10 text-center text-sm text-slate-400">{children}</div>;
}

// SIGNED OUT, on a gated view: placeholder bars and the ask. NOTHING REAL IS
// RENDERED — no props, no rows — and an eBay search beside it so a shopper who
// doesn't want an account still has somewhere to buy.
function Locked({ country, count }: { country: Country; count: number }) {
  return (
    <>
      <div className="card-surface relative overflow-hidden">
        <ul className="divide-y divide-ink-800" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="flex items-center gap-2.5 px-4 py-3 opacity-40">
              <div className="h-10 w-7 shrink-0 rounded-sm bg-ink-800" />
              <div className="flex-1 space-y-1.5">
                <div className="h-2.5 w-2/5 rounded bg-ink-800" />
                <div className="h-2 w-1/4 rounded bg-ink-800" />
              </div>
              <div className="h-3 w-12 rounded bg-ink-800" />
            </li>
          ))}
        </ul>
        <div className="absolute inset-0 flex items-center justify-center bg-ink-950/70 p-4">
          <div className="mx-auto max-w-sm rounded-lg border border-ink-700 bg-ink-900 p-5 text-center">
            <Icon name="lock" className="mx-auto h-5 w-5 text-gold" />
            <h3 className="mt-1 text-base font-bold text-white">
              {count > 0 ? `${count.toLocaleString("en-US")} deals today. See the top ${FREE_DEAL_ROWS}, free` : `See today's top ${FREE_DEAL_ROWS} deals, free`}
            </h3>
            <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-slate-400">
              A free account shows the top three cards on this list. {PLUS_GATE_LINE}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <Link href={`/login?next=${encodeURIComponent("/tools/deal-finder")}`} rel="nofollow" className="btn-primary text-sm">
                Create a free account
              </Link>
              <PlanButton surface="gate:deal-finder" tier="plus" className="btn-ghost text-sm">
                See Plus
              </PlanButton>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <EbaySearchPanel heading="Shop Magic singles on eBay" sub="Searches your own eBay — no account needed." links={EBAY_SEARCHES} country={country} page="deal-finder" />
      </div>
    </>
  );
}

// SIGNED-IN FREE ACCOUNT, under its real rows: how many more there are (the
// real total of the list, said once by Upsell's MoreWithPlan) and the Plus
// button. Takes a COUNT, never rows.
function MorePremium({ more }: { more: number }) {
  if (more <= 0) return null;
  return (
    <MoreWithPlan more={more} surface="gate:deal-finder" tier="plus">
      {PLUS_GATE_LINE}
    </MoreWithPlan>
  );
}
