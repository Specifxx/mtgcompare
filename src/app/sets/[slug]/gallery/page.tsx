import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FilterableCardGallery } from "@/components/FilterableCardGallery";
import { Breadcrumbs, JsonLd } from "@/components/ui";
import { getCatalog } from "@/lib/data";
import { int, longDate } from "@/lib/format";
import { getCountry } from "@/lib/get-country";
import { setGalleryDescription, setGalleryTitle } from "@/lib/gallery-seo";
import { breadcrumbLd } from "@/lib/jsonld";
import { pageOg } from "@/lib/og/meta";

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const cat = await getCatalog();
  const s = cat.setBySlug.get(params.slug);
  if (!s) return { title: "Set not found" };
  const n = cat.cards.filter((c) => c.setId === s.id).length;
  const upcoming = !!s.releasedOn && s.releasedOn > new Date().toISOString().slice(0, 10);
  return {
    title: { absolute: `${setGalleryTitle(s.name, s.code, n)} | OP Compare`.length <= 60 ? `${setGalleryTitle(s.name, s.code, n)} | OP Compare` : setGalleryTitle(s.name, s.code, n) },
    description: setGalleryDescription(s.name, s.code, n, upcoming),
    alternates: { canonical: `/sets/${s.slug}/gallery` },
    openGraph: pageOg(`/sets/${s.slug}/gallery`),
    // A pre-release set with nothing revealed has no gallery to index.
    ...(n === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

// Every printing of a set as art, filterable in the browser: works before the
// set releases (it shows what has been revealed so far).
export default async function SetGalleryPage({ params }: Props) {
  const country = getCountry();
  const cat = await getCatalog();
  const set = cat.setBySlug.get(params.slug);
  if (!set) notFound();
  const cards = cat.cards.filter((c) => c.setId === set.id);
  const upcoming = !!set.releasedOn && set.releasedOn > new Date().toISOString().slice(0, 10);
  return (
    <div>
      <Breadcrumbs trail={[{ href: "/sets", name: "Sets" }, { href: `/sets/${set.slug}`, name: set.name }, { name: "Gallery" }]} />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">{set.name} card gallery</h1>
      <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-300">
        {upcoming ? (
          <>
            {set.name} ({set.code}) releases {longDate(set.releasedOn)}. {int(cards.length)} {cards.length === 1 ? "card has" : "cards have"} been revealed so far; the gallery fills in as more appear.
          </>
        ) : (
          <>
            Every printing in {set.name} ({set.code}): {int(cards.length)} cards including every Parallel, Manga and SP version, each with the cheapest in-stock price in your market.
          </>
        )}{" "}
        For the list with prices and the set&apos;s sealed product, see the{" "}
        <Link href={`/sets/${set.slug}`} className="text-brand-400 hover:underline">
          {set.code} set page
        </Link>
        .
      </p>
      {cards.length ? (
        <FilterableCardGallery cards={cards} country={country} setCode={set.code} initialCount={60} />
      ) : (
        <p className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-6 text-center text-sm text-slate-400">No cards have been revealed for this set yet.</p>
      )}
    </div>
  );
}
