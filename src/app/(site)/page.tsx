import Link from "@/components/Link";
import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { RegionSuggest } from "@/components/RegionSuggest";
import { HomeRegionGrid } from "@/components/HomeRegionGrid";
import { regionPicks } from "@/lib/picks";
import { ComingSoonSwitch } from "@/components/ComingSoonSwitch";
import { loadFeaturedAll } from "@/lib/coming-soon-data";
import { REGION_LIST, X_DEFAULT_REGION } from "@/lib/regions";
import { DEFAULT_OG_IMAGE, breadcrumbJsonLd, jsonLd } from "@/lib/seo";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { STORES } from "@/lib/stores";
import { HalloweenDecor } from "@/components/home/HalloweenDecor";
import { InnistradComing } from "@/components/home/InnistradComing";

// Rendered per request and kept by Vercel's CDN for a day (next.config.js CDN_PAGES, "/"), like the region pages, never ISR and never
// prerendered at build (a build reads no data: tests/vercel-ignore-build.test.ts). The region block's default (US) picks come from the
// public data files; the counts from the store registry. It reads no cookie or header: one copy for everyone.
export const dynamic = "force-dynamic";

// Retargeted 2026-10-23 at the sealed queries people search (DECISIONS.md, "Retarget the landing page at sealed queries"): the
// product kinds first, the brand last. Under 60 and 155 characters (tests/seo-titles.test.ts).
const TITLE = `MTG Booster Box & Commander Deck Prices | ${SITE_NAME}`;
const DESCRIPTION = `Compare MTG booster box, Collector Booster box, Bundle and Commander deck prices across ${STORES.length} stores in the US, UK, Australia, Canada and more.`;

/**
 * The landing page's metadata. hreflang: the seven region homes, and x-default this page, the region chooser that every region
 * home names as its own x-default (seo.ts regionAlternates): the return links. `absolute`: the layout's "%s | MTG Compare" template
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

export default async function Landing() {
  // The default region's five, from the public data files: the server HTML is already filled.
  const today = new Date().toISOString().slice(0, 10);
  // The next set's block, every region's (seven small lists): the server HTML has the default region's, the browser the visitor's.
  const [initialPicks, featured] = await Promise.all([regionPicks(X_DEFAULT_REGION).catch(() => []), loadFeaturedAll(today).catch(() => ({}))]);
  const hasFeatured = Object.keys(featured).length > 0;
  return (
    <div>
      <section className="mc-hero relative">
        <HalloweenDecor />
        <div className="page mc-hero-content pb-10 pt-10 text-center sm:pb-14 sm:pt-16">
          <InnistradComing />
          <h1 className="mx-auto max-w-3xl font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            MTG booster box, bundle &amp; Commander deck prices, <span className="text-brand">cheapest first.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted sm:mt-5 sm:text-lg">
            {STORES.length} independent stores in {REGION_LIST.length} regions, read about twice a day. Free, no sign-up.
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
            <button type="submit" className="btn-ghost min-h-11 px-4">
              Search
            </button>
          </form>
        </div>
      </section>

      {/* The owner's short landing page (2026-10-25, DECISIONS.md): one paragraph on how it is fair, the region's five, the hot
          buttons, the footer. The long text, the FAQ, the regions and what we compare live on /about; the guides on each region's
          guides index; the market report on each region home. Everything here is server-rendered. */}
      <section className="page" aria-labelledby="fair-h">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="fair-h" className="sr-only">
            How {SITE_NAME} ranks stores
          </h2>
          <p className="text-[15px] leading-7 text-muted">
            Every product&rsquo;s stores are ranked by price and stock only: in stock first, cheapest first, each store&rsquo;s own price in your currency.
            No store pays to be listed or to rank, and every affiliate link is marked.{" "}
            <Link href="/about" className="inline-flex min-h-11 items-center font-semibold text-ink underline underline-offset-2 hover:text-brand sm:min-h-0">
              How it works
            </Link>
          </p>
        </div>
      </section>

      {/* The next set (lib/coming-soon.ts, by sets.ts dates): gone on its release day. It carries the pre-order hub link, so the hot
          buttons below keep their Commander decks button. */}
      {hasFeatured && (
        <div className="page mt-10 max-w-3xl">
          <ComingSoonSwitch byRegion={featured} today={today} />
        </div>
      )}

      <div className="mb-10 mt-10">
        <HomeRegionGrid initial={initialPicks} />
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd([{ href: "/", label: SITE_NAME }])) }} />
    </div>
  );
}
