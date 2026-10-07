import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardFacetPage } from "@/components/CardFacetPage";
import { getCatalog } from "@/lib/data";
import { facetBySlug, pageSuffix, PRINTING_FACETS } from "@/lib/facets";
import { getCountry } from "@/lib/get-country";
import { pageOg } from "@/lib/og/meta";

// /cards/printing/[printing] — one One Piece card printing, from the cached catalogue
// (RiftCompare's facet pages). No generateStaticParams: rendered on demand.
type Props = { params: { printing: string }; searchParams: { page?: string } };

export function generateMetadata({ params, searchParams }: Props): Metadata {
  const f = facetBySlug(PRINTING_FACETS, params.printing);
  if (!f) return { title: "Not found" };
  return {
    title: `One Piece ${f.title} — Prices & Full List`,
    description: `${f.intro} Every One Piece ${f.label} printing with live prices compared across stores in six markets.`,
    alternates: { canonical: `/cards/printing/${f.slug}${pageSuffix(searchParams.page)}` },
    openGraph: pageOg(`/cards/printing/${f.slug}${pageSuffix(searchParams.page)}`),
  };
}

export default async function Page({ params, searchParams }: Props) {
  const f = facetBySlug(PRINTING_FACETS, params.printing);
  if (!f) notFound();
  const cat = await getCatalog();
  const cards = cat.cards.filter((c) => c.printing === f.key);
  return (
    <CardFacetPage
      facet={f}
      cards={cards}
      cat={cat}
      country={getCountry()}
      crumbs={[{ href: "/cards", label: "By type & rarity" }, { label: f.label }]}
      path={`/cards/printing/${f.slug}`}
      pageParam={searchParams.page}
      siblings={PRINTING_FACETS}
      siblingBase="/cards/printing"
      browseHref={`/browse?printing=${encodeURIComponent(f.key)}`}
    />
  );
}
