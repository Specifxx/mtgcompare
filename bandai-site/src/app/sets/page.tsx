import type { Metadata } from "next";
import Link from "@/components/Link";
import { SITE } from "@/site.config";
import { canon } from "@/lib/site";
import { productsInSet, refCents, sets } from "@/lib/data";
import { money } from "@/lib/format";
import { fitTitle } from "@/lib/seo-title";
import { JsonLd } from "@/components/JsonLd";
import { abs } from "@/lib/site";
import { LINES, isMultiGame } from "@/lib/lines";
import type { GameLine } from "@/lib/site-types";

export const revalidate = 86400;
export const metadata: Metadata = {
  // "sets in order" is how people ask for this list (Rift Compare's /blog/riftbound-sets-in-order ranks for it).
  title: fitTitle([`${SITE.gameShort} Sets in Order — Card Lists & Prices`, `${SITE.gameShort} Sets in Order`]),
  description: `Every ${SITE.game} set in release order, newest first, with each set's card list, card prices, the most valuable cards and the set's total value.`,
  ...canon("/sets"),
};

export default function Sets() {
  const listed = sets().filter((s) => s.productCount > 0);
  return (
    <div>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "ItemList", name: `${SITE.gameShort} sets`, numberOfItems: listed.length, itemListElement: listed.map((s, i) => ({ "@type": "ListItem", position: i + 1, name: s.name, url: abs(`/sets/${s.slug}`) })) }} />
      <h1 className="mb-6 font-display text-3xl font-black">{SITE.gameShort} sets in order</h1>
      <p className="-mt-3 mb-6 text-sm text-muted">Newest first. Open a set for its full card list with prices.</p>
      {(isMultiGame ? LINES.map((l) => ({ line: l as GameLine | null, list: listed.filter((s) => s.line === l.id) })) : [{ line: null as GameLine | null, list: listed }]).map(({ line, list }) => (
      <section key={line?.id ?? "all"} className="mb-8">
      {line && <h2 className="mb-3 text-xl font-bold"><Link className="hover:underline" href={`/games/${line.slug}`}>{line.name} sets</Link></h2>}
      <div className="overflow-hidden rounded-xl border border-ink-700/60">
        <table className="w-full text-sm">
          <thead className="bg-ink-850 text-left text-xs uppercase text-muted">
            <tr><th className="px-3 py-2">Set</th><th className="px-3 py-2">Released</th><th className="px-3 py-2 text-right">Cards</th><th className="px-3 py-2 text-right">Set value (1 of each)</th></tr>
          </thead>
          <tbody>
            {list.map((s) => {
              const cards = productsInSet(s.id).filter((p) => p.kind === "card");
              const value = cards.reduce((a, p) => a + (refCents(p.id) ?? 0), 0);
              return (
                <tr key={s.id} className="border-t border-ink-800">
                  <td className="px-3 py-2"><Link className="link" href={`/sets/${s.slug}`}>{s.name}</Link>{s.upcoming && <span className="chip ml-2">Upcoming</span>}</td>
                  <td className="px-3 py-2 text-muted">{s.releasedOn}</td>
                  <td className="px-3 py-2 text-right">{cards.length}</td>
                  <td className="px-3 py-2 text-right font-semibold">{value ? money(value) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </section>
      ))}
    </div>
  );
}
