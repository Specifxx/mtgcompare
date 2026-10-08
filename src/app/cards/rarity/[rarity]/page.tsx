import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardFacetPage } from "@/components/CardFacetPage";
import type { Rarity } from "@/lib/constants";
import { getCardPage, getFacetCounts } from "@/lib/data";
import { RARITY_FACETS, facetBySlug, pageSuffix } from "@/lib/facets";
import { getCountry } from "@/lib/get-country";
import { pageOg } from "@/lib/og/meta";

// /cards/rarity/[rarity] — rarity, from the browse engine (the same filter /browse applies, so the
// page lists exactly what the card database would). No generateStaticParams: rendered on demand.
export const dynamic = "force-dynamic";
type Props = { params: { rarity: string }; searchParams: { page?: string } };

export function generateMetadata({ params, searchParams }: Props): Metadata {
  const f = facetBySlug(RARITY_FACETS, params.rarity);
  if (!f) return { title: "Not found" };
  const path = `/cards/rarity/${f.slug}${pageSuffix(searchParams.page)}`;
  return {
    title: `Magic: The Gathering ${f.title} — Prices & Full List`,
    description: `${f.intro} Every Magic rarity printing with live prices compared across stores in six markets.`,
    alternates: { canonical: path },
    openGraph: pageOg(path),
  };
}

export default async function Page({ params, searchParams }: Props) {
  const f = facetBySlug(RARITY_FACETS, params.rarity);
  if (!f) notFound();
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const [result, counts] = await Promise.all([getCardPage({ rarities: [f.key as Rarity], sort: "value", page, per: 48 }), getFacetCounts()]);
  return (
    <CardFacetPage
      facet={f}
      result={result}
      country={getCountry()}
      crumbs={[{ href: "/cards", label: "Cards" }, { label: f.label }]}
      path={`/cards/rarity/${f.slug}`}
      siblings={RARITY_FACETS}
      siblingBase="/cards/rarity"
      siblingCounts={counts.rarity}
      browseHref={`/browse?rarity=${encodeURIComponent(f.key)}`}
    />
  );
}
