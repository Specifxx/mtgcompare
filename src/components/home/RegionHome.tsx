import Link from "next/link";
import { EbayChase } from "@/components/EbayChase";
import { CountryLock } from "@/components/CountryProvider";
import { COUNTRIES, type Country } from "@/lib/country";
import { getSiteStats } from "@/lib/data";
import { breadcrumb, faqPage, ldJson, webPage } from "@/lib/jsonld";
import { CHEAPER_ABROAD_SLUG, COUNTRY_GUIDE_SLUGS, REGION_HOME_PATH } from "@/lib/seo";
import { CinematicHero } from "./CinematicHero";
import { EditorialHub } from "./EditorialHub";
import { HomeSections } from "./HomeSections";
import { HomeTopDeals } from "./HomeTopDeals";
import { PriceGuideCallout } from "./PriceGuideCallout";
import { loadHomeData } from "./home-data";

// RiftCompare's RegionHome: the homepage body for one market (/au, /uk, /ca,
// /sg, /eu) — the hero, the eBay chase strip (immediately under the hero, as on
// "/") and Today's Top Deals locked to that market, its own "Buying Magic
// cards in <place>" block and FAQ, and reciprocal hreflang (lib/seo.ts) with
// "/" as x-default. The rest of the page follows the visitor's market like "/"
// does. The strip is a client island that asks the visitor's market, so it sits
// inside a CountryLock: on /au it quotes Australian listings whoever is looking.
export async function RegionHome({ region }: { region: Exclude<Country, "US"> }) {
  const info = COUNTRIES[region];
  const [data, site] = await Promise.all([loadHomeData(), getSiteStats().catch(() => null)]);
  const stat = data.stats.statsByCountry[region];
  const storeWord = stat.stores === 1 ? "store" : "stores";
  const path = REGION_HOME_PATH[region];
  const ebayLive = site?.ebayLive ?? false;
  const faqs = [
    {
      q: `Where can I buy Magic: The Gathering cards in ${info.place}?`,
      a: `MTG Compare tracks ${stat.stores} ${info.adjective} ${storeWord} stocking Magic singles and sealed product${
        ebayLive ? `, plus the cheapest matching eBay listing,` : ""
      } and lists every result cheapest first by item price. Postage is added at each store's checkout.`,
    },
    {
      q: `Are prices shown in ${info.currency}?`,
      a:
        region === "CA"
          ? `Yes — every store price on this page and across the ${info.adjective} store listings is in ${info.currency}, the currency those stores charge in. Two kinds of figure are converted at our reference rate: rows marked "eBay US", which are US listings, and TCGplayer's market price with the 7-day change worked out from it.`
          : `Yes — every store price on this page and across the ${info.adjective} store listings is in ${info.currency}, the real currency those stores charge in. TCGplayer's market price, and the 7-day change worked out from it, is converted into ${info.currency} at our reference rate.`,
    },
  ];
  return (
    <div className="flex flex-col gap-10">
      <CinematicHero
        totalCards={data.stats.totalCards}
        statsByCountry={data.stats.statsByCountry}
        trendingCards={data.trending}
        updatedAt={data.stats.updatedAt}
        renderedAt={data.renderedAt}
        region={{ code: region, adjective: info.adjective }}
      />
      <CountryLock country={region}>
        <EbayChase page="home" heading="Chase cards on eBay right now" />
      </CountryLock>
      <EditorialHub updatedAt={data.stats.updatedAt} renderedAt={data.renderedAt} market={region} />
      <HomeTopDeals dealsByCountry={data.dealsByCountry} lockCountry={region} />
      <PriceGuideCallout totalCards={data.stats.totalCards} />
      <HomeSections data={data} storeCount={stat.stores} />
      <section className="container-app">
        <h2 className="text-xl font-extrabold text-white">Buying Magic cards in {info.place}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
          MTG Compare compares live prices across {stat.stores} {info.adjective} {storeWord} for Magic: The Gathering —{" "}
          {stat.priced.toLocaleString("en-US")} cards priced in {info.place} so far. Each card&apos;s stores are listed cheapest first by item price,
          and prices are refreshed once a day. It&apos;s the same database and the same ranking used everywhere else on the site, scoped to
          what&apos;s actually available in {info.place}.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/browse" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            Browse the full database →
          </Link>
          <Link href="/stores" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            See every store we track →
          </Link>
          <Link href="/methodology" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            Read our methodology →
          </Link>
          <Link href="/sets" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            Browse by set →
          </Link>
          <Link href="/deck" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            Price a decklist →
          </Link>
          <Link href={`/blog/${COUNTRY_GUIDE_SLUGS[region]}`} className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            Where to buy Magic cards →
          </Link>
          <Link href={`/blog/${CHEAPER_ABROAD_SLUG}`} className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            Is it cheaper abroad? →
          </Link>
        </div>
        <div className="mt-6 divide-y divide-ink-800 border-t border-ink-800">
          {faqs.map((f) => (
            <details key={f.q} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 font-semibold text-white [&::-webkit-details-marker]:hidden">
                <span>{f.q}</span>
                <svg className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>
              <p className="pb-3 text-sm leading-relaxed text-slate-400">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: ldJson(
            webPage({
              name: `MTG Compare ${info.label} — Magic: The Gathering Card Prices`,
              href: path,
              description: `Compare live Magic: The Gathering prices across ${info.adjective} stores, in ${info.currency}: cheapest first by item price.`,
              type: "CollectionPage",
            }),
            breadcrumb([{ name: info.label, href: path }]),
            faqPage(faqs),
          ),
        }}
      />
    </div>
  );
}
