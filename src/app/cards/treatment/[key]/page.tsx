import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardFacetPage } from "@/components/CardFacetPage";
import { getCardPage, getFacetCounts, isIndexableTreatment } from "@/lib/data";
import { TREATMENT_FACETS, facetBySlug, pageSuffix } from "@/lib/facets";
import { getCountry } from "@/lib/get-country";
import { pageOg } from "@/lib/og/meta";

// /cards/treatment/[key] — one printing treatment (Borderless, Showcase, Extended Art, Surge Foil, Serialized ...), from the browse engine. Replaces
// the One Piece /cards/printing/[printing]. A treatment no listed printing carries yet (embossed, silverfoil today) is a 404, so the sitemap, which lists
// the same set through isIndexableTreatment, never names a page that does not exist. No generateStaticParams: rendered on demand.
export const dynamic = "force-dynamic";
type Props = { params: { key: string }; searchParams: { page?: string } };

export function generateMetadata({ params, searchParams }: Props): Metadata {
  const f = facetBySlug(TREATMENT_FACETS, params.key);
  if (!f) return { title: "Not found" };
  const path = `/cards/treatment/${f.slug}${pageSuffix(searchParams.page)}`;
  return {
    title: `Magic: The Gathering ${f.title} — Prices & Full List`,
    description: `${f.intro} Every Magic ${f.label} printing with live prices compared across stores in six markets.`,
    alternates: { canonical: path },
    openGraph: pageOg(path),
  };
}

export default async function Page({ params, searchParams }: Props) {
  const f = facetBySlug(TREATMENT_FACETS, params.key);
  if (!f) notFound();
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const [result, counts] = await Promise.all([getCardPage({ treats: [f.key], sort: "value", page, per: 48 }), getFacetCounts()]);
  if (!isIndexableTreatment(counts.treat[f.key] ?? 0)) notFound();
  return (
    <CardFacetPage
      facet={f}
      result={result}
      country={getCountry()}
      crumbs={[{ href: "/cards", label: "Cards" }, { label: f.label }]}
      path={`/cards/treatment/${f.slug}`}
      siblings={TREATMENT_FACETS}
      siblingBase="/cards/treatment"
      siblingCounts={counts.treat}
      browseHref={`/browse?treat=${encodeURIComponent(f.key)}`}
    />
  );
}
