import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardFacetPage } from "@/components/CardFacetPage";
import { getCatalog } from "@/lib/data";
import { facetBySlug, pageSuffix, RARITY_FACETS } from "@/lib/facets";
import { getCountry } from "@/lib/get-country";
import { pageOg } from "@/lib/og/meta";

// /cards/rarity/[rarity] — one One Piece card rarity, from the cached catalogue
// (RiftCompare's facet pages). No generateStaticParams: rendered on demand.
type Props = { params: { rarity: string }; searchParams: { page?: string } };

export function generateMetadata({ params, searchParams }: Props): Metadata {
  const f = facetBySlug(RARITY_FACETS, params.rarity);
  if (!f) return { title: "Not found" };
  return {
    title: `One Piece ${f.title} — Prices & Full List`,
    description: `${f.intro} Every One Piece ${f.label} printing with live prices compared across stores in six markets.`,
    alternates: { canonical: `/cards/rarity/${f.slug}${pageSuffix(searchParams.page)}` },
    openGraph: pageOg(`/cards/rarity/${f.slug}${pageSuffix(searchParams.page)}`),
  };
}

export default async function Page({ params, searchParams }: Props) {
  const f = facetBySlug(RARITY_FACETS, params.rarity);
  if (!f) notFound();
  const cat = await getCatalog();
  const cards = cat.cards.filter((c) => c.rarity === f.key);
  return (
    <CardFacetPage
      facet={f}
      cards={cards}
      cat={cat}
      country={getCountry()}
      crumbs={[{ href: "/cards/rarity", label: "By rarity" }, { label: f.label }]}
      path={`/cards/rarity/${f.slug}`}
      pageParam={searchParams.page}
      siblings={RARITY_FACETS}
      siblingBase="/cards/rarity"
      browseHref={`/browse?rarity=${encodeURIComponent(f.key)}`}
    />
  );
}
