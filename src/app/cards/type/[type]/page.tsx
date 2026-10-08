import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardFacetPage } from "@/components/CardFacetPage";
import { getCardPage, getFacetCounts } from "@/lib/data";
import { TYPE_FACETS, facetBySlug, pageSuffix } from "@/lib/facets";
import { getCountry } from "@/lib/get-country";
import { pageOg } from "@/lib/og/meta";

// /cards/type/[type] — card type, from the browse engine (the same filter /browse applies, so the
// page lists exactly what the card database would). No generateStaticParams: rendered on demand.
export const dynamic = "force-dynamic";
type Props = { params: { type: string }; searchParams: { page?: string } };

export function generateMetadata({ params, searchParams }: Props): Metadata {
  const f = facetBySlug(TYPE_FACETS, params.type);
  if (!f) return { title: "Not found" };
  const path = `/cards/type/${f.slug}${pageSuffix(searchParams.page)}`;
  return {
    title: `Magic: The Gathering ${f.title} — Prices & Full List`,
    description: `${f.intro} Every Magic card type printing with live prices compared across stores in six markets.`,
    alternates: { canonical: path },
    openGraph: pageOg(path),
  };
}

export default async function Page({ params, searchParams }: Props) {
  const f = facetBySlug(TYPE_FACETS, params.type);
  if (!f) notFound();
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const [result, counts] = await Promise.all([getCardPage({ types: [f.key], sort: "value", page, per: 48 }), getFacetCounts()]);
  return (
    <CardFacetPage
      facet={f}
      result={result}
      country={getCountry()}
      crumbs={[{ href: "/cards", label: "Cards" }, { label: f.label }]}
      path={`/cards/type/${f.slug}`}
      siblings={TYPE_FACETS}
      siblingBase="/cards/type"
      siblingCounts={counts.type}
      browseHref={`/browse?type=${encodeURIComponent(f.key)}`}
    />
  );
}
