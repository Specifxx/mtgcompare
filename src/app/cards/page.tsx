import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, InShort, SectionHeader } from "@/components/ui";
import { COLORS, COLOR_GROUPS, COLOR_KEYS, RARITIES, TREATMENT_BY_KEY, TREATMENT_KIND_DOT } from "@/lib/constants";
import { getFacetCounts, isIndexableTreatment } from "@/lib/data";
import { RARITY_FACETS, TREATMENT_FACETS, TYPE_FACETS } from "@/lib/facets";
import { int } from "@/lib/format";
import { pageOg } from "@/lib/og/meta";

// /cards — the taxonomy hub: every way to cut the Magic card list, with the number of listed printings in each group. Counts come from one pass of the browse
// engine over the listed class-0 rows (getFacetCounts); a group with no listed printing is not shown, so no link on this page leads to a 404.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Magic: The Gathering Cards by Colour, Type, Rarity & Treatment",
  description:
    "Magic: The Gathering cards by colour, card type, rarity (mythic, rare, uncommon, common) and printing treatment (borderless, showcase, extended art, foil etchings), with live prices.",
  alternates: { canonical: "/cards" },
  openGraph: pageOg("/cards"),
};

const KIND_TITLE: Record<string, string> = { frame: "Frames", art: "Art", promo: "Promos and stamps", edition: "Editions", serial: "Serialized", foil: "Foil patterns", language: "Languages" };

export default async function CardsHub() {
  const counts = await getFacetCounts();
  const treatments = TREATMENT_FACETS.filter((f) => isIndexableTreatment(counts.treat[f.key] ?? 0));
  const kinds = [...new Set(treatments.map((f) => TREATMENT_BY_KEY[f.key]?.kind ?? "art"))];
  return (
    <div>
      <Breadcrumbs trail={[{ name: "Cards" }]} />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Magic: The Gathering cards by colour, type, rarity &amp; treatment</h1>
      <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-300">
        Four ways to cut the card list. Colour and card type are the rules of the card; rarity is how often a set prints it; the treatment is how this particular
        printing looks (borderless, a showcase frame, extended art, a foil etching), and it often moves the price more than rarity does.
      </p>
      <div className="mt-6">
        <InShort>
          Counts are listed printings: one per product, so a card in a normal and a foil finish counts once. Open a group for its printings, most valuable first.
        </InShort>
      </div>
      <section className="mt-8">
        <SectionHeader title="By colour" action={<Link href="/colors" className="text-sm text-brand-400 hover:underline">All colours →</Link>} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {COLOR_KEYS.map((k) => (
            <Link key={k} href={`/colors/${COLORS[k].slug}`} className="card-surface p-4 hover:border-ink-600">
              <p className="flex items-center gap-2 text-lg font-bold text-white">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[k].hex }} />
                {COLORS[k].label}
              </p>
              <p className="num mt-2 text-xs text-slate-500">{int(counts.color[COLORS[k].letter] ?? 0)} printings</p>
            </Link>
          ))}
          <Link href={`/colors/${COLOR_GROUPS.colorless.slug}`} className="card-surface p-4 hover:border-ink-600">
            <p className="text-lg font-bold text-white">Colorless</p>
            <p className="num mt-2 text-xs text-slate-500">{int(counts.color.C ?? 0)} printings</p>
          </Link>
        </div>
      </section>
      <section className="mt-8">
        <SectionHeader title="By card type" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {TYPE_FACETS.filter((f) => (counts.type[f.key] ?? 0) > 0).map((f) => (
            <Link key={f.slug} href={`/cards/type/${f.slug}`} className="card-surface p-4 hover:border-ink-600">
              <p className="text-lg font-bold text-white">{f.label}</p>
              <p className="num mt-2 text-xs text-slate-500">{int(counts.type[f.key] ?? 0)} printings</p>
            </Link>
          ))}
        </div>
      </section>
      <section className="mt-8">
        <SectionHeader title="By rarity" action={<Link href="/cards/rarity" className="text-sm text-brand-400 hover:underline">Compare rarities →</Link>} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {RARITY_FACETS.filter((f) => (counts.rarity[f.key] ?? 0) > 0).map((f) => (
            <Link key={f.slug} href={`/cards/rarity/${f.slug}`} className="card-surface p-4 hover:border-ink-600">
              <p className={`text-lg font-bold ${RARITIES[f.key]?.tone ?? "text-white"}`}>{f.label}</p>
              <p className="num mt-2 text-xs text-slate-500">{int(counts.rarity[f.key] ?? 0)} printings</p>
            </Link>
          ))}
        </div>
      </section>
      {kinds.map((kind) => (
        <section key={kind} className="mt-8">
          <SectionHeader title={`By treatment: ${KIND_TITLE[kind]?.toLowerCase() ?? kind}`} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {treatments.filter((f) => (TREATMENT_BY_KEY[f.key]?.kind ?? "art") === kind).map((f) => (
              <Link key={f.slug} href={`/cards/treatment/${f.slug}`} className="card-surface p-4 hover:border-ink-600">
                <p className="flex items-center gap-2 text-base font-bold text-white">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: TREATMENT_BY_KEY[f.key]?.dot ?? TREATMENT_KIND_DOT[TREATMENT_BY_KEY[f.key]?.kind ?? "art"] }} />
                  {f.label}
                </p>
                <p className="num mt-2 text-xs text-slate-500">{int(counts.treat[f.key] ?? 0)} printings</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
      <p className="mt-8 text-sm text-slate-400">
        Looking for one card by name?{" "}
        <Link href="/cards/all" className="text-brand-400 hover:underline">
          Every card, A–Z
        </Link>{" "}
        lists each by its rules name, and{" "}
        <Link href="/keywords" className="text-brand-400 hover:underline">
          the keyword index
        </Link>{" "}
        groups them by what they do.
      </p>
    </div>
  );
}
