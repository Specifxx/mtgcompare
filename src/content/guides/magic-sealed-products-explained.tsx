// Guide: Magic sealed products explained. What each kind is (general facts, Star Trek's contents as Wizards lists them for the
// detail), today's from-price of each in the region (the cheapest open product of each family), and how many products of each type
// are open here today (typeSummary).
import Link from "next/link";
import { money } from "@/lib/format";
import type { RegionInfo } from "@/lib/regions";
import { FAMILY, type FamilyKey } from "../live";
import type { GuideData } from "./data";
import { GUIDE_BY_SLUG } from "./index";
import { GuideBody, guideHref, Lede, LiveBlock, NoneYet, PriceTable, Prose, StackTable, storesPhrase, whereToBuy, type BodyProps, type GuideOutline } from "./kit";

const GUIDE = GUIDE_BY_SLUG.get("magic-sealed-products-explained")!;

export const KINDS: { key: FamilyKey; what: string }[] = [
  { key: "play-box", what: "A sealed box of Play Boosters, the set’s main pack: 30 or 36 packs depending on the set. What stores sell for drafts and what most players open." },
  { key: "collector-box", what: "Twelve Collector Boosters. Each pack is made of foils, alternate frames and other special versions of the set’s cards." },
  { key: "bundle", what: "A gift box: 9 Play Boosters in recent sets, with basic lands, a foil promo card, a spindown life counter and a storage box." },
  { key: "commander", what: "A ready-to-play 100-card deck for Commander, Magic’s most played casual format, led by a legendary creature." },
  { key: "prerelease", what: "What you play with at a prerelease event before a set comes out: six Play Boosters and a promo card in recent sets." },
  { key: "play-pack", what: "A single Play Booster, sold loose." },
  { key: "collector-pack", what: "A single Collector Booster, sold loose." },
];

export function outline(r: RegionInfo, data: GuideData): GuideOutline {
  const lines = KINDS.map(({ key }) => ({ label: FAMILY[key].label, p: data.rows[key]?.[0] ?? null }));
  return {
    intro: (
      <Lede>
        Magic: The Gathering sealed product comes in a handful of kinds: boxes of <strong>Play Boosters</strong> and <strong>Collector Boosters</strong>,{" "}
        <strong>Bundles</strong>, <strong>Commander decks</strong> and <strong>Prerelease Packs</strong>, plus loose packs. Here’s what each one is, and what it costs at{" "}
        {storesPhrase(r)} today.
      </Lede>
    ),
    sections: [
      {
        id: "kinds",
        title: "The kinds of sealed product",
        body: (
          <Prose>
            <ul>
              {KINDS.map((k) => (
                <li key={k.key}>
                  <strong>{FAMILY[k.key].label}:</strong> {k.what}
                </li>
              ))}
            </ul>
            <p>
              Sets also bring their own products, such as Star Trek’s Draft Night and Scene Boxes; a set’s page lists what it has. Pack counts are in{" "}
              <Link href={guideHref(r, "how-many-packs-in-magic-products")}>how many packs are in each product</Link>.
            </p>
          </Prose>
        ),
      },
      {
        id: "from-price",
        title: "What each costs today",
        live: true,
        body: (
          <LiveBlock r={r} checked={data.checked}>
            <PriceTable r={r} caption={`The cheapest of each kind of Magic sealed product in ${r.inName} today`} lines={lines} />
          </LiveBlock>
        ),
      },
      {
        id: "in-stock",
        title: "How much is in stock",
        body: (
          <>
            <Prose>
              <p>How many products of each type are buyable in {r.inName} right now, and the cheapest of each.</p>
            </Prose>
            <LiveBlock r={r} checked={data.checked}>
              {data.types.length ? (
                <StackTable
                  caption={`Open Magic sealed products by type in ${r.inName} today`}
                  head={["Type", "Products open", "From"]}
                  rows={data.types.map((t) => ({ key: t.productType, th: <span className="font-semibold text-ink">{t.productType}</span>, cells: [String(t.open), t.fromCents != null ? money(t.fromCents, r.market) : "—"] }))}
                />
              ) : (
                <NoneYet />
              )}
            </LiveBlock>
          </>
        ),
      },
      whereToBuy(r, { tcg: { query: "Magic sealed", label: "Magic sealed product" }, links: [{ href: `/${r.region}/sealed`, label: "All sealed" }] }),
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
