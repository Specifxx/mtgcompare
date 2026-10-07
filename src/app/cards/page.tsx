import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, InShort, SectionHeader } from "@/components/ui";
import {
  CARD_TYPES,
  PRINTINGS,
  PRINTING_KEYS,
  RARITIES,
  RARITY_KEYS,
} from "@/lib/constants";
import { getCatalog } from "@/lib/data";
import { printingFacetHref, rarityFacetHref, typeFacetHref } from "@/lib/facets";
import { int, money } from "@/lib/format";
import { median } from "@/lib/selectors";
import { pageOg } from "@/lib/og/meta";

export const metadata: Metadata = {
  title: "One Piece Cards by Type, Rarity & Printing",
  description:
    "One Piece Card Game cards by rarity (Secret Rare, Super Rare, Leader…), by printing (Parallel, Manga, SP, Treasure Rare) and by card type, with typical prices.",
  alternates: { canonical: "/cards" },
  openGraph: pageOg("/cards"),
};

const PRINTING_NOTES: Record<string, string> = {
  standard: "The regular print of a card — what most decks are built from.",
  alt: "Parallel and alternate-art prints: the same card with new art, usually foil, pulled far less often.",
  manga:
    "Manga rares: art drawn from the manga's own panels, usually the scarcest pull in a set.",
  sp: "SP (special) cards: earlier sets' cards reprinted with new art in later boxes.",
  treasure:
    "Treasure Rares (TR): a special rarity in recent sets, among the scarcest pulls.",
  foil: "Special foils — Jolly Roger, Pirate, Gold and textured finishes.",
  reprint: "Reprints, mostly from the Premium Booster “The Best” sets.",
  promo:
    "Promos and event prints: tournament, release-event, pre-release and product promos.",
  don: "DON!! cards — the resource cards, collected for their art.",
};

export default async function CardsHub() {
  const cat = await getCatalog();
  const stat = (f: (c: (typeof cat.cards)[number]) => boolean) => {
    const cs = cat.cards.filter(f);
    return {
      n: cs.length,
      med: median(
        cs.map((c) => c.marketUsd).filter((v): v is number => v != null),
      ),
    };
  };
  return (
    <div>
      <Breadcrumbs trail={[{ name: "By type & rarity" }]} />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
        One Piece cards by type, rarity &amp; printing
      </h1>
      <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-300">
        Three ways to cut the card list. Rarity is printed on the card; printing
        is which version of a card it is — and printing, far more than rarity,
        decides price: a Manga or SP version of a card can cost a hundred times
        its standard print.
      </p>
      <div className="mt-6">
        <InShort>
          Medians below are TCGplayer market prices in US dollars across every
          printing in the group, so they read the same in every market.
        </InShort>
      </div>
      <section className="mt-8">
        <SectionHeader title="By printing" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PRINTING_KEYS.map((k) => {
            const s = stat((c) => c.printing === k);
            return (
              <Link
                key={k}
                href={printingFacetHref(k)}
                className="card-surface p-4 hover:border-ink-600"
              >
                <p className="flex items-center gap-2 text-lg font-bold text-white">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: PRINTINGS[k].dot }}
                  />
                  {PRINTINGS[k].label}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  {PRINTING_NOTES[k]}
                </p>
                <p className="num mt-2 text-xs text-slate-500">
                  {int(s.n)} printings · median {money(s.med, "US")}
                </p>
              </Link>
            );
          })}
        </div>
      </section>
      <section className="mt-8">
        <SectionHeader title="By rarity" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {RARITY_KEYS.map((k) => {
            const s = stat((c) => c.rarity === k);
            return (
              <Link
                key={k}
                href={rarityFacetHref(k)}
                className="card-surface p-4 hover:border-ink-600"
              >
                <p className={`text-lg font-bold ${RARITIES[k].tone}`}>
                  {RARITIES[k].label}{" "}
                  <span className="text-sm text-slate-500">({k})</span>
                </p>
                <p className="num mt-2 text-xs text-slate-500">
                  {int(s.n)} printings · median {money(s.med, "US")}
                </p>
              </Link>
            );
          })}
        </div>
      </section>
      <section className="mt-8">
        <SectionHeader title="By card type" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {CARD_TYPES.map((t) => {
            const s = stat((c) => c.cardType === t);
            return (
              <Link
                key={t}
                href={typeFacetHref(t)}
                className="card-surface p-4 hover:border-ink-600"
              >
                <p className="text-lg font-bold text-white">{t}</p>
                <p className="num mt-2 text-xs text-slate-500">
                  {int(s.n)} printings · median {money(s.med, "US")}
                </p>
              </Link>
            );
          })}
        </div>
      </section>
      <p className="mt-8 text-sm text-slate-400">
        Want the whole list on one page?{" "}
        <Link href="/cards/all" className="text-brand-400 hover:underline">
          Every card, A–Z
        </Link>
        .
      </p>
    </div>
  );
}
