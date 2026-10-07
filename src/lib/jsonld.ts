// JSON-LD builders for the tools track's pages. Pure.
import { SITE_URL } from "./site";

/** BreadcrumbList for a page's visible breadcrumbs: Home first, then each crumb (the last is the page). */
export function breadcrumbLd(trail: { name: string; path: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Home", path: "/" }, ...trail].map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: c.path === "/" ? SITE_URL : `${SITE_URL}${c.path}`,
    })),
  };
}

export function faqLd(faqs: { q: string; a: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

export function itemListLd(name: string, path: string, items: { name: string; path: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    url: `${SITE_URL}${path}`,
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, url: `${SITE_URL}${it.path}` })),
  };
}

// ── RiftCompare's lib/jsonld.ts builders (wave 2, design track) ──────────────
// Breadcrumbs.tsx emits its own BreadcrumbList through breadcrumb(); the
// homepage and region homes build WebPage / WebApplication / FAQPage nodes.
// `@id`s point at the Organization and WebSite nodes the root layout emits.

export interface Crumb {
  name: string;
  /** Omitted only for the last crumb (the current page), which then has no `item` URL — allowed by Google. */
  href?: string;
}

const absolute = (href: string): string => (href.startsWith("http") ? href : `${SITE_URL}${href === "/" ? "" : href}`);

export function breadcrumb(trail: Crumb[]) {
  const items: Crumb[] = [{ name: "Home", href: "/" }, ...trail];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      ...(c.href ? { item: absolute(c.href) } : {}),
    })),
  };
}

export function webPage(opts: { name: string; href: string; description?: string; type?: "WebPage" | "CollectionPage" | "AboutPage" | "ContactPage" }) {
  return {
    "@context": "https://schema.org",
    "@type": opts.type ?? "WebPage",
    name: opts.name,
    url: absolute(opts.href),
    ...(opts.description ? { description: opts.description } : {}),
    isPartOf: { "@id": `${SITE_URL}/#website` },
    publisher: { "@id": `${SITE_URL}/#org` },
  };
}

export function webApplication(opts: {
  id: string;
  name: string;
  href: string;
  description: string;
  featureList: string[];
  applicationCategory: "ShoppingApplication" | "UtilitiesApplication";
}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": `${opts.href === "/" ? SITE_URL + "/" : absolute(opts.href)}${opts.id}`,
    name: opts.name,
    url: absolute(opts.href),
    description: opts.description,
    applicationCategory: opts.applicationCategory,
    operatingSystem: "Any",
    browserRequirements: "Requires a modern web browser with JavaScript enabled.",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    featureList: opts.featureList,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    publisher: { "@id": `${SITE_URL}/#org` },
  };
}

export function faqPage(faqs: { q: string; a: string }[]) {
  if (!faqs.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

/** `<` escaped, so a string can never close the <script> it sits in. */
function scriptSafe(json: string): string {
  return json.replace(/</g, "\\u003c");
}

/** One node as an object, several as an array; nulls dropped. */
export function ldJson(...nodes: (object | null | undefined)[]): string {
  const kept = nodes.filter(Boolean);
  return scriptSafe(JSON.stringify(kept.length === 1 ? kept[0] : kept));
}
