import type { Metadata } from "next";
import Link from "next/link";
import { Archivo } from "next/font/google";
import { EbayChase } from "@/components/EbayChase";
import { CinematicHero } from "@/components/home/CinematicHero";
import { EditorialHub } from "@/components/home/EditorialHub";
import { HomeSections } from "@/components/home/HomeSections";
import { HomeTopDeals } from "@/components/home/HomeTopDeals";
import { PriceGuideCallout } from "@/components/home/PriceGuideCallout";
import { loadHomeData } from "@/components/home/home-data";
import { DEFAULT_COUNTRY } from "@/lib/country";
import { getSiteStats } from "@/lib/data";
import { homeFaqs } from "@/lib/home-faq";
import { homeMetadata } from "@/lib/home-metadata";
import { faqPage, ldJson, webApplication, webPage } from "@/lib/jsonld";

// The homepage — RiftCompare's app/page.tsx, section for section: the
// cinematic hero, the editorial band, Today's Top Deals, the price-guide
// callout, HomeSections and the About + FAQ card, with WebPage /
// WebApplication / FAQPage JSON-LD.
//
// STATIC: no cookie or header read. One cached HTML (ISR, hourly) carries every
// market's figures and the client localises to the visitor's market
// (CountryProvider). Archivo is loaded here only, for the homepage's display
// face (`.rb-display-sans`, globals.css).
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-riftbound",
  display: "swap",
});

export const revalidate = 3600;

export function generateMetadata(): Promise<Metadata> {
  return homeMetadata();
}

export default async function HomePage() {
  const [data, site] = await Promise.all([loadHomeData(), getSiteStats().catch(() => null)]);
  const faqs = homeFaqs({ ebayLive: site?.ebayLive ?? false });
  const storeCount = data.stats.statsByCountry[DEFAULT_COUNTRY].stores;
  return (
    <div className={`${archivo.variable} rb-display-sans flex flex-col gap-10`}>
      <CinematicHero
        totalCards={data.stats.totalCards}
        statsByCountry={data.stats.statsByCountry}
        trendingCards={data.trending}
        updatedAt={data.stats.updatedAt}
        renderedAt={data.renderedAt}
      />
      <EditorialHub cat={data.cat} updatedAt={data.stats.updatedAt} renderedAt={data.renderedAt} />
      <EbayChase page="home" heading="Chase cards on eBay right now" />
      <HomeTopDeals dealsByCountry={data.dealsByCountry} />
      <PriceGuideCallout totalCards={data.stats.totalCards} />
      <HomeSections data={data} storeCount={storeCount} />
      <section className="card-surface p-6">
        <h2 className="text-xl font-extrabold text-white">
          One Piece card prices in the US, Australia, the UK, Singapore, Canada and the EU — all in one place
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          OP Compare is a free, independent price comparison site for the One Piece Card Game. We track live prices for One Piece cards across
          local stores in the US, Australia, the UK, Singapore, Canada and the EU, plus TCGplayer, so you can buy One Piece cards for less —
          whether you&apos;re chasing singles for a deck or sealed booster boxes.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Store prices come from each store&apos;s own listings, imported twice a day and matched to the exact printing, and each card&apos;s
          comparison lists them cheapest first by item price —{" "}
          <Link href="/methodology" className="text-brand-300 underline-offset-2 hover:underline">
            how prices are collected
          </Link>{" "}
          and{" "}
          <Link href="/stores" className="text-brand-300 underline-offset-2 hover:underline">
            which stores we track
          </Link>{" "}
          each have a page of their own. OP Compare is paid for by affiliate commission (the eBay Partner Network and TCGplayer) and Plus and
          Premium subscriptions, and none of them can buy a store a better place in a comparison. More on{" "}
          <Link href="/about" className="text-brand-300 underline-offset-2 hover:underline">
            who runs OP Compare
          </Link>{" "}
          and in our{" "}
          <Link href="/editorial-policy" className="text-brand-300 underline-offset-2 hover:underline">
            editorial policy
          </Link>
          .
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Two tools go further than a single card: the{" "}
          <Link href="/deck" className="text-brand-300 underline-offset-2 hover:underline">
            Deck Builder &amp; Pricer
          </Link>{" "}
          prices a whole decklist at the cheapest in-stock store for every card, and the{" "}
          <Link href="/tools/deal-finder" className="text-brand-300 underline-offset-2 hover:underline">
            Deal Finder
          </Link>{" "}
          lists the cards selling below TCGplayer&apos;s market price in your market right now.
        </p>
        <div className="mt-5 divide-y divide-ink-800 border-t border-ink-800">
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
              name: "OP Compare — One Piece Card Game Price Comparison",
              href: "/",
              description:
                "One Piece Card Game prices compared across stores in the US, UK, Australia, Canada, Singapore and the EU — cheapest first by item price, in your own currency.",
            }),
            webApplication({
              id: "#app",
              name: "OP Compare — One Piece Card Game price comparison",
              href: "/",
              applicationCategory: "ShoppingApplication",
              description:
                "Compare One Piece Card Game prices across stores in six markets: live prices for every One Piece single card and sealed product, cheapest first by item price.",
              featureList: [
                "Compare live One Piece single-card prices across stores in the US, Australia, the UK, Singapore, Canada and the EU, plus TCGplayer",
                "Every printing priced separately: standard, Parallel, Manga, SP, Treasure Rare and promo",
                "Sealed product price comparison: booster boxes, packs, starter decks and collections",
                "Deck Builder & Pricer: price a whole decklist at the cheapest in-stock store price",
                "Prices in local currency: USD, AUD, GBP, SGD, CAD and EUR",
                "Price history charts for every card",
              ],
            }),
            faqPage(faqs),
          ),
        }}
      />
    </div>
  );
}
