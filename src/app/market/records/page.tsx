import type { Metadata } from "next";
import Link from "next/link";
import CardQuickLink from "@/components/CardQuickLink";
import { Breadcrumbs, Faq, JsonLd } from "@/components/ui";
import { COUNTRIES, COUNTRY_LIST, MARKETS, currencyOf, normalizeCountry, type Country } from "@/lib/country";
import { getMarketRecords, type CardLite } from "@/lib/data";
import { finishLabel } from "@/lib/constants";
import { XMARKET_MIN_SAVING_CENTS } from "@/lib/deals";
import { money } from "@/lib/format";
import { USD_TO, usdCentsToCountry } from "@/lib/fx";
import { getCountry } from "@/lib/get-country";
import { imageFor } from "@/lib/images";
import { pageOg } from "@/lib/og/meta";

// The free cross-market board (RiftCompare's /market/records, ported with MTG
// Compare's data). Two kinds of board:
//   • Biggest cross-market gaps — the cheapest in-stock STORE price for the same
//     printing in another market, converted at our reference rate, against the
//     cheapest store price here. Stores only (never TCGplayer's own listing or an
//     eBay ask), ranked by money saved, before postage or customs.
//   • 90-day records — from TCGplayer's market price history (the 90-day high and
//     the 30-day change of a card's unit): cards at a fresh 90-day high, and cards
//     furthest below theirs. The history is young, so these are 90-day records,
//     never "all-time".
// ?market= picks the home market (Deal Finder links here with it); without it the
// visitor's own market. Reads only the published views (mk/records.json through
// getMarketRecords); nothing is computed here.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Magic Card Price Records & Cross-Market Gaps",
  description:
    "Where the same Magic card costs less in another market, converted into your currency, plus the cards at a 90-day high and the cards furthest below theirs — each linked to its store-by-store price comparison.",
  alternates: { canonical: "/market/records" },
  openGraph: pageOg("/market/records"),
};

const GAPS_SHOWN = 10;
const RECORDS_SHOWN = 10;

function CardCell({ card, finish }: { card: CardLite; finish: "N" | "F" }) {
  const img = imageFor(card, "thumb");
  return (
    <CardQuickLink slug={card.slug} className="flex min-w-0 items-center gap-2 hover:text-brand-400" title={card.name}>
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" width={28} height={40} loading="lazy" decoding="async" className="h-10 w-7 shrink-0 rounded bg-ink-800 object-cover" />
      ) : (
        <span className="h-10 w-7 shrink-0 rounded bg-ink-800" />
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-white">
          {card.name}
          {card.variant ? <span className="font-normal text-slate-400"> ({card.variant})</span> : null}
          {finish === "F" ? <span className="font-normal text-slate-400"> · {finishLabel(card, "F")}</span> : null}
        </span>
        <span className="block text-[11px] text-slate-500">
          {card.setCode} · {card.number ?? "—"}
        </span>
      </span>
    </CardQuickLink>
  );
}

