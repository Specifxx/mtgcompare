import Link from "next/link";
import { Callout, SimpleTable } from "@/components/blog/BlogBits";
import { money } from "../../format";
import type { Post } from "../types";

const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);

// A market-structure post for collectors who think in portfolios: which released
// sets hold the most value and how much of each sits in its top cards. All US
// dollars (TCGplayer market is a US figure), from the published set totals and
// the sets' own boards.
export const setConcentration: Post = {
  slug: "magic-set-value-concentration",
  title: () => "Which Magic Sets Hold the Most Value, and How Much Sits in the Top Cards",
  description: "The sixteen most valuable Magic: The Gathering sets by the TCGplayer market price of their printings, and how much of each set's value sits in its dearest card and its top five.",
  tags: ["market", "analysis", "collecting"],
  date: "2026-10-08",
  minutes: 6,
  related: [
    { href: "/market", label: "MTG Compare Index" },
    { href: "/sets", label: "All sets" },
    { href: "/tools/box-ev", label: "Box EV calculator" },
  ],
  build: ({ boards, top }) => {
    const rows = boards
      .filter((b) => b.top.length && b.total > 0)
      .map((b) => {
        const t1 = b.top[0]!.marketUsd ?? 0;
        const t5 = b.top.reduce((t, c) => t + (c.marketUsd ?? 0), 0);
        return { b, top1: t1 / b.total, top5: t5 / b.total, avg: b.total / Math.max(1, b.n) };
      });
    const mostConc = [...rows].sort((a, b) => b.top5 - a.top5)[0];
    const leastConc = [...rows].sort((a, b) => a.top5 - b.top5)[0];
    const richest = rows[0];
    return {
      heroCards: top.slice(0, 3),
      summary: [
        richest ? (
          <>
            <strong>{richest.b.set.name}</strong> is the most valuable set we track, at {money(richest.b.total, "US")} for all {richest.b.n.toLocaleString("en-US")} of its priced printings.
          </>
        ) : null,
        mostConc && leastConc ? (
          <>
            Among these sixteen, {mostConc.b.set.name} is the most top-heavy ({pct(mostConc.top5)} of its value in five cards); {leastConc.b.set.name} is the most spread out ({pct(leastConc.top5)}).
          </>
        ) : null,
        <>Not financial advice: a snapshot of today&apos;s prices, which move daily.</>,
      ].filter(Boolean),
      lede: (
        <p>
          <strong>How much of a Magic set&apos;s value is really in its chase cards?</strong> For every released expansion, core and masters set with a hundred or more
          priced printings, we added up the TCGplayer market price of each printing (every treatment and finish is its own printing) and took the sixteen sets with the
          highest totals. Then we measured how much of each total sits in the dearest card and in the dearest five.
        </p>
      ),
      sections: [
        {
          id: "by-set",
          title: "The sixteen most valuable sets",
          body: (
            <>
              <p>
                “Total” is the sum of the market price of every priced printing in the set. “Top card” and “Top 5” are shares of that total. Sets are listed by total value.
              </p>
              <SimpleTable
                head={["Set", "Released", "Total", "Priced printings", "Top card", "Top card share", "Top 5 share"]}
                align={["l", "l", "r", "r", "l", "r", "r"]}
                rows={rows.map((r) => [
                  <Link key="s" href={`/sets/${r.b.set.slug}`}>
                    {r.b.set.name}
                  </Link>,
                  r.b.set.releasedOn ?? "—",
                  money(r.b.total, "US"),
                  r.b.n.toLocaleString("en-US"),
                  <Link key="c" href={`/card/${r.b.top[0]!.slug}`}>
                    {r.b.top[0]!.name}
                  </Link>,
                  pct(r.top1),
                  pct(r.top5),
                ])}
              />
            </>
          ),
        },
        {
          id: "what-it-means",
          title: "What the concentration means",
          body: (
            <>
              <p>
                When most of a set&apos;s value is a handful of cards, opening packs is a lottery: most boxes miss the cards that carry the set, so the typical box returns
                less than the average box. A flatter set spreads its value over more pulls.
              </p>
              <p>
                Concentration is also a risk for holders. When one card is a large share of the set, its price is the set&apos;s price, and a reprint, a ban or a cooling of
                demand moves the whole total.
              </p>
              <Callout title="Opening versus buying singles">
                The <Link href="/tools/box-ev">Box EV calculator</Link> weighs a box&apos;s price against live singles prices for a set.
              </Callout>
            </>
          ),
        },
        {
          id: "caveats",
          title: "Caveats",
          body: (
            <ul>
              <li>Market prices are TCGplayer&apos;s, in US dollars, for near-mint copies. Other markets and conditions differ.</li>
              <li>The total counts every printing once; a set with many foils, promos or alternate frames adds each as its own printing.</li>
              <li>Item prices only: postage and tax are extra.</li>
              <li>This is a snapshot of today&apos;s prices, not a forecast and not financial advice.</li>
            </ul>
          ),
        },
      ],
    };
  },
};
