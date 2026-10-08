import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FilterableCardGallery } from "@/components/FilterableCardGallery";
import { Breadcrumbs, JsonLd } from "@/components/ui";
import { getCardsByIds, getSetBySlug, getSetChecklist } from "@/lib/data";
import { int, longDate } from "@/lib/format";
import { getCountry } from "@/lib/get-country";
import { setGalleryDescription, setGalleryTitle } from "@/lib/gallery-seo";
import { breadcrumbLd } from "@/lib/jsonld";
import { pageOg } from "@/lib/og/meta";

// Every route that reaches the published data is dynamic: a build reads no data host (CLAUDE.md, contract C26).
export const dynamic = "force-dynamic";

type Props = { params: { slug: string } };

/** The most cards one gallery sends to the browser (about 700 B each); a bigger set links to its list. */
const GALLERY_CAP = 2000;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = await getSetBySlug(params.slug);
  if (!s) return { title: "Set not found" };
  const n = s.cardCount;
  const upcoming = !!s.releasedOn && s.releasedOn > new Date().toISOString().slice(0, 10);
  return {
    title: { absolute: `${setGalleryTitle(s.name, s.code, n)} | MTG Compare`.length <= 60 ? `${setGalleryTitle(s.name, s.code, n)} | MTG Compare` : setGalleryTitle(s.name, s.code, n) },
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
  const set = await getSetBySlug(params.slug);
  if (!set) notFound();
  // The checklist is every listed printing in collector order (THIN included); the tiles are read for the first GALLERY_CAP of them.
  const checklist = await getSetChecklist(set.id, country);
  const byId = await getCardsByIds(checklist.slice(0, GALLERY_CAP).map((x) => x.id));
  const cards = checklist.flatMap((x) => byId.get(x.id) ?? []);
  const upcoming = !!set.releasedOn && set.releasedOn > new Date().toISOString().slice(0, 10);
  return (
    <div>
      <Breadcrumbs trail={[{ href: "/sets", name: "Sets" }, { href: `/sets/${set.slug}`, name: set.name }, { name: "Gallery" }]} />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">{set.name} card gallery</h1>
      <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-300">
        {upcoming ? (
          <>
            {set.name} ({set.code}) releases {longDate(set.releasedOn)}. {int(checklist.length)} {checklist.length === 1 ? "card has" : "cards have"} been revealed so far; the gallery fills in as more appear.
          </>
        ) : (
          <>
            Every printing in {set.name} ({set.code}): {int(checklist.length)} cards including every Borderless, Extended Art, Showcase and foil-pattern version, each with the cheapest in-stock price in your market.{checklist.length > cards.length ? ` The first ${int(cards.length)} are shown here; the set page lists them all.` : ""}
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
