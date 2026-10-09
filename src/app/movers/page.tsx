import { EbayChase } from "@/components/EbayChase";
import { AdSlot } from "@/components/AdSlot";
import { HubIntro } from "@/components/HubIntro";
import type { Metadata } from "next";
import Link from "next/link";
import { EbayBuyCta } from "@/components/EbayBuyCta";
import { MoverList } from "@/components/MoverList";
import { MoversToolsCta } from "@/components/MoversToolsCta";
import { InlineSignupPrompt } from "@/components/InlineSignupPrompt";
import { AnswerBox } from "@/components/AnswerBox";
import { HubFaq } from "@/components/HubFaq";
import { RelatedGuides } from "@/components/RelatedGuides";
import { Breadcrumbs, Delta, JsonLd } from "@/components/ui";
import { guidesForCatalogue } from "@/lib/content/catalogue-guides";
import { MOVERS_FAQ } from "@/lib/content/movers-faq";
import { breadcrumbLd, faqLd } from "@/lib/jsonld";
import { releasedSets } from "@/lib/selectors";
import { getDemandStrip, getIndexSeries, getMarketRecords, getMovers, getSets, getSparklines } from "@/lib/data";
import { unitKey } from "@/lib/constants";
import { EmailOnly } from "@/components/EmailOnly";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { MostSearchedStrip } from "@/components/MostSearchedStrip";
import { longDate } from "@/lib/format";
import { pageOg } from "@/lib/og/meta";

// Reads the published movers feeds and the free demand strip: rendered per request, cached at the CDN (contract 7.5).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Magic Card Price Movers — This Week's Risers & Fallers",
  description:
    "The Magic: The Gathering singles whose price moved most this week: the biggest risers, the biggest drops and the best value against a card's recent high.",
  alternates: { canonical: "/movers" },
  openGraph: pageOg("/movers"),
};

export default async function MoversPage() {
  // "Most searched this week" is Demand Finder's FREE strip: the clear preview slice (pv/demand.json), identical for every visitor, never a gated loader.
  const [sets, series, strip, up, down, records] = await Promise.all([
    getSets(), getIndexSeries(), getDemandStrip(),
    getMovers({ dir: "up", window: 7, minCents: 100, n: 15 }), getMovers({ dir: "down", window: 7, minCents: 100, n: 15 }),
    getMarketRecords("US"),
  ]);
  const value = records.lows.slice(0, 15);
  const sparkByUnit = await getSparklines([...up.map((c) => ({ id: c.id, finish: c.headFinish })), ...down.map((c) => ({ id: c.id, finish: c.headFinish })), ...value.map((v) => ({ id: v.card.id, finish: v.finish }))].slice(0, 48));
  const spark: Record<number, number[]> = {};
  for (const c of [...up, ...down, ...value.map((v) => v.card)]) { const pts = sparkByUnit[unitKey(c.id, c.headFinish)]; if (pts) spark[c.id] = pts; }
  const first = series[0]?.day;
  const ready = first
    ? new Date(Date.parse(first) + 7 * 864e5).toISOString().slice(0, 10)
    : null;
  const noHistory = !up.length && !down.length;

  return (
    <div>
      <JsonLd data={faqLd(MOVERS_FAQ)} />
      <Breadcrumbs trail={[{ name: "Price movers" }]} />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
        Magic price movers — this week
      </h1>
      <HubIntro path="/movers" />
      <div className="mt-6">
        <AnswerBox>
          Magic price movers are the cards whose TCGplayer market price changed most in the past week. Only cards worth US$1 or more are ranked, so a 10-cent common doubling never tops the list.
        </AnswerBox>
      </div>
      {noHistory ? (
        <div className="card-surface mt-4 max-w-3xl p-4 text-sm text-slate-300">
          <strong className="text-white">Building history.</strong> MTG Compare
          started recording prices on{" "}
          {first ? longDate(first) : "its first import"}; weekly moves appear
          from {ready ? longDate(ready) : "a week later"}, once every card has
          two prices a week apart.
        </div>
      ) : null}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <MoverList
          title="Spiking this week"
          tone="text-up"
          sub="Up the most (7 days)"
          rows={up.map((card) => ({
            card,
            price: card.marketUsd,
            right: <Delta v={card.change7d} className="text-xs" />,
          }))}
          spark={spark}
          empty="No week-on-week moves yet."
          ebaySource="movers-panel"
        />
        <MoverList
          title="Biggest drops this week"
          tone="text-down"
          sub="Down the most (7 days)"
          rows={down.map((card) => ({
            card,
            price: card.marketUsd,
            right: <Delta v={card.change7d} className="text-xs" />,
          }))}
          spark={spark}
          empty="No week-on-week moves yet."
          ebaySource="movers-panel"
        />
        <MoverList
          title="Best value right now"
          tone="text-gold"
          sub="Largest discount off 90-day high"
          rows={value.map(({ card, pctBelow }) => ({
            card,
            price: card.marketUsd,
            right: (
              <span className="num text-xs font-semibold text-down">
                -{pctBelow.toFixed(1)}%
              </span>
            ),
          }))}
          spark={spark}
          empty="Appears once a card has fallen from a recorded high."
          ebaySource="movers-panel"
        />
      </div>
      {/* Straight after the lists (RiftCompare): a reader who has just seen a
          card spike or drop has a card in mind, and this is where to shop for
          it. A buy path, not an ad; it localises itself (useCountry). */}
      {up.length || down.length || value.length ? (
        <EbayBuyCta className="mt-6" source="movers" page="movers" />
      ) : null}
      <div className="mt-6">
        <MoversToolsCta />
      </div>
      <div className="mt-8">
        <MostSearchedStrip rows={strip.rows} coveredDays={strip.rows.length ? 7 : null} />
      </div>
      <section className="mt-8" aria-label="Browse prices by set">
        <h2 className="mb-3 text-lg font-bold text-white">Browse prices by set</h2>
        <div className="flex flex-wrap gap-2">
          {releasedSets(sets).slice(0, 12).map((s) => (
            <Link key={s.id} href={`/sets/${s.slug}`} className="chip border border-ink-700 bg-ink-850 text-slate-200 hover:border-ink-600 hover:text-white">
              {s.code} {s.name}
            </Link>
          ))}
          <Link href="/sets" className="chip border border-brand-500/40 text-brand-400 hover:text-brand-300">
            All sets →
          </Link>
        </div>
      </section>
      <div className="mt-6 empty:hidden">
        <EmailOnly>
          <NewsletterSignup siteName="MTG Compare" source="movers" variant="card" heading="Get the week's biggest movers in your inbox" cta="Email me the movers" done="Done. You'll get the movers digest each week." />
        </EmailOnly>
      </div>
      <EbayChase page="movers" className="mt-8" />
      <AdSlot slot="movers" className="mt-8" thin={noHistory} />
      <HubFaq faqs={MOVERS_FAQ} />
      <RelatedGuides guides={guidesForCatalogue("movers")} className="card-surface mt-6 p-5" />
      <InlineSignupPrompt className="mt-6" surface="movers" title="See which cards are cheap right now, free" body="A free account shows Deal Finder's three biggest savings in your market: real store listings under TCGplayer's market price." />
    </div>
  );
}
