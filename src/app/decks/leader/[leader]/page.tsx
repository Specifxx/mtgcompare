import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/ui";
import { DeckLibrary } from "@/components/decks/DeckLibrary";
import { getLibraryDecks } from "@/lib/data";
import { libraryRows } from "@/lib/deck-library";
import { pageOg } from "@/lib/og/meta";

// Decks filed under one Leader (RiftCompare's /decks/legend/[legend]). ISR an
// hour with an EMPTY generateStaticParams (no build-time database load);
// noindex while it holds fewer than two decks.
export const revalidate = 3600;

export async function generateStaticParams() {
  return [];
}

const loadDecks = cache(async (leader: string) => {
  const all = await getLibraryDecks().catch(() => null);
  return all ? all.filter((d) => d.leaderSlug === leader) : null;
});

export async function generateMetadata({ params }: { params: { leader: string } }): Promise<Metadata> {
  const decks = await loadDecks(params.leader);
  const name = decks?.[0]?.leaderName;
  if (!name) return { title: "Leader decks", robots: { index: false } };
  return {
    title: `${name} Decks — One Piece Decklists Priced`,
    description: `One Piece Card Game ${name} decks published by players, each priced card by card at the cheapest store in your market.`,
    alternates: { canonical: `/decks/leader/${params.leader}` },
    openGraph: pageOg(`/decks/leader/${params.leader}`),
    ...(decks!.length < 2 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function LeaderDecksPage({ params }: { params: { leader: string } }) {
  const decks = await loadDecks(params.leader);
  if (!decks?.length) notFound();
  const rows = await libraryRows(decks);
  const name = rows[0]!.leaderName;
  const colors = [...new Set(rows.flatMap((d) => d.colors))].sort();
  return (
    <div>
      <Breadcrumbs trail={[{ href: "/decks", name: "Decks" }, { name: `${name} decks` }]} />
      <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">{name} decks</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
        Every published deck built around {name}, priced in your market: each card at its cheapest in-stock store, before postage.
      </p>
      <div className="mt-5">
        <DeckLibrary decks={rows} leaders={[]} colors={colors} />
      </div>
      <p className="mt-6 text-sm text-slate-400">
        <Link href="/decks" className="font-semibold text-brand-400 hover:underline">
          ← Every deck
        </Link>
      </p>
    </div>
  );
}
