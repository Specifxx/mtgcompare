import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardFacetPage } from "@/components/CardFacetPage";
import { getCatalog } from "@/lib/data";
import { facetBySlug, pageSuffix, TYPE_FACETS } from "@/lib/facets";
import { getCountry } from "@/lib/get-country";
import { pageOg } from "@/lib/og/meta";

// /cards/type/[type] — one One Piece card type, from the cached catalogue
// (RiftCompare's facet pages). No generateStaticParams: rendered on demand.
type Props = { params: { type: string }; searchParams: { page?: string } };

export function generateMetadata({ params, searchParams }: Props): Metadata {
  const f = facetBySlug(TYPE_FACETS, params.type);
  if (!f) return { title: "Not found" };
  return {
    title: `One Piece ${f.title} — Prices & Full List`,
    description: `${f.intro} Every One Piece ${f.label} printing with live prices compared across stores in six markets.`,
    alternates: { canonical: `/cards/type/${f.slug}${pageSuffix(searchParams.page)}` },
    openGraph: pageOg(`/cards/type/${f.slug}${pageSuffix(searchParams.page)}`),
  };
}

export default async function Page({ params, searchParams }: Props) {
  const f = facetBySlug(TYPE_FACETS, params.type);
  if (!f) notFound();
  const cat = await getCatalog();
  const cards = cat.cards.filter((c) => c.cardType === f.key);
  return (
    <CardFacetPage
      facet={f}
      cards={cards}
      cat={cat}
      country={getCountry()}
      crumbs={[{ href: "/cards", label: "By type & rarity" }, { label: f.label }]}
      path={`/cards/type/${f.slug}`}
      pageParam={searchParams.page}
      siblings={TYPE_FACETS}
      siblingBase="/cards/type"
      browseHref={`/browse?type=${encodeURIComponent(f.key)}`}
    />
  );
}
