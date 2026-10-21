import Link from "next/link";
import type { Metadata } from "next";
import { Icon, type IconName } from "@/components/Icon";
import { RegionSuggest, SuggestedEbayStrip, SuggestedTypeLinks } from "@/components/RegionSuggest";
import { REGION_LIST, REGIONS, X_DEFAULT_REGION, type Region } from "@/lib/regions";
import { DEFAULT_OG_IMAGE } from "@/lib/seo";
import { SITE_NAME, SITE_URL, sectionHref, type SectionKey } from "@/lib/site";
import { STORES, storesInMarket } from "@/lib/stores";
import { PRODUCT_TYPES } from "@/lib/sealed-title";
import { guidesFor } from "@/content/guides";
import { COUNTRY_GUIDE } from "@/content/guides/country-prices";
import { GuideCard } from "@/content/guides/kit";
import { jsonLd } from "@/lib/seo";
import { ADSENSE_CLIENT } from "@/lib/adsense";

// Fully static: counts come from the store registry, not the database, so
// this page costs nothing to serve and never depends on the database.

const TITLE = `${SITE_NAME} — Pokémon sealed prices & stock from ${STORES.length} stores`;
const DESCRIPTION = `Compare Pokémon sealed prices and stock across ${STORES.length} independent stores in ${REGION_LIST.length} regions. Booster boxes, ETBs and more, cheapest in stock first.`;

/**
 * The landing page's metadata. hreflang: the seven region homes, and x-default this page, the region chooser that every region
 * home names as its own x-default (seo.ts regionAlternates): the return links. `absolute`: the layout's "%s | DexCompare" template
 * would brand it twice. The share card is the site's (app/opengraph-image.tsx).
 */
export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: {
    canonical: SITE_URL,
    languages: { ...Object.fromEntries(REGION_LIST.map((r) => [r.hreflang, `${SITE_URL}/${r.region}`])), "x-default": `${SITE_URL}/` },
  },
  openGraph: { url: SITE_URL, siteName: SITE_NAME, type: "website", title: TITLE, description: DESCRIPTION, images: [DEFAULT_OG_IMAGE] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

// Deep links into the two biggest regions, straight to the pages people come for. Static: no counts, no prices.
const POPULAR_REGIONS: Region[] = ["us", "au"];
const POPULAR_LINKS: { key: SectionKey; label: string }[] = [
  { key: "boosterBoxes", label: "Booster boxes" },
  { key: "etbs", label: "Elite Trainer Boxes" },
  { key: "deals", label: "Deals" },
  { key: "perPack", label: "Cheapest per pack" },
  { key: "releases", label: "Releases" },
  { key: "guides", label: "Guides" },
];

const HOW: { icon: IconName; t: string; d: string }[] = [
  { icon: "store", t: "The stores’ own prices", d: "Every price is a store’s own listing (in the US, also TCGplayer’s), in your currency, before shipping." },
  { icon: "clock", t: "Stock, with a timestamp", d: "Each listing says when we last read it. A store that hasn’t answered for three days is marked, never guessed." },
  { icon: "check", t: "Ranked by price and stock only", d: "Cheapest in stock first. No store pays to be listed or to rank, and every affiliate link is marked." },
];

// The landing page's FAQ: what a first-time visitor (and a crawler) asks, answered from the same facts the page already states.
const FAQ: { q: string; a: string }[] = [
  {
    q: "What is DexCompare?",
    a: `A free price-comparison site for English-language Pokémon TCG sealed product: booster boxes, Elite Trainer Boxes, booster bundles, collections, tins and more. It reads ${STORES.length} independent stores in ${REGION_LIST.length} regions and ranks every product's listings in stock first, cheapest first.`,
  },
  {
    q: "How often are prices and stock checked?",
    a: "About twice a day. Every listing says when it was last read, and a store that hasn’t answered for three days is marked as not checked recently, never guessed.",
  },
  {
    q: "Does DexCompare sell cards?",
    a: "No. Every buy button goes to the store’s own website, and you buy from the store. DexCompare keeps no accounts and asks for no email.",
  },
  {
    q: "Do stores pay to be listed?",
    a: `No. Stores are ranked by price and stock only. The site earns from marked eBay and TCGplayer affiliate links${ADSENSE_CLIENT ? " and Google ads" : ""}, which never change the order of the stores.`,
  },
  {
    q: "Which prices are shown?",
    a: "Each store’s own listed price, in your region’s currency, before shipping. Add delivery before you compare two stores.",
  },
  {
    q: "Why can’t I find singles or Japanese product?",
    a: "DexCompare compares English-language sealed product only, so every product page compares like with like. Singles, graded cards, Japanese product, accessories and store-made bundles are left out on purpose.",
  },
];

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
};

