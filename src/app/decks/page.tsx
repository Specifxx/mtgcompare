import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { Breadcrumbs } from "@/components/ui";
import { HubIntro } from "@/components/HubIntro";
import { RelatedGuides } from "@/components/RelatedGuides";
import { DeckLibrary } from "@/components/decks/DeckLibrary";
import { libraryRows } from "@/lib/deck-library";
import { guidesForTool } from "@/lib/content/tool-guides";
import { getLibraryDecks, type LibraryDeckRow } from "@/lib/data";
import { pageOg } from "@/lib/og/meta";

// The public deck library (RiftCompare's /decks). ISR: one render an hour, and
// publishing revalidates it on demand. Filters and sort run client-side.
export const revalidate = 3600;

// One read per render, shared by generateMetadata and the page (React's request
// cache over the self-cached loader — not a second data cache). A failed read
// is null, not an empty library: the page stays indexable on a blip.
const loadDecks = cache(async (): Promise<LibraryDeckRow[] | null> => getLibraryDecks().catch(() => null));

// Noindexed while the library is empty: with no decks it is a heading, an
// intro and a button. The first published deck makes it indexable.
export async function generateMetadata(): Promise<Metadata> {
  const decks = await loadDecks();
  return {
    title: "One Piece Decks — Player Decklists Priced Across Stores",
    description: "One Piece Card Game decks published by players, each priced card by card at the cheapest store in your market. Filter by Leader, colour and budget.",
    alternates: { canonical: "/decks" },
    openGraph: pageOg("/decks"),
    ...(decks !== null && decks.length === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function DecksPage() {
  const rows = await libraryRows((await loadDecks()) ?? []);
  const leaders = [...new Map(rows.map((d) => [d.leaderSlug, { slug: d.leaderSlug, name: d.leaderName }])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const colors = [...new Set(rows.flatMap((d) => d.colors))].sort();

  return (
    <div>
      <Breadcrumbs trail={[{ name: "Decks" }]} />
      <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">One Piece decks</h1>
      <HubIntro path="/decks" />

      {rows.length === 0 ? (
        <section className="card-surface mt-6 p-8 text-center">
          <h2 className="text-lg font-bold text-white">No decks published yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">Build your deck in the deck builder, price it, and publish it here — with your name on it.</p>
          <Link href="/deck" className="btn-primary mt-5 inline-flex">
            Publish the first deck →
          </Link>
        </section>
      ) : (
        <>
          <nav aria-label="Decks by Leader" className="mt-4 flex flex-wrap gap-2">
            {leaders.map((l) => (
              <Link key={l.slug} href={`/decks/leader/${l.slug}`} className="chip border border-ink-700 hover:border-brand-500">
                {l.name} decks
              </Link>
            ))}
          </nav>
          <div className="mt-5">
            <DeckLibrary decks={rows} leaders={leaders} colors={colors} />
          </div>
          <p className="mt-6 text-sm text-slate-400">
            Got a list?{" "}
            <Link href="/deck" className="font-semibold text-brand-400 hover:underline">
              Price and publish it in the deck builder →
            </Link>
          </p>
        </>
      )}

      <RelatedGuides guides={guidesForTool("/decks")} className="card-surface mt-8 p-5" />
    </div>
  );
}
