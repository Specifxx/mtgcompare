import type { Metadata } from "next";
import { SITE } from "../site.config";

export function pageMeta(o: { title: string; description: string; path: string; image?: string; noindex?: boolean }): Metadata {
  const url = `${SITE.url}${o.path}`;
  return {
    title: o.title,
    description: o.description,
    alternates: { canonical: url },
    robots: o.noindex ? { index: false, follow: true } : undefined,
    openGraph: { title: o.title, description: o.description, url, siteName: SITE.name, type: "website", images: o.image ? [{ url: o.image }] : undefined },
  };
}
/** JSON for a <script type="application/ld+json">, safe inside HTML. */
export const jsonLd = (o: unknown) => JSON.stringify(o).replace(/</g, "\\u003c");
export function breadcrumbLd(items: { label: string; href?: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.label, ...(it.href ? { item: `${SITE.url}${it.href}` } : {}) })),
  };
}