function Board({ id, heading, blurb, rows, note }: { id: string; heading: string; blurb: string; rows: { key: number; cell: React.ReactNode; value: string; sub: string; tone?: string }[]; note: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-xl text-white">{heading}</h2>
      <p className="mt-1 text-sm text-slate-400">{blurb}</p>
      <ol className="mt-3 divide-y divide-ink-800 overflow-hidden rounded-lg border border-ink-800 bg-ink-900">
        {rows.map((r, i) => (
          <li key={r.key} className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-3 py-2.5 sm:flex">
            <span className="num w-5 shrink-0 text-center text-xs font-bold text-slate-500">{i + 1}</span>
            <div className="min-w-0 flex-1">{r.cell}</div>
            <div className="col-start-2 text-left sm:shrink-0 sm:text-right">
              <div className={`num text-sm font-bold ${r.tone ?? "text-white"}`}>{r.value}</div>
              <div className="text-[11px] text-slate-500">{r.sub}</div>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] text-slate-500">{note}</p>
    </section>
  );
}

export default async function MarketRecordsPage({ searchParams }: { searchParams: { market?: string } }) {
  const raw = searchParams.market;
  const country: Country = raw ? normalizeCountry(raw) : getCountry();
  const info = COUNTRIES[country];
  const records = await getMarketRecords(country);
  const gaps = records.gaps.slice(0, GAPS_SHOWN), highs = records.highs.slice(0, RECORDS_SHOWN), offPeak = records.lows.slice(0, RECORDS_SHOWN);
  const ref = (usd: number) => (country === "US" ? money(usd, "US") : `≈ ${money(usdCentsToCountry(usd, country), country)}`);

  const FAQS = [
    {
      q: "Can I actually buy at the cross-market price?",
      a: "Sometimes. Both figures are live in-stock store prices, converted into one currency at our reference rate, but international postage, customs and whether that market's stores ship to you are not included — on a cheap card they will usually swallow the gap. It is most useful on expensive singles.",
    },
    {
      q: "Which exchange rate do you use?",
      a: `A fixed reference rate, updated by hand: US$1 = ${COUNTRY_LIST.filter((c) => c.code !== "US")
        .map((c) => `${c.symbol}${(USD_TO[c.currency] ?? 1).toFixed(2)}`)
        .join(", ")}. Your bank or card will use its own rate, so treat a small gap as noise.`,
    },
    {
      q: "Why a 90-day high and not an all-time high?",
      a: "The records come from the TCGplayer market price history we keep for every card, and we only compare within the last 90 days. A card needs at least a month of recorded prices before it can appear here, so a price seen once or twice is never called a record.",
    },
    {
      q: "How often does this update?",
      a: "The gaps read current store prices, which we refresh daily. The 90-day records move once a day, when the day's TCGplayer market price is recorded.",
    },
  ];

  return (
    <div>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
          },
        ]}
      />
      <div className="mx-auto max-w-4xl space-y-8">
        <header>
          <Breadcrumbs trail={[{ href: "/market", name: "Market index" }, { name: "Price records" }]} />
          <h1 className="text-3xl font-extrabold text-white sm:text-4xl">Magic price records &amp; market gaps</h1>
          <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-300">
            Where the same printing costs less in another market than in {info.place}, and which cards are at a 90-day high or furthest below
            one. Free, for every market we track.
          </p>
          <nav aria-label="Choose the market these records cover" className="mt-4 flex flex-wrap gap-1.5">
            {COUNTRY_LIST.map((c) => (
              <Link
                key={c.code}
                href={`/market/records?market=${c.code}`}
                aria-current={c.code === country ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-full px-3.5 text-sm font-semibold ${c.code === country ? "bg-brand-500 text-[#ffffff]" : "bg-ink-900 text-slate-400 hover:bg-ink-800 hover:text-white"}`}
              >
                {c.code}
                <span className="ml-1 text-[10px] font-medium opacity-70">{c.currency}</span>
              </Link>
            ))}
          </nav>
        </header>

        {gaps.length ? (
          <Board
            id="gaps"
            heading="Biggest cross-market price gaps"
            blurb={`Cards a store in another market sells for meaningfully less than the cheapest store in ${info.place}, ranked by the money saved before postage or customs. Converted at our reference rate so the two figures compare.`}
            rows={gaps.map((g) => ({
              key: g.card.id * 2 + (g.finish === "F" ? 1 : 0),
              cell: <CardCell card={g.card} finish={g.finish} />,
              value: `${money(g.saving, country)} less`,
              sub: `${COUNTRIES[g.away].flag} ${money(g.awayCents, g.away)} vs ${money(g.home, country)} · −${g.pct}%`,
              tone: "text-up",
            }))}
            note={
              <>
                Informational: international postage, customs and whether an overseas store ships to you are not included, and can easily
                exceed the gap. For cards selling below TCGplayer market at stores in your own market, see{" "}
                <Link href="/tools/deal-finder" className="text-brand-400 hover:underline">
                  Deal Finder
                </Link>
                .
              </>
            }
          />
        ) : (
          <section id="gaps" className="scroll-mt-24">
            <h2 className="text-xl text-white">Biggest cross-market price gaps</h2>
            <p className="mt-1 text-sm text-slate-400">
              {`No card is at least ${money(XMARKET_MIN_SAVING_CENTS, country)} cheaper at a store in another market than in ${info.place} right now, or the stores of ${info.place} have not been read yet today.`}
            </p>
          </section>
        )}

        {highs.length ? (
          <Board
            id="highs"
            heading="At a 90-day high"
            blurb="Cards whose TCGplayer market price is the highest we have recorded in the last 90 days, after rising over the past month. Most valuable first."
            rows={highs.map((h) => ({
              key: h.card.id * 2 + (h.finish === "F" ? 1 : 0),
              cell: <CardCell card={h.card} finish={h.finish} />,
              value: ref(h.cents),
              sub: h.card.change30d != null ? `+${h.card.change30d.toFixed(1)}% in 30 days` : "at its 90-day high",
              tone: "text-up",
            }))}
            note={country === "US" ? "TCGplayer market price, from the daily history we record." : `TCGplayer market price converted to ${info.currency} at our reference rate.`}
          />
        ) : null}

        {offPeak.length ? (
          <Board
            id="off-peak"
            heading="Furthest below their 90-day high"
            blurb="Cards trading well under their own highest TCGplayer market price of the last 90 days."
            rows={offPeak.map((l) => ({
              key: l.card.id * 2 + (l.finish === "F" ? 1 : 0),
              cell: <CardCell card={l.card} finish={l.finish} />,
              value: `−${l.pctBelow.toFixed(1)}%`,
              sub: `${ref(l.cents)} · high ${ref(l.high90)}`,
              tone: "text-down",
            }))}
            note="Measured on TCGplayer's market price at the latest daily record."
          />
        ) : null}

        {!highs.length && !offPeak.length ? (
          <section>
            <h2 className="text-xl text-white">90-day records</h2>
            <p className="mt-1 text-sm text-slate-400">
              Not enough recorded price history yet. A card needs at least a month of daily TCGplayer market prices before it can hold a record,
              and we would rather show nothing than call a price seen once a high.{" "}
              <Link href="/movers" className="text-brand-400 hover:underline">
                This week&apos;s movers
              </Link>{" "}
              work from a shorter window.
            </p>
          </section>
        ) : null}

        <section>
          <h2 className="mb-3 text-xl text-white">Questions</h2>
          <Faq items={FAQS} />
        </section>

        <nav className="flex flex-wrap gap-2 border-t border-ink-800 pt-6 text-sm" aria-label="Related">
          <Link href="/market" className="btn-ghost">
            The MTG Compare Index →
          </Link>
          <Link href="/movers" className="btn-ghost">
            This week&apos;s movers →
          </Link>
          <Link href="/tools/deal-finder" className="btn-ghost">
            Deal Finder →
          </Link>
        </nav>
      </div>
    </div>
  );
}
