import type { Metadata } from "next";
import Link from "next/link";
import CardQuickLink from "@/components/CardQuickLink";
import { Breadcrumbs, InShort } from "@/components/ui";
import { DATA_TABLE } from "@/components/prose";
import { RARITIES, type Rarity } from "@/lib/constants";
import { getCardPage, getFacetCounts } from "@/lib/data";
import { RARITY_FACETS } from "@/lib/facets";
import { int, money } from "@/lib/format";
import { pageOg } from "@/lib/og/meta";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Magic: The Gathering Rarities — Mythic, Rare, Uncommon, Common, Priced",
  description:
    "Every Magic: The Gathering rarity, mythic rare to basic land and token, with how many printings each has and its most valuable card at the TCGplayer market price.",
  alternates: { canonical: "/cards/rarity" },
  openGraph: pageOg("/cards/rarity"),
};

export default async function RarityHub() {
  const counts = await getFacetCounts();
  const facets = RARITY_FACETS.filter((f) => (counts.rarity[f.key] ?? 0) > 0);
  const tops = await Promise.all(facets.map(async (f) => (await getCardPage({ rarities: [f.key as Rarity], sort: "value", page: 1, per: 24 })).items.find((c) => c.marketUsd != null) ?? null));
  return (
    <div>
      <Breadcrumbs trail={[{ href: "/cards", name: "Cards" }, { name: "Rarities" }]} />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Magic card rarities</h1>
      <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-300">
        The rarity is the symbol colour of a card&apos;s set symbol: it says how often a set prints the card, but the printing treatment (borderless, showcase, a foil etching)
        often moves the price more. See the{" "}
        <Link href="/cards" className="text-brand-400 hover:underline">
          treatments
        </Link>{" "}
        too.
      </p>
      <div className="mt-6">
        <InShort>The most valuable card of each rarity is ranked on TCGplayer&apos;s market price in US dollars, so it reads the same in every market.</InShort>
      </div>
      <div className="card-surface mt-8 overflow-x-auto">
        <table className={`${DATA_TABLE} min-w-[520px]`}>
          <thead>
            <tr>
              <th>Rarity</th>
              <th className="text-right">Printings</th>
              <th>Most valuable</th>
            </tr>
          </thead>
          <tbody>
            {facets.map((f, i) => {
              const top = tops[i];
              return (
                <tr key={f.slug}>
                  <td>
                    <Link href={`/cards/rarity/${f.slug}`} className={`font-semibold hover:underline ${RARITIES[f.key]?.tone ?? "text-white"}`}>
                      {f.label}
                    </Link>
                  </td>
                  <td className="num text-right text-slate-300">{int(counts.rarity[f.key] ?? 0)}</td>
                  <td className="text-sm text-slate-300">
                    {top?.marketUsd != null ? (
                      <>
                        <CardQuickLink slug={top.slug} className="hover:text-brand-400 hover:underline">
                          {top.name}
                          {top.label ? ` (${top.label})` : ""}
                        </CardQuickLink>{" "}
                        · <span className="num">{money(top.marketUsd, "US")}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
