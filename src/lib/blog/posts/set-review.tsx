import Link from "next/link";
import { Callout, CardTable, SimpleTable } from "@/components/blog/BlogBits";
import { PRINTINGS } from "../../constants";
import { COUNTRIES } from "../../country";
import { longDate, money } from "../../format";
import { headline } from "../../price";
import type { Post } from "../types";
import { byMarketDesc } from "../util";

// One set's chase cards and box value, for a specific booster set. Each review
// is fixed to its set (the slug names it), so it stays correct when newer sets
// release; the figures refresh with the prices.
export function setReview(code: string, slug: string, date: string): Post {
  return {
    slug,
    title: ({ cat }) => {
      const s = cat.sets.find((x) => x.code === code);
      return s ? `${s.name} (${code}) Chase Cards & Prices: Is a Box Worth It?` : `${code} Chase Cards & Prices`;
    },
    description: `The most valuable cards in One Piece ${code}, how much of the set's value they hold, what a booster box costs, and whether opening one makes sense — from live prices.`,
    tags: ["set review", code.toLowerCase(), "chase cards"],
    date,
    minutes: 7,
    related: [
      { href: "/sets", label: "Every set" },
      { href: "/tools/box-ev", label: "Box EV calculator" },
      { href: "/sealed?kind=Booster+Box", label: "Booster box prices" },
    ],
    build: ({ cat, sealed, country }) => {
      const set = cat.sets.find((x) => x.code === code);
      if (!set) return { heroCards: [], summary: [], lede: <p>This set is not in the catalogue yet.</p>, sections: [] };
      const c = COUNTRIES[country];
      const cards = cat.cards.filter((x) => x.setId === set.id);
      const valued = cards.filter((x) => x.marketUsd != null).sort(byMarketDesc);
      const total = valued.reduce((a, x) => a + x.marketUsd!, 0);
      const top10 = valued.slice(0, 10);
      const top10Value = top10.reduce((a, x) => a + x.marketUsd!, 0);
      const box = sealed.find((s) => s.setId === set.id && s.kind === "Booster Box");
      const boxH = box ? headline(box, country) : null;
      const counts = new Map<string, number>();
      for (const x of cards) counts.set(x.printing, (counts.get(x.printing) ?? 0) + 1);
      const leaders = cards.filter((x) => x.cardType === "Leader" && x.printing === "standard");
      const under1 = valued.filter((x) => x.marketUsd! < 100).length;
      return {
        heroCards: valued.slice(0, 3),
        summary: [
          valued[0] ? (
            <>
              <strong>Top chase card:</strong> <Link href={`/card/${valued[0].slug}`}>{valued[0].name}{valued[0].variant ? ` (${valued[0].variant})` : ""}</Link> at{" "}
              {money(valued[0].marketUsd, "US")}.
            </>
          ) : null,
          total ? (
            <>
              <strong>The ten most valuable printings hold {Math.round((top10Value / total) * 100)}%</strong> of the set&apos;s total value ({money(total, "US")} across{" "}
              {valued.length} priced printings).
            </>
          ) : null,
          box?.marketUsd ? (
            <>
              <strong>A booster box</strong> sells for {money(box.marketUsd, "US")} on TCGplayer
              {boxH?.kind === "listing" ? `; the cheapest in ${c.place} is ${money(boxH.cents, country)}` : ""}.
            </>
          ) : null,
          <>{under1} of its {valued.length} priced printings are worth under US$1 — buy singles for the cards you want.</>,
        ].filter(Boolean),
        lede: (
          <p>
            <strong>{set.name} ({code})</strong> {set.releasedOn ? `released on ${longDate(set.releasedOn)}` : "is an upcoming set"} with {cards.length} printings
            on TCGplayer — {counts.get("standard") ?? 0} standard prints plus {cards.length - (counts.get("standard") ?? 0)} alternate-art, Manga, SP, foil and
            event printings. Like every One Piece set, its value is concentrated in a few of them. Here is where it sits, from OP Compare&apos;s live prices.
          </p>
        ),
        sections: [
          {
            id: "chase",
            title: `The ten most valuable ${code} cards`,
            body: <CardTable cards={top10} setById={cat.setById} country={country} />,
          },
          {
            id: "printings",
            title: "What is in the set",
            body: (
              <>
                <SimpleTable
                  head={["Printing", "Count"]}
                  align={["l", "r"]}
                  rows={[...counts.entries()].sort((a, b) => (PRINTINGS[a[0]]?.order ?? 9) - (PRINTINGS[b[0]]?.order ?? 9)).map(([k, n]) => [PRINTINGS[k]?.label ?? k, n])}
                />
                {leaders.length ? (
                  <p>
                    Leaders in {code}:{" "}
                    {leaders.map((l, i) => (
                      <span key={l.id}>
                        {i ? ", " : ""}
                        <Link href={`/card/${l.slug}`}>{l.name}</Link>
                      </span>
                    ))}
                    .
                  </p>
                ) : null}
              </>
            ),
          },
          {
            id: "box",
            title: "Is a box worth opening?",
            body: (
              <>
                <p>
                  {box?.marketUsd && box.packCount
                    ? `At ${money(box.marketUsd, "US")} for ${box.packCount} packs, each pack costs about ${money(Math.round(box.marketUsd / box.packCount), "US")}. `
                    : ""}
                  The set&apos;s total value is spread across {valued.length} printings, but a single box contains only a small slice of them, and most boxes
                  contain none of the top ten. The expected haul of a box is dominated by commons and rares worth cents.
                </p>
                <Callout title="Our view">
                  Open boxes for the fun of opening. If you want particular cards — a Leader, a playset of a staple, one chase art — buying them single is almost
                  always cheaper. <Link href={`/sets/${set.slug}`}>The full {code} card list</Link> shows every card&apos;s cheapest price in {c.place}.
                </Callout>
              </>
            ),
          },
        ],
      };
    },
  };
}
