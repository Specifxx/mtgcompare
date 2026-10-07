import Link from "next/link";
import { Callout, SimpleTable } from "@/components/blog/BlogBits";
import { COUNTRIES } from "../../country";
import { money, shortDate } from "../../format";
import { headline } from "../../price";
import type { Post } from "../types";
import { byMarketDesc, monthYear } from "../util";

export const boosterBoxes: Post = {
  slug: "one-piece-booster-box-prices",
  title: ({ cat }) => `One Piece Booster Box Prices: Every Set Compared (${monthYear(cat.pricesAt)})`,
  description: "Every One Piece booster box side by side: TCGplayer market price, the cheapest in-stock box in your market, the cost per pack, and which boxes have climbed since release.",
  tags: ["sealed", "booster box", "prices"],
  date: "2026-10-03",
  minutes: 6,
  related: [
    { href: "/sealed", label: "Sealed products" },
    { href: "/tools/box-ev", label: "Box EV calculator" },
    { href: "/release-dates", label: "Release dates" },
  ],
  build: ({ cat, sealed, country }) => {
    const c = COUNTRIES[country];
    const boxes = sealed
      .filter((s) => s.kind === "Booster Box" && s.setId != null && cat.setById.get(s.setId!)?.releasedOn)
      .map((s) => ({ s, set: cat.setById.get(s.setId!)! }))
      .filter((x) => x.set.releasedOn! <= new Date().toISOString().slice(0, 10))
      .sort((a, b) => b.set.releasedOn!.localeCompare(a.set.releasedOn!));
    const priced = boxes.filter((b) => b.s.marketUsd != null);
    const cheapest = [...priced].sort((a, b) => a.s.marketUsd! - b.s.marketUsd!)[0];
    const dearest = [...priced].sort((a, b) => b.s.marketUsd! - a.s.marketUsd!)[0];
    const newest = boxes[0];
    const main = priced.filter((b) => b.set.kind === "booster");
    const recent = main.slice(0, 4);
    const recentAvg = recent.length ? recent.reduce((a, b) => a + b.s.marketUsd!, 0) / recent.length : null;
    const older = main.slice(4);
    const olderAvg = older.length ? older.reduce((a, b) => a + b.s.marketUsd!, 0) / older.length : null;
    const heroSet = newest?.set;
    const heroCards = heroSet ? cat.cards.filter((x) => x.setId === heroSet.id).sort(byMarketDesc).slice(0, 3) : [];
    const rows = boxes.map(({ s, set }) => {
      const h = headline(s, country);
      const per = s.packCount && s.marketUsd ? Math.round(s.marketUsd / s.packCount) : null;
      return [
        <Link key="n" href={`/sealed/${s.slug}`}>
          {set.name} <span className="text-xs text-slate-500">{set.code}</span>
        </Link>,
        <span key="d" className="whitespace-nowrap text-slate-400">{shortDate(set.releasedOn)}</span>,
        money(s.marketUsd, "US"),
        per ? money(per, "US") : "—",
        h.kind === "listing" ? `${money(h.cents, country)}${h.stores ? ` (${h.stores})` : ""}` : "—",
      ];
    });
    return {
      heroCards,
      summary: [
        cheapest ? (
          <>
            <strong>Cheapest booster box right now:</strong> <Link href={`/sealed/${cheapest.s.slug}`}>{cheapest.set.name}</Link> at {money(cheapest.s.marketUsd, "US")} on
            TCGplayer.
          </>
        ) : null,
        dearest ? (
          <>
            <strong>Most expensive:</strong> <Link href={`/sealed/${dearest.s.slug}`}>{dearest.set.name}</Link> at {money(dearest.s.marketUsd, "US")} — older sets climb once
            they are out of print.
          </>
        ) : null,
        recentAvg && olderAvg ? (
          <>
            The four newest main-set boxes average <strong>{money(Math.round(recentAvg), "US")}</strong>; older main sets average{" "}
            <strong>{money(Math.round(olderAvg), "US")}</strong>.
          </>
        ) : null,
        <>Each row links to that box&apos;s page with every store&apos;s live price in {c.place}.</>,
      ].filter(Boolean),
      lede: (
        <p>
          <strong>A One Piece booster box costs very different amounts depending on the set</strong> — a box still in print sells close to its retail price,
          while a box from an early set can cost several times more once distribution dries up. This page lists every English booster box with TCGplayer&apos;s
          market price and the cheapest in-stock box we track in your market, rebuilt from our price data each time it is generated.
        </p>
      ),
      sections: [
        {
          id: "table",
          title: "Every booster box, newest first",
          body: (
            <>
              <p>
                “Market” is TCGplayer&apos;s market price in US dollars. “Per pack” divides it by the pack count where the count is certain (24 packs for a
                main booster set). The last column is the cheapest in-stock box in {c.place} today, with how many stores have it.
              </p>
              <SimpleTable head={["Set", "Released", "Market (US$)", "Per pack", `Cheapest in ${c.code}`]} rows={rows} align={["l", "l", "r", "r", "r"]} />
            </>
          ),
        },
        {
          id: "why-prices-differ",
          title: "Why box prices drift apart",
          body: (
            <>
              <p>
                A set&apos;s box price follows its chase cards. When a set has a run of valuable Manga, SP or Parallel cards, opening its boxes is worth more on
                average and the box price rises with it; when its chase cards fall, so does the box. Print runs matter too: early One Piece sets are widely reported to have had
                smaller print runs than recent ones, and a box that is no longer printed only gets scarcer.
              </p>
              <Callout title="Is a box worth opening?">
                Usually not as an investment — most boxes contain none of a set&apos;s most valuable cards. The <Link href="/tools/box-ev">box EV
                calculator</Link> puts a box&apos;s price next to its expected value: what the pulls are worth on average, at pull rates set low on purpose.
              </Callout>
            </>
          ),
        },
        {
          id: "buying",
          title: "Buying a box: what to check",
          body: (
            <ul>
              <li>Make sure it is the English box. Japanese boxes are a different product at a different price, and stores list both.</li>
              <li>Romance Dawn (OP01) came in two waves, which TCGplayer lists as Wave 1 – Blue and Wave 2 – White; they are priced separately, so check which one a listing is.</li>
              <li>Pre-orders lock a price but tie up money for weeks; compare them with the box&apos;s market price after release on its page here.</li>
              <li>Postage on a box is often large — compare delivered totals at checkout, not just the item price.</li>
            </ul>
          ),
        },
      ],
    };
  },
};
