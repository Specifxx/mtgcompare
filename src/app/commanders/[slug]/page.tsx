import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { CardLinkGrid } from "@/components/CardLinkGrid";
import { CardArt } from "@/components/CardTile";
import CardQuickLink from "@/components/CardQuickLink";
import { DeckLibrary } from "@/components/decks/DeckLibrary";
import { Breadcrumbs, ColorBadge, InShort, SectionHeader, StatTile } from "@/components/ui";
import { colorsOfMask, identityName, legalityOf } from "@/lib/constants";
import { getCommanderBySlug } from "@/lib/data";
import { encodeDeckParam } from "@/lib/deck";
import { libraryRows } from "@/lib/deck-library";
import { money } from "@/lib/format";
import { getCountry } from "@/lib/get-country";
import { hasImageFor } from "@/lib/images";
import { pageOg } from "@/lib/og/meta";
import { commanderDeckPath } from "@/lib/published-decks";

// /commanders/[slug]: one commander (the Oracle slug): its rules text, every printing priced, and the library decks filed under it. Rendered per request;
// the published decks are the one Neon read a public page may make (cached under the decks tag, empty when Neon is down).
export const dynamic = "force-dynamic";

type Props = { params: { slug: string } };
const load = cache((slug: string) => getCommanderBySlug(slug).catch(() => null));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await load(params.slug);
  if (!c) return { title: "Commander not found", robots: { index: false } };
  const o = c.oracle;
  return {
    title: `${o.name} — Commander Prices, Printings & Decks`,
    description: `${o.name}, a ${identityName(o.identity).toLowerCase()} Magic commander: every printing priced across stores${c.decks.length ? ` and ${c.decks.length} published deck${c.decks.length === 1 ? "" : "s"}` : ""}.`,
    alternates: { canonical: `/commanders/${o.slug}` },
    openGraph: pageOg(`/commanders/${o.slug}`),
  };
}

export default async function CommanderPage({ params }: Props) {
  const country = getCountry();
  const c = await load(params.slug);
  if (!c) notFound();
  const { oracle: o, printings } = c;
  const lead = printings.find((p) => hasImageFor(p)) ?? printings[0];
  const legal = legalityOf(o.legal, "commander");
  const deckLink = `/deck?list=${encodeDeckParam(`Commander\n1 ${o.name}`)}`;
  const rows = c.decks.length ? await libraryRows(c.decks).catch(() => []) : [];
  const cheapest = printings.reduce<number | null>((m, p) => (p.valueUsd != null && (m == null || p.valueUsd < m) ? p.valueUsd : m), null);
  return (
    <div>
      <Breadcrumbs trail={[{ href: "/commanders", name: "Commanders" }, { name: o.name }]} />
      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        {lead ? (
          <CardQuickLink slug={lead.slug} className="block max-w-[240px]">
            <CardArt id={lead.id} hasImage={hasImageFor(lead)} alt={`${o.name} Magic commander card`} size="large" />
          </CardQuickLink>
        ) : (
          <div />
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
            {o.name} {o.manaCost ? <span className="whitespace-nowrap text-base font-normal text-slate-400">{o.manaCost}</span> : null}
          </h1>
          <p className="mt-1 text-sm text-slate-400">{o.typeLine}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {colorsOfMask(o.identity).map((col) => (
              <ColorBadge key={col} color={col} />
            ))}
            {o.identity === 0 ? <span className="chip border border-ink-700 bg-ink-850 text-slate-300">Colorless</span> : null}
            {legal !== "unknown" ? <span className="chip border border-ink-700 bg-ink-850 text-slate-300">Commander: {legal.replace("_", " ")}</span> : null}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Identity" value={identityName(o.identity)} tone="text-white" />
            <StatTile label="EDHREC rank" value={o.edhrecRank != null ? `#${o.edhrecRank.toLocaleString("en-US")}` : "—"} tone="text-white" />
            <StatTile label="Cheapest printing" value={cheapest != null ? money(cheapest, "US") : "—"} sub="TCGplayer" />
            <StatTile label="Printings" value={o.nPrint} tone="text-white" />
          </div>
          {o.oracleText ? (
            <div className="card-surface mt-4 p-4 text-[15px] leading-relaxed text-slate-200">
              {o.oracleText.split("\n").map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          ) : null}
          {o.keywords.length ? (
            <p className="mt-2 text-xs text-slate-400">
              Keywords:{" "}
              {o.keywords.map((k, i) => (
                <span key={k}>
                  {i ? ", " : ""}
                  <Link href={`/keywords/${k}`} className="text-brand-400 hover:underline">
                    {k.replace(/-/g, " ")}
                  </Link>
                </span>
              ))}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            {lead ? (
              <CardQuickLink slug={lead.slug} className="btn-primary">
                Compare prices
              </CardQuickLink>
            ) : null}
            <Link href={deckLink} className="btn-ghost">
              Price a deck with this commander
            </Link>
          </div>
        </div>
      </div>

      {printings.length ? (
        <section className="mt-10">
          <SectionHeader title="Every printing" sub="highest TCGplayer market first; a card with only a thin single listing shows its low" />
          <CardLinkGrid cards={printings} country={country} />
        </section>
      ) : null}

      {rows.length ? (
        <section className="mt-10">
          <SectionHeader title={`${o.name} decks`} sub="published by players, priced now in your market" />
          <DeckLibrary decks={rows} commanders={[]} colors={[...new Set(rows.flatMap((d) => d.colors))]} />
          <p className="mt-3 text-sm text-slate-400">
            <Link href={commanderDeckPath(o.slug)} className="font-semibold text-brand-400 hover:underline">
              Every {o.name} deck →
            </Link>
          </p>
        </section>
      ) : null}

      <div className="mt-10">
        <InShort>
          A Commander deck is a commander and 99 other cards, one copy of each (except basic lands), all inside the commander&apos;s colour identity. Paste a
          full list into the{" "}
          <Link href={deckLink} className="text-brand-400 hover:underline">
            deck price calculator
          </Link>{" "}
          to price it and check it against the format.
        </InShort>
      </div>
    </div>
  );
}
