import type { Metadata } from "next";
import { REGION_LIST, REGIONS, X_DEFAULT_REGION, xDefaultRegion, isRegion, type Region, type RegionInfo } from "./regions";
import { CONTACT_EMAIL, SITE_NAME, SITE_TAGLINE, SITE_URL, SOCIAL_LINKS } from "./site";

/**
 * JSON-LD for a <script> tag. Store titles flow into this, so "<" is escaped:
 * a title containing "</script>" must not be able to close the tag.
 */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

/**
 * A name as a title or H1 says it: "Pokémon " in front, unless the name already says Pokémon (or Pokemon, any case, accented or
 * not): "Pitch Black" → "Pokémon Pitch Black", "Pokémon Center Elite Trainer Box" stays as it is. Searchers type the word; a set
 * or product name alone ("Perfect Order") is ambiguous outside the hobby, and "Pokémon Pokémon Center…" reads as a bug.
 */
export function withPokemon(name: string): string {
  const plain = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return /pokemon/i.test(plain) ? name : `Pokémon ${name}`;
}

// The eurozone is one market with one page per URL (/eu/…), but nobody in Germany searches with en-IE. These are the euro
// countries whose English-language searches DexCompare's EU stores serve: the same /eu URL is listed under each, beside en-IE.
export const EU_HREFLANGS: readonly string[] = ["en-DE", "en-NL", "en-FR", "en-BE", "en-AT", "en-ES", "en-IT", "en-FI", "en-PT", "en-LU"];

/**
 * Canonical + hreflang alternates for a page that exists at /<region><rest>.
 * Two call shapes, same result:
 *   regionAlternates("/au/p/slug", regions?)      — the page's own path
 *   regionAlternates("au", "/p/slug", regions?)   — region + rest
 *
 * `regions` is the set of regions to ADVERTISE — pass only the ones where this
 * page is indexable (a product's regions with a comparable listing, say), as
 * codes or RegionInfos. The default is all seven, right for pages that always
 * have content (region home, /sealed, /sets, /stores). The page's own region
 * is always included. x-default is the landing page (the region chooser) for
 * a region home, and otherwise the US copy when it is advertised
 * (xDefaultRegion) — never a copy the page is not indexable in.
 */
export function regionAlternates(path: string, regions?: ReadonlyArray<Region | RegionInfo>): Metadata["alternates"];
export function regionAlternates(region: Region, rest: string, regions?: ReadonlyArray<Region | RegionInfo>): Metadata["alternates"];
export function regionAlternates(a: string, b?: string | ReadonlyArray<Region | RegionInfo>, c?: ReadonlyArray<Region | RegionInfo>): Metadata["alternates"] {
  let region: string;
  let rest: string;
  let regions: ReadonlyArray<Region | RegionInfo>;
  if (typeof b === "string") {
    region = a;
    rest = b;
    regions = c ?? REGION_LIST;
  } else {
    const [first, ...more] = a.split("/").filter(Boolean);
    region = first ?? "";
    rest = more.length ? `/${more.join("/")}` : "";
    regions = b ?? REGION_LIST;
  }
  if (!isRegion(region)) return { canonical: `${SITE_URL}${a.startsWith("/") ? a : `/${a}`}` };
  const codes = regions.map((r) => (typeof r === "string" ? r : r.region)).filter(isRegion);
  if (!codes.includes(region)) codes.unshift(region);
  const languages: Record<string, string> = {};
  for (const r of REGION_LIST) {
    if (!codes.includes(r.region)) continue;
    languages[r.hreflang] = `${SITE_URL}/${r.region}${rest}`;
    if (r.region === "eu") for (const h of EU_HREFLANGS) languages[h] = `${SITE_URL}/eu${rest}`;
  }
  languages["x-default"] = rest ? `${SITE_URL}/${xDefaultRegion(codes)}${rest}` : `${SITE_URL}/`;
  return { canonical: `${SITE_URL}/${region}${rest}`, languages };
}

/**
 * The site's own share card (src/app/opengraph-image.tsx, 1200×630), for every page that has no image of its own. Named
 * explicitly: a page's openGraph object replaces its parents' whole, so the root's file-based image would be lost on any page
 * that sets openGraph, which is every page that goes through pageMeta.
 */
export const DEFAULT_OG_IMAGE = { url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: SITE_NAME };

/** A share card drawn by lib/og-card.tsx at one of the /og routes: a region home's (/og/au) or a guide's (/og/guides/<slug>). */
export function ogCardImage(path: string, alt: string) {
  return { url: `${SITE_URL}${path}`, width: 1200, height: 630, alt };
}

