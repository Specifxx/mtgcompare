import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { SoftSideAds } from "@/components/SideAds";
import { HomeRegionGrid } from "@/components/HomeRegionGrid";
import { RegionChips } from "@/components/RegionChips";
import { regionPicks } from "@/lib/picks";
import { REGION_LIST, X_DEFAULT_REGION } from "@/lib/regions";
import { DEFAULT_OG_IMAGE, breadcrumbJsonLd, jsonLd } from "@/lib/seo";
import { SITE_NAME, SITE_URL, sectionHref } from "@/lib/site";
import { STORES } from "@/lib/stores";
import { ChristmasGifts } from "@/components/home/ChristmasGifts";
import { Hero, riseAt, type Way } from "@/components/home/Hero";
import { SoftWaysIn } from "@/components/home/SoftWaysIn";
import { LandingAds } from "@/components/home/LandingAds";
import { landingRailTiles, landingTcgTiles } from "@/lib/landing-ads";

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

// The hero's ways in, built for the default region (SoftWaysIn moves them to the visitor's): six tiles, never products. The sixth
// is Pre-orders (the release calendar, with what stores have open for pre-order): the "Coming soon" block that sat on this page until
// 2026-11-13 is gone, and the owner wanted it short, not unreachable, so pre-orders stay one tap from the hero. Every set is in the
// header's Sets menu on this same page.
const HERO_LINKS: Way[] = [
  { href: sectionHref(X_DEFAULT_REGION, "boosterBoxes"), label: "Play booster boxes", icon: "box" },
  { href: sectionHref(X_DEFAULT_REGION, "collectorBoxes"), label: "Collector boxes", icon: "collector" },
  { href: sectionHref(X_DEFAULT_REGION, "commanderDecks"), label: "Commander decks", icon: "deck" },
  { href: sectionHref(X_DEFAULT_REGION, "bundles"), label: "Bundles", icon: "bundle" },
  { href: sectionHref(X_DEFAULT_REGION, "deals"), label: "Deals", icon: "tag" },
  { href: sectionHref(X_DEFAULT_REGION, "releases"), label: "Pre-orders", icon: "calendar" },
];

export default async function Landing() {
  // The phone dock's TCGplayer tiles, as on the region pages (this page is force-dynamic: read per request, never at build).
  const railTiles = await landingRailTiles().catch(() => []);
  // The default region's ten, from the public data files: the server HTML is already filled. The banner's TCGplayer half (the
  // newest sets' sealed products, from the same files); its eBay half is fetched in the browser.
  const [initialPicks, tcgTiles] = await Promise.all([regionPicks(X_DEFAULT_REGION).catch(() => []), landingTcgTiles().catch(() => [])]);
  return (
    <div>
      {/* The hero (owner, 2026-11-13: "get rid of the products on the hero"; it reverses the 2026-11-08 featured cards): the words,
          the search, the region row and six ways in, centred. Same h1, same search form. Nothing else lives here: no stat chips, no
          creators button (it is in the Guides menu), no product. The Christmas gift guide is its one small line, in season. */}
      <Hero>
        <ChristmasGifts />
        <h1 className="hero-h1 hero-h1-long rise-solid">
          MTG booster box, bundle &amp; Commander deck prices, <span className="text-brand">cheapest first.</span>
        </h1>
        <p className="hero-sub rise" style={riseAt(1)}>
          {STORES.length} independent stores in {REGION_LIST.length} regions, read about twice a day. Free, no sign-up.
        </p>
        {/* The 404's search markup: a plain GET form, so it works without script. SoftWaysIn points it at the visitor's region. */}
        <div className="hero-search rise" style={riseAt(2)}>
          <form id="landing-search" action={`/${X_DEFAULT_REGION}/sealed`} method="get" role="search" className="flex items-center gap-2 border p-1.5">
            <Icon name="search" size={20} className="shrink-0 text-faint" />
            <input name="q" type="search" placeholder="Search a set or product" aria-label="Search sealed products" className="min-w-0 flex-1 bg-transparent py-1.5 outline-none placeholder:text-faint" />
            <button type="submit" className="btn-primary min-h-11 px-6">
              Search
            </button>
          </form>
        </div>
        {/* The region row, with flags (owner, 2026-11-02): picks in place, like the header's switcher. */}
        <RegionChips className="rise mt-6 justify-center" style={riseAt(3)} />
        <SoftWaysIn formId="landing-search" links={HERO_LINKS} />
      </Hero>

      {/* The products, straight under the hero (owner, 2026-11-13: "the product's very easy to access"): ten of the region's most
          stocked. The paragraph on how stores are ranked and the "Coming soon" block that sat above them are gone: the footer says
          how the ranking works and links /about; pre-orders are the hero's sixth tile, and the next set's hub is in the Deals menu on
          every page and is the region home's pill and tab. Everything here is server-rendered. */}
      <div className="reveal mt-6 sm:mt-10">
        <HomeRegionGrid initial={initialPicks} />
      </div>

      {/* The page's one ad block: the eBay + TCGplayer banner (owner, 2026-11-03), under the products since 2026-11-13 (it sat between
          the hero and them). Real listings and products, labelled Ad; nothing moves when the eBay half arrives or the region changes. */}
      <div className="page reveal mb-16 mt-16 max-w-5xl sm:mt-24">
        <LandingAds tcg={tcgTiles} />
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd([{ href: "/", label: SITE_NAME }])) }} />
      {/* The phone dock (below 1280px, after a scroll), browser-only, in the visitor's region (components/SideAds.tsx; the side rails
          that shared the file were removed 2026-11-13; owner 2026-11-06: "the home page must have this as well"). */}
      <SoftSideAds tiles={railTiles} />
    </div>
  );
}
