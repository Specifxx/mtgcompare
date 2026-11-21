// Guide: how to identify rare Magic: The Gathering cards (Search Console, 2026-11-20: "how to identify rare magic the gathering
// cards" rising at position 7 with no page answering it). What a card itself says (the set symbol's colour, the collector line on
// cards printed since Magic 2015, the printing's treatment), then the newest set's own TCGplayer market prices read live from
// data/cards (lib/cards.ts): the median by rarity, and one card's printings side by side, so a reader sees that the printing,
// not only the rarity, decides what a card is worth. TCGplayer's market price only (US$, recent sales); no history, no trend claims.
import Link from "next/link";
import type { RegionInfo } from "@/lib/regions";
import { CARDS_HUB, cardPath, cardValue, rarityName, readSet, setBySlug, usd, type CardRow } from "@/lib/cards";
import type { GuideData } from "./data";
import { GUIDE_BY_SLUG } from "./index";
import { Checklist, GuideBody, guideHref, Lede, NextLinks, Note, Prose, StackTable, type BodyProps, type GuideOutline } from "./kit";
import { faqSection } from "./kit-more";

const GUIDE = GUIDE_BY_SLUG.get("how-to-identify-rare-magic-cards")!;

/** The newest set whose cards the import prices: the example the live tables read. */
export const EXAMPLE_SET = "star-trek";
const ORDER = ["C", "U", "R", "M"] as const;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Median and top TCGplayer market price per rarity in one set, over cards with a price. */
export function rarityLadder(cards: readonly CardRow[]): { r: string; n: number; median: number; top: CardRow }[] {
  const out: { r: string; n: number; median: number; top: CardRow }[] = [];
  for (const r of ORDER) {
    const priced = cards.filter((c) => c.r === r && cardValue(c.p) != null);
    const m = median(priced.map((c) => cardValue(c.p)!));
    if (m == null) continue;
    const top = priced.reduce((a, b) => (cardValue(b.p)! > cardValue(a.p)! ? b : a));
    out.push({ r, n: priced.length, median: m, top });
  }
  return out;
}

/** The base name of a printing: "Captain Jean-Luc Picard (Showcase) (Surge Foil)" → "Captain Jean-Luc Picard". */
const baseName = (n: string) => n.replace(/\s*\([^)]*\)/g, "").trim();
/** The treatment a printing's name carries, or "Regular". */
const treatment = (n: string) => (n.match(/\(([^)]*)\)/g)?.map((x) => x.slice(1, -1)).join(", ") || "Regular");

/** The most valuable card's printings in the set, cheapest first: same card, different treatments. */
export function printingsOfTop(cards: readonly CardRow[]): CardRow[] {
  const priced = cards.filter((c) => cardValue(c.p) != null);
  if (!priced.length) return [];
  const top = priced.reduce((a, b) => (cardValue(b.p)! > cardValue(a.p)! ? b : a));
  const name = baseName(top.n);
  return priced.filter((c) => baseName(c.n) === name).sort((a, b) => cardValue(a.p)! - cardValue(b.p)!);
}

const finishPrices = (c: CardRow) =>
  [c.p[0] != null ? `${usd(c.p[0])} normal` : null, c.p[1] != null ? `${usd(c.p[1])} foil` : null, c.p[2] != null ? `${usd(c.p[2])} etched` : null].filter(Boolean).join(" · ");