export function pageMeta(opts: {
  title: string;
  description: string;
  path: string;
  alternates?: Metadata["alternates"];
  image?: string | null;
  noindex?: boolean;
  /**
   * og:type. "product" is not in Next's openGraph union, so it goes out through
   * `other` and openGraph carries no `type` key at all — a `type: undefined`
   * key makes Next's generator throw "Invalid OpenGraph type: undefined" and
   * the page 500.
   */
  ogType?: "website" | "product";
}): Metadata {
  const product = opts.ogType === "product";
  return {
    title: opts.title,
    description: opts.description,
    alternates: opts.alternates ?? { canonical: `${SITE_URL}${opts.path}` },
    openGraph: {
      title: opts.title,
      description: opts.description,
      url: `${SITE_URL}${opts.path}`,
      siteName: SITE_NAME,
      ...(product ? {} : { type: "website" }),
      images: opts.image ? [{ url: opts.image }] : [DEFAULT_OG_IMAGE],
    },
    ...(product ? { other: { "og:type": "product" } } : {}),
    // Every page has a large image now (its own, or the site's card), so every share gets the large card.
    twitter: { card: "summary_large_image", title: opts.title, description: opts.description },
    ...(opts.noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

// ─── JSON-LD builders ────────────────────────────────────────────────────────
// One place for the shapes, so every page says the same thing about the site.
// Each returns a plain object; render with jsonLd() inside a <script>.

export const ORG_ID = `${SITE_URL}/#org`;
export const WEBSITE_ID = `${SITE_URL}/#site`;

export function organizationJsonLd() {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo.svg`,
    description: SITE_TAGLINE,
    contactPoint: { "@type": "ContactPoint", email: CONTACT_EMAIL, contactType: "customer support", url: `${SITE_URL}/contact` },
    ...(SOCIAL_LINKS.length ? { sameAs: SOCIAL_LINKS } : {}),
  };
}

// The site search is per region (/<region>/sealed?q=); the x-default region's
// is the one to advertise.
export function websiteJsonLd() {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE_NAME,
    url: SITE_URL,
    publisher: { "@id": ORG_ID },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/${X_DEFAULT_REGION}/sealed?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

/** The root layout's graph: Organization + WebSite, once per page. */
export function siteJsonLd() {
  return { "@context": "https://schema.org", "@graph": [organizationJsonLd(), websiteJsonLd()] };
}

export function breadcrumbJsonLd(items: { href?: string; label: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.label,
      ...(it.href ? { item: `${SITE_URL}${it.href}` } : {}),
    })),
  };
}

/**
 * A product page's Product + AggregateOffer, from the region's OPEN listings
 * only (in stock or pre-order, in the region's currency). Never TCGplayer's
 * US$ offer outside the US, and never a sold-out price: the page shows none
 * when nothing is open, and so does this.
 */
export function productJsonLd(p: {
  name: string;
  path: string; // "/au/p/<slug>"
  image?: string | null;
  productType: string;
  setName?: string | null;
  currency: string;
  lowCents: number;
  highCents: number;
  offerCount: number;
  preorder?: boolean;
  /** One sentence of the page's own facts (the product page's value check), never eBay's data or a claim about the past. */
  description?: string | null;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    ...(p.description ? { description: p.description } : {}),
    ...(p.image ? { image: p.image } : {}),
    brand: { "@type": "Brand", name: "Pokémon" },
    category: `Pokémon TCG ${p.productType}`,
    ...(p.setName ? { isRelatedTo: { "@type": "Thing", name: p.setName } } : {}),
    url: `${SITE_URL}${p.path}`,
    offers: {
      "@type": "AggregateOffer",
      url: `${SITE_URL}${p.path}`,
      priceCurrency: p.currency,
      lowPrice: (p.lowCents / 100).toFixed(2),
      highPrice: (p.highCents / 100).toFixed(2),
      offerCount: p.offerCount,
      availability: p.preorder ? "https://schema.org/PreOrder" : "https://schema.org/InStock",
      // Sealed product from stores (and TCGplayer's sealed listings): every offer compared is new. eBay is never in here.
      itemCondition: "https://schema.org/NewCondition",
    },
  };
}

/**
 * An ItemList for a set, type or browse page: the products it lists, in the
 * order shown. Cap it (the first 50 is plenty for a crawler) — the page's grid
 * is the full list.
 */
export function itemListJsonLd(opts: { name: string; path: string; items: { path: string; name: string; image?: string | null }[]; take?: number }) {
  const items = opts.items.slice(0, opts.take ?? 50);
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: opts.name,
    url: `${SITE_URL}${opts.path}`,
    numberOfItems: opts.items.length,
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}${it.path}`,
      name: it.name,
      ...(it.image ? { image: it.image } : {}),
    })),
  };
}

/**
 * A guide's Article. Author and publisher are DexCompare (the Organization), never an invented person. `published` and
 * `updated` are ISO editorial dates ("2026-10-14"), never the data refresh time. The image is the site's share card unless the
 * guide has its own.
 */
export function articleJsonLd(a: { title: string; description: string; path: string; published: string; updated: string; image?: string | null }) {
  const org = { "@type": "Organization", "@id": ORG_ID, name: SITE_NAME, url: SITE_URL };
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description: a.description,
    url: `${SITE_URL}${a.path}`,
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE_URL}${a.path}` },
    datePublished: a.published,
    dateModified: a.updated,
    image: a.image || DEFAULT_OG_IMAGE.url,
    inLanguage: "en",
    author: org,
    publisher: { ...org, logo: { "@type": "ImageObject", url: `${SITE_URL}/logo.svg` } },
  };
}

/** The region a path's first segment names, if any: "/au/sets" → REGIONS.au. */
export function regionOfPath(pathname: string): RegionInfo | null {
  const first = pathname.split("/").filter(Boolean)[0];
  return isRegion(first) ? REGIONS[first] : null;
}
