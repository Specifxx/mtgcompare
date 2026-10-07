import type { Metadata } from "next";
import Link from "next/link";
import CardQuickLink from "@/components/CardQuickLink";
import { Breadcrumbs, InShort } from "@/components/ui";
import { RARITIES } from "@/lib/constants";
import { getCatalog } from "@/lib/data";
import { RARITY_FACETS } from "@/lib/facets";
import { int, money } from "@/lib/format";
import { pageOg } from "@/lib/og/meta";
import { median } from "@/lib/selectors";
import { DATA_TABLE } from "@/components/prose";

export const metadata: Metadata = {
  title: "One Piece Card Rarities — Every Rarity, Priced",
  description:
    "Every One Piece Card Game rarity — Common to Secret Rare, Treasure Rare, Leader, Promo and DON!! — with how many printings each has and their typical prices.",
  alternates: { canonical: "/cards/rarity" },
  openGraph: pageOg("/cards/rarity"),
};

export default async function RarityHub() {
  const cat = await getCatalog();
  const rows = RARITY_FACETS.map((f) => {
    const cs = cat.cards.filter((c) => c.rarity === f.key);
    const prices = cs.map((c) => c.marketUsd).filter((v): v is number => v != null);
    const top = cs.reduce<(typeof cs)[number] | null>((a, c) => ((c.marketUsd ?? -1) > (a?.marketUsd ?? -1) ? c : a), null);
    return { f, n: cs.length, med: median(prices), top };
  });
  return (
    <div>
      <Breadcrumbs trail={[{ href: "/cards", name: "By type & rarity" }, { name: "Rarities" }]} />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">One Piece card rarities</h1>
      <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-300">
        The rarity is the letter printed on the card. It says how often a card is pulled, but the printing (Parallel, Manga, SP) often moves the price
        more: see the{" "}
        <Link href="/cards" className="text-brand-400 hover:underline">
          printings
        </Link>{" "}
        too.
      </p>
      <div className="mt-6">
        <InShort>Medians are TCGplayer market prices in US dollars across every printing of that rarity, so they read the same in every market.</InShort>
      </div>
      <div className="card-surface mt-8 overflow-x-auto">
        <table className={`${DATA_TABLE} min-w-[560px]`}>
          <thead>
            <tr>
              <th>Rarity</th>
              <th className="text-right">Printings</th>
              <th className="text-right">Median</th>
              <th>Most valuable</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ f, n, med, top }) => (
              <tr key={f.slug}>
                <td>
                  <Link href={`/cards/rarity/${f.slug}`} className={`font-semibold hover:underline ${RARITIES[f.key]?.tone ?? "text-white"}`}>
                    {f.label}
                  </Link>{" "}
                  <span className="text-xs text-slate-500">({f.key})</span>
                </td>
                <td className="num text-right text-slate-300">{int(n)}</td>
                <td className="num text-right text-slate-200">{money(med, "US")}</td>
                <td className="text-sm text-slate-300">
                  {top?.marketUsd != null ? (
                    <>
                      <CardQuickLink slug={top.slug} className="hover:text-brand-400 hover:underline">
                        {top.name}
                        {top.variant ? ` (${top.variant})` : ""}
                      </CardQuickLink>{" "}
                      · <span className="num">{money(top.marketUsd, "US")}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
