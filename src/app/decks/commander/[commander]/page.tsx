import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/ui";
import { DeckLibrary } from "@/components/decks/DeckLibrary";
import { getLibraryDecks } from "@/lib/data";
import { libraryRows } from "@/lib/deck-library";
import { commanderDeckPath } from "@/lib/published-decks";
import { pageOg } from "@/lib/og/meta";

// Decks filed under one commander (/decks/commander/<Oracle slug>). Rendered per request, like the library it filters (one cached Neon entry, purged
// on publish); noindex while it holds fewer than two decks. A deck that names the card as its partner is filed under its first commander only.
export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return [];
}

const loadDecks = cache(async (commander: string) => {
  const all = await getLibraryDecks().catch(() => null);
  return all ? all.filter((d) => d.commanderSlug === commander) : null;
});

export async function generateMetadata({ params }: { params: { commander: string } }): Promise<Metadata> {
  const decks = await loadDecks(params.commander);
  const name = decks?.[0]?.commanderName;
  if (!name) return { title: "Commander decks", robots: { index: false } };
  return {
    title: `${name} Decks — Commander Decklists Priced`,
    description: `Magic: The Gathering ${name} Commander decks published by players, each priced card by card at the cheapest store in your market.`,
    alternates: { canonical: commanderDeckPath(params.commander) },
    openGraph: pageOg(commanderDeckPath(params.commander)),
    ...(decks!.length < 2 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function CommanderDecksPage({ params }: { params: { commander: string } }) {
  const decks = await loadDecks(params.commander);
  if (!decks?.length) notFound();
  const rows = await libraryRows(decks);
  const name = rows[0]!.commanderName;
  const colors = [...new Set(rows.flatMap((d) => d.colors))];
  return (
    <div>
      <Breadcrumbs trail={[{ href: "/decks", name: "Decks" }, { name: `${name} decks` }]} />
      <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">{name} decks</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
        Every published deck built around {name}, priced in your market: each card at its cheapest in-stock store, before postage.{" "}
        <Link href={`/commanders/${params.commander}`} className="font-semibold text-brand-400 hover:underline">
          About {name} →
        </Link>
      </p>
      <div className="mt-5">
        <DeckLibrary decks={rows} commanders={[]} colors={colors} />
      </div>
      <p className="mt-6 text-sm text-slate-400">
        <Link href="/decks" className="font-semibold text-brand-400 hover:underline">
          ← Every deck
        </Link>
      </p>
    </div>
  );
}