export function outline(r: RegionInfo, _data: GuideData): GuideOutline {
  const set = setBySlug(EXAMPLE_SET);
  const cards = readSet(EXAMPLE_SET);
  const ladder = rarityLadder(cards);
  const printings = printingsOfTop(cards);
  const setName = set?.name ?? "Star Trek";
  const code = set?.abbr ?? null;
  const cardLink = (c: CardRow) => (
    <Link prefetch={false} href={cardPath(EXAMPLE_SET, c.s)}>
      {c.n}
      {c.no ? ` #${c.no}` : ""}
    </Link>
  );

  return {
    intro: (
      <Lede>
        Every Magic card tells you its rarity twice: by the colour of the set symbol on the right of the type line, and, on cards printed since 2014, by a letter in the
        collector line at the bottom left. Rarity is only half the story, though: the same card can exist in several printings, and the printing often decides what it sells for.
      </Lede>
    ),
    sections: [
      {
        id: "set-symbol",
        title: "Step 1: the colour of the set symbol",
        body: (
          <>
            <Prose>
              <p>Look at the small symbol on the right of the card, level with the type line (the line that says Creature, Instant, Land and so on). Its colour is the rarity:</p>
            </Prose>
            <StackTable
              caption="Set symbol colours"
              head={["Colour", "Rarity", "Letter"]}
              align="left"
              rows={[
                { key: "c", th: "Black", cells: ["Common", "C"] },
                { key: "u", th: "Silver", cells: ["Uncommon", "U"] },
                { key: "r", th: "Gold", cells: ["Rare", "R"] },
                { key: "m", th: "Orange-red", cells: ["Mythic rare", "M"] },
                { key: "s", th: "Purple", cells: ["Special (bonus sheets)", "S"] },
              ]}
            />
            <Note>
              Mythic rare arrived with Shards of Alara in 2008, and coloured symbols with Exodus in 1998. Cards from before Exodus have black symbols whatever their rarity, and the
              first three printings (Alpha, Beta, Unlimited) have no set symbol at all, so look those up by name.
            </Note>
          </>
        ),
      },
      {
        id: "collector-line",
        title: "Step 2: the collector line at the bottom left",
        body: (
          <Prose>
            <p>
              Cards printed since Magic 2015 (2014) carry a small line of text at the bottom left: the collector number, the rarity letter (C, U, R, M, or L for a basic land),
              the set code and the language. For example, <strong>{code ? `${code} ` : ""}#7 M</strong> is a mythic rare, number 7 of its set.
            </p>
            <p>
              The collector number matters more than people expect. A number above the set&apos;s main run (past the last card of the regular set) usually means a special
              printing: borderless, showcase or extended-art versions are numbered after the main cards. The number is also the quickest way to find the exact printing in a price
              search: type the name and the number.
            </p>
          </Prose>
        ),
      },
      {
        id: "printing",
        title: "Step 3: which printing it is",
        body: (
          <>
            <Prose>
              <p>Once you know the rarity, check the treatment. These are the differences that change a price most:</p>
            </Prose>
            <Checklist
              items={[
                <>
                  <strong>Foil or not.</strong> Tilt the card under a light: a foil shines across the whole card. Some sets add special foils (surge, galaxy, textured, raised),
                  each a separate printing with its own price.
                </>,
                <>
                  <strong>Frame.</strong> Borderless (art to the edge), extended art (art wider than the frame) and showcase (a set&apos;s own special frame) are separate printings
                  of the same card.
                </>,
                <>
                  <strong>Serial number.</strong> A stamped number like 045/500 on the card means a numbered print run: these are among the most valuable cards of a set.
                </>,
                <>
                  <strong>Language and condition.</strong> The collector line says the language. Condition (corners, edges, scratches) moves the price too; prices here are for
                  ungraded cards.
                </>,
              ]}
            />
          </>
        ),
      },
      {
        id: "rarity-prices",
        title: `What each rarity sells for: ${setName}`,
        live: true,
        body: ladder.length ? (
          <>
            <Prose>
              <p>
                To show what rarity means in money, here is {setName}, the newest set we price card by card: the typical (median) TCGplayer market price of each rarity today,
                and the most valuable card of each. TCGplayer&apos;s market price is the recent sale price in US dollars, the higher finish where a card has two.
              </p>
            </Prose>
            <StackTable
              caption={`${setName}: TCGplayer market price by rarity today (US$)`}
              head={["Rarity", "Cards", "Typical", "Most valuable"]}
              rows={ladder.map((x) => ({
                key: x.r,
                th: rarityName(x.r) ?? x.r,
                cells: [String(x.n), usd(x.median), <span key="t">{cardLink(x.top)} · {usd(cardValue(x.top.p)!)}</span>],
              }))}
            />
            <Prose>
              <p>
                Most commons and uncommons sell for cents. A rare or mythic is where the money usually is, but the gap between a typical rare and the best one is large, which is why
                the next step is to look up the exact printing.
              </p>
            </Prose>
          </>
        ) : (
          <Prose>
            <p>Today&apos;s card prices are not available. Search any card on the <Link prefetch={false} href={CARDS_HUB}>card price pages</Link>.</p>
          </Prose>
        ),
      },
      {
        id: "same-card",
        title: "Same card, different printings",
        live: true,
        body: printings.length > 1 ? (
          <>
            <Prose>
              <p>
                {setName}&apos;s most valuable card today is {baseName(printings[printings.length - 1].n)}. Here is every printing of it we price, cheapest first. Same name, same
                rarity, very different prices:
              </p>
            </Prose>
            <StackTable
              caption={`${baseName(printings[0].n)}: every printing, TCGplayer market price today (US$)`}
              head={["Printing", "Number", "Price"]}
              rows={printings.map((c) => ({
                key: String(c.id),
                th: (
                  <Link prefetch={false} href={cardPath(EXAMPLE_SET, c.s)}>
                    {treatment(c.n)}
                  </Link>
                ),
                cells: [
                  c.no ? `#${c.no}` : "",
                  finishPrices(c),
                ],
              }))}
            />
            <Note>So when you find a rare or mythic, read its collector number and check that exact printing&apos;s price, not just the card&apos;s name.</Note>
          </>
        ) : (
          <Prose>
            <p>Search a card by name and number on the <Link prefetch={false} href={CARDS_HUB}>card price pages</Link> to see each of its printings.</p>
          </Prose>
        ),
      },
      faqSection([
        {
          q: "What does the gold symbol on a Magic card mean?",
          a: "Gold is rare. Black is common, silver is uncommon, orange-red is mythic rare and purple is a special or bonus-sheet card.",
        },
        {
          q: "What does the M at the bottom of a Magic card mean?",
          a: "On cards printed since 2014 the collector line at the bottom left gives the rarity as a letter: C common, U uncommon, R rare, M mythic rare, L basic land.",
        },
        {
          q: "Are all rare Magic cards valuable?",
          a: "No. Many rares sell for under a dollar. The card itself, its printing (foil, borderless, showcase, serialized) and its condition decide the price.",
        },
        {
          q: "How do I find what my Magic card is worth?",
          a: "Search its name and collector number on our card price pages, which show TCGplayer's market price for each printing and finish.",
        },
      ]),
      {
        id: "next",
        title: "Look up your cards",
        body: (
          <NextLinks
            links={[
              { href: CARDS_HUB, label: "Magic card prices: search any card", icon: "search" },
              { href: `${CARDS_HUB}/${EXAMPLE_SET}`, label: `${setName} card prices`, icon: "tag" },
              { href: guideHref(r, "how-to-avoid-resealed-magic-products"), label: "How to avoid resealed Magic product", icon: "arrow-right" },
              { href: guideHref(r, "magic-sealed-products-explained"), label: "Magic sealed products explained", icon: "arrow-right" },
            ]}
          />
        ),
      },
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
