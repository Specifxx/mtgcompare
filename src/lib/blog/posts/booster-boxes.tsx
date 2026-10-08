import Link from "next/link";
import { Callout, SimpleTable } from "@/components/blog/BlogBits";
import { COUNTRIES } from "../../country";
import { money, shortDate } from "../../format";
import { headline } from "../../price";
import type { Post } from "../types";
import { medianOf, monthYear } from "../util";

// The box types TCGplayer names in a product title, in the order a title is read.
const BOX_TYPES = ["Collector", "Play", "Draft", "Set", "Jumpstart"] as const;
const typeOf = (name: string): string => BOX_TYPES.find((t) => new RegExp(`\\b${t}\\b`, "i").test(name)) ?? "Other";

export const boosterBoxes: Post = {
  slug: "magic-booster-box-prices",
  title: ({ cat }) => `Magic Booster Box Prices: The Dearest Boxes (${monthYear(cat.pricesAt)})`,
  description: "The most expensive Magic: The Gathering booster boxes right now: TCGplayer market price, the cheapest in-stock box in your market, the cost per pack where the pack count is known, and how box types compare.",
  tags: ["sealed", "booster box", "prices"],
  date: "2026-10-08",
  minutes: 5,
  related: [
    { href: "/sealed", label: "Sealed products" },
    { href: "/tools/box-ev", label: "Box EV calculator" },
    { href: "/release-dates", label: "Release dates" },
  ],
  build: ({ boxes, setById, top, country }) => {
    const c = COUNTRIES[country];
    const list = boxes.filter((b) => b.marketUsd != null).slice(0, 20);
    const dearest = list[0];
    const byType = new Map<string, number[]>();
    for (const b of boxes) if (b.marketUsd != null) byType.set(typeOf(b.name), [...(byType.get(typeOf(b.name)) ?? []), b.marketUsd]);
    const types = [...byType.entries()].map(([type, xs]) => ({ type, n: xs.length, median: medianOf(xs)! })).sort((a, b) => b.median - a.median);
    const rows = list.map((s) => {
      const h = headline(s, country);
      const set = s.setId != null ? setById.get(s.setId) : undefined;
      const per = s.packCount && s.marketUsd ? Math.round(s.marketUsd / s.packCount) : null;
      return [
        <Link key="n" href={`/sealed/${s.slug}`}>
          {s.name}
        </Link>,
        <span key="d" className="whitespace-nowrap text-slate-400">{shortDate(s.releasedOn ?? set?.releasedOn)}</span>,
        money(s.marketUsd, "US"),
        per ? money(per, "US") : "—",
        h.kind === "listing" ? `${money(h.cents, country)}${h.stores ? ` (${h.stores})` : ""}` : "—",
      ];
    });
    return {
      heroCards: top.slice(0, 3),
      summary: [
        dearest ? (
          <>
            <strong>The most expensive booster box</strong> we track is <Link href={`/sealed/${dearest.slug}`}>{dearest.name}</Link> at {money(dearest.marketUsd, "US")} on
            TCGplayer.
          </>
        ) : null,
        types[0] && types.length > 1 ? (
          <>
            Among the {boxes.length} dearest boxes, {types[0].type.toLowerCase()} boxes have the highest median price, at {money(Math.round(types[0].median), "US")}.
          </>
        ) : null,
        <>Each row links to that box&apos;s page with every store&apos;s live price in {c.place}.</>,
      ].filter(Boolean),
      lede: (
        <p>
          <strong>A Magic booster box can cost anything from retail price to the price of a car</strong>, depending on the set, the box type and whether it is still in
          print. This page lists the dearest booster boxes, with TCGplayer&apos;s market price and the cheapest in-stock box we track in your market, rebuilt from our
          price data each time it is generated.
        </p>
      ),
      sections: [
        {
          id: "table",
          title: "The 20 most expensive booster boxes",
          body: (
            <>
              <p>
                “Market” is TCGplayer&apos;s market price in US dollars. “Per pack” divides it by the pack count where our data has one. The last column is the cheapest
                in-stock box in {c.place} today, with how many stores have it.
              </p>
              <SimpleTable head={["Box", "Released", "Market (US$)", "Per pack", `Cheapest in ${c.code}`]} rows={rows} align={["l", "l", "r", "r", "r"]} />
            </>
          ),
        },
        ...(types.length > 1
          ? [
              {
                id: "types",
                title: "Box types compared",
                body: (
                  <>
                    <p>The same list grouped by the box type in the product name, with the median market price of the boxes of each type among the {boxes.length} dearest:</p>
                    <SimpleTable
                      head={["Type", "Boxes", "Median market (US$)"]}
                      align={["l", "r", "r"]}
                      rows={types.map((t) => [t.type, t.n, money(Math.round(t.median), "US")])}
                    />
                    <p>Collector, play, draft and set boxes hold different packs: more or fewer packs, and different mixes of foils and special treatments. Compare the pack count before the price.</p>
                  </>
                ),
              },
            ]
          : []),
        {
          id: "worth-opening",
          title: "Is a box worth opening?",
          body: (
            <Callout title="Box EV">
              Usually not as an investment: most boxes contain few of a set&apos;s most valuable cards. The <Link href="/tools/box-ev">Box EV calculator</Link> puts a
              box&apos;s price next to what its contents are worth in singles at today&apos;s prices.
            </Callout>
          ),
        },
        {
          id: "buying",
          title: "Buying a box: what to check",
          body: (
            <ul>
              <li>Check the box type in the name: collector, play, draft and set boxes of the same set are different products at different prices.</li>
              <li>Make sure it is the English product; stores list other languages too.</li>
              <li>Pre-orders lock a price but tie up money for weeks; compare them with the box&apos;s market price after release on its page here.</li>
              <li>Postage on a box is often large: compare delivered totals at checkout, not just the item price.</li>
            </ul>
          ),
        },
      ],
    };
  },
};