export default function Landing() {
  const guides = guidesFor(X_DEFAULT_REGION);
  const gr = REGIONS[X_DEFAULT_REGION];
  return (
    <div>
      <section>
        <div className="page relative pb-12 pt-8 text-center sm:pb-16 sm:pt-20">
          <p className="eyebrow">Booster boxes · ETBs · bundles · collections · tins</p>
          <h1 className="mx-auto max-w-3xl font-display text-4xl font-bold leading-[1.05] tracking-tight mt-3 sm:mt-4 sm:text-6xl">
            Pokémon sealed, in stock, <span className="text-brand">cheapest first.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted sm:mt-6 sm:text-lg sm:leading-8">
            Prices and stock from {STORES.length} independent stores in {REGION_LIST.length} regions, read about twice a day. Free, no sign-up, and no store pays to be
            listed.
          </p>
          <div className="mt-6 flex h-12 justify-center sm:mt-8">
            <RegionSuggest formId="landing-search" />
          </div>
          {/* The 404's search markup: a plain GET form, so it works without script. RegionSuggest points it at the suggested region. */}
          <form
            id="landing-search"
            action={`/${X_DEFAULT_REGION}/sealed`}
            method="get"
            role="search"
            className="mx-auto mt-4 flex max-w-md items-center gap-2 rounded-full border border-line bg-surface p-1.5 pl-4 shadow-card focus-within:border-ink/40"
          >
            <Icon name="search" size={18} className="text-faint" />
            <input
              name="q"
              type="search"
              placeholder="Search a set or product"
              aria-label="Search sealed products"
              className="min-w-0 flex-1 bg-transparent py-1.5 text-base outline-none placeholder:text-faint sm:text-sm"
            />
            <button type="submit" className="btn-ghost min-h-10 px-4">
              Search
            </button>
          </form>
        </div>
      </section>

      {/* Content first (owner, 2026-10-15: "the best chance for AdSense approval, considering Google has lazy crawlers"). A reviewer
          or crawler that reads only the first screens of the server HTML meets original text, not a wall of links: what the site is
          and how it works, then the regions, the guides with their summaries, and every answer written out (no collapsed details).
          Navigation chips come after the text, and the page's one ad unit (the eBay strip) is last, below all of it. Everything
          here is server-rendered: no text waits on a script. */}
      <section className="page" aria-labelledby="about-h">
        <div className="mx-auto max-w-3xl">
          <h2 id="about-h" className="font-display text-2xl font-bold tracking-tight">
            What {SITE_NAME} does
          </h2>
          <div className="mt-4 space-y-4 text-[15px] leading-7 text-muted">
            <p>
              {SITE_NAME} is a free price comparison for English-language Pokémon TCG sealed product: booster boxes, Elite Trainer Boxes,
              booster bundles, collections, tins, blisters and decks. It reads the shelves of {STORES.length} independent hobby stores in{" "}
              {REGION_LIST.length} regions about twice a day and puts each product&rsquo;s listings side by side, the ones in stock first and
              the cheapest of those at the top, in your own currency.
            </p>
            <p>
              The same Elite Trainer Box is often priced very differently from one shop to the next on the same day, and one shop&rsquo;s
              sold-out page says nothing about the next one&rsquo;s stock. Every listing here carries the time it was last read, so you can see how fresh a
              price is before you click through, and a store that has not answered for three days is marked rather than guessed.
            </p>
            <p>
              No store pays to be listed or to rank higher: the order is price and stock, nothing else. The site is paid for by marked eBay
              and TCGplayer affiliate links{ADSENSE_CLIENT ? " and by Google ads" : ""}, which never move a store up or down.{" "}
              <Link href="/about" className="font-semibold text-ink underline underline-offset-2 hover:text-brand">
                Who runs it, and how
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      <section id="regions" className="page mt-14" aria-labelledby="regions-h">
        <h2 id="regions-h" className="mb-2 text-center font-display text-2xl font-bold tracking-tight">
          Choose your region
        </h2>
        <p className="mx-auto mb-5 max-w-xl text-center text-sm leading-6 text-muted">
          Each region compares its own stores in its own currency, so a price is one you can actually pay, before shipping.
        </p>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {REGION_LIST.map((r) => {
            const n = storesInMarket(r.market).length;
            return (
              <li key={r.region} className="flex">
                <Link
                  href={`/${r.region}`}
                  className="card group flex flex-1 flex-col items-start gap-2 p-4 transition-all hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-lift"
                >
                  <span className="text-3xl leading-none" aria-hidden="true">
                    {r.flag}
                  </span>
                  <span>
                    <span className="block font-display text-[15px] font-bold leading-snug group-hover:text-brand">{r.name}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {n} stores · {r.currency}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-center text-sm text-muted">
          The same booster box in all seven, side by side:{" "}
          <Link href={COUNTRY_GUIDE.path} prefetch={false} className="font-semibold text-brand hover:underline">
            booster box prices by country →
          </Link>
        </p>
      </section>

      <section className="page mt-14" aria-labelledby="guides-h">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="guides-h" className="font-display text-2xl font-bold tracking-tight">
            Buying guides
          </h2>
          <Link href={sectionHref(X_DEFAULT_REGION, "guides")} prefetch={false} className="text-sm font-semibold text-brand hover:underline">
            All guides →
          </Link>
        </div>
        <p className="mb-5 max-w-2xl text-sm leading-6 text-muted">
          Plain-English answers to what people ask before they buy Pokémon sealed product, each with today’s prices. Shown for {gr.inName}; every region has its own copy
          with its own stores and currency.
        </p>
        <ul role="list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {guides.slice(0, 6).map((g) => (
            <li key={g.slug}>
              <GuideCard r={gr} guide={g} headingLevel={3} />
            </li>
          ))}
        </ul>
        {guides.length > 6 && (
          <ul role="list" className="mt-4 flex flex-wrap gap-2">
            {guides.slice(6).map((g) => (
              <li key={g.slug}>
                <Link href={`/${X_DEFAULT_REGION}/guides/${g.slug}`} prefetch={false} className="chip min-h-10">
                  {g.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="page mt-14" aria-labelledby="how-h">
        <h2 id="how-h" className="mb-6 font-display text-2xl font-bold tracking-tight">
          How the comparison works
        </h2>
        <ul className="grid gap-6 sm:grid-cols-3 sm:gap-8">
          {HOW.map((f) => (
            <li key={f.t} className="flex gap-4 sm:flex-col sm:gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-strong" aria-hidden="true">
                <Icon name={f.icon} size={22} />
              </span>
              <span>
                <span className="block font-display text-lg font-bold">{f.t}</span>
                <span className="mt-1 block text-sm leading-6 text-muted">{f.d}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="page mt-16 max-w-3xl" aria-labelledby="faq-h">
        <h2 id="faq-h" className="mb-5 font-display text-2xl font-bold tracking-tight">
          Questions
        </h2>
        {/* Written out, not collapsed: every answer is visible text in the first render. */}
        <dl className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {FAQ.map((f) => (
            <div key={f.q} className="px-4 py-4">
              <dt className="font-semibold">{f.q}</dt>
              <dd className="mt-1.5 text-[15px] leading-7 text-muted">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="page mt-14 text-center" aria-labelledby="compare-h">
        <h2 id="compare-h" className="eyebrow mb-3">
          What we compare
        </h2>
        <SuggestedTypeLinks types={PRODUCT_TYPES.slice(0, 13).map((t) => ({ slug: t.slug, label: t.plural }))} />
        <p className="mx-auto mt-6 max-w-xl text-sm leading-6 text-muted">
          English-language Pokémon TCG sealed product only. Singles, graded cards, Japanese product, accessories and store-made bundles are
          left out on purpose — <Link href="/about#refuse" className="underline underline-offset-2 hover:text-ink">what we refuse, and why</Link>.
        </p>
      </section>

      <section className="page mt-14" aria-labelledby="popular-h">
        <h2 id="popular-h" className="mb-5 font-display text-2xl font-bold tracking-tight">
          Popular right now
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {POPULAR_REGIONS.map((code) => {
            const r = REGIONS[code];
            return (
              <div key={code} className="card p-5">
                <h3 className="flex items-center gap-2 font-display text-lg font-bold">
                  <span aria-hidden="true">{r.flag}</span> {r.name}
                </h3>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {POPULAR_LINKS.map((l) => (
                    <li key={l.key}>
                      <Link href={sectionHref(code, l.key)} prefetch={false} className="chip min-h-10" aria-label={`${l.label} in ${r.inName}`}>
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* The landing page's one ad unit, last: below every piece of the page's own content. The visitor's suggested region's eBay
          (the US until known, and with no suggestion), and it says which. Real listings imported once a day; with none, the compact
          CTA row. */}
      <section className="page mt-16" aria-label="Chase cards on eBay">
        <SuggestedEbayStrip />
      </section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqLd) }} />
    </div>
  );
}
