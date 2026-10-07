import Link from "next/link";
import { Callout, CardTable, SimpleTable } from "@/components/blog/BlogBits";
import { PRINTINGS, PRINTING_KEYS, RARITIES, RARITY_KEYS } from "../../constants";
import { money } from "../../format";
import type { Post } from "../types";
import { byMarketDesc, medianOf, packPullable } from "../util";

export const rarities: Post = {
  slug: "one-piece-card-rarities-explained",
  title: () => "One Piece Card Rarities Explained: Parallel, Manga, SP & Treasure Rare",
  description: "What C, UC, R, SR, SEC and L mean on a One Piece card, how Parallel, Manga, SP and Treasure Rare printings differ, and what each typically costs — from live price data.",
  tags: ["guide", "rarity", "collecting"],
  category: "guide",
  faq: [
    { q: "What does SEC mean on a One Piece card?", a: "SEC is Secret Rare, the rarest regular rarity in a booster set, usually one or two a box. The Parallel, Manga and SP printings of a card are separate products with their own prices, often far above the standard print." },
    { q: "What is a Parallel in the One Piece Card Game?", a: "A Parallel (or alternate art) is the same card with new art, usually foil and pulled much less often than the standard print. It plays identically and is priced as its own product." },
    { q: "Are SP and Manga cards worth more than the standard card?", a: "Usually, because they are scarcer and collected for their art, but the gap varies card by card. Each card page shows the ratio between its printings from live TCGplayer prices; [the price guide](/price-guide) lists them all." },
    { q: "What is a Treasure Rare?", a: "Treasure Rare (TR) is a special rarity introduced in recent sets, among the hardest pulls in a box. Like other special printings it has its own TCGplayer product and price." },
    { q: "Does a higher rarity mean a card is better to play?", a: "No. Rarity sets how often a card is pulled, not how good it is. Plenty of lower-rarity cards trade above higher ones because demand follows what players use." },
  ],
  date: "2026-10-03",
  minutes: 8,
  related: [
    { href: "/cards", label: "Cards by type & rarity" },
    { href: "/browse?printing=manga", label: "Every Manga printing" },
    { href: "/price-guide", label: "Price guide" },
  ],
  build: ({ cat, country }) => {
    const pullable = packPullable(cat);
    const med = (f: (c: (typeof pullable)[number]) => boolean) => {
      const xs = pullable.filter(f).map((c) => c.marketUsd).filter((v): v is number => v != null);
      return { n: pullable.filter(f).length, med: medianOf(xs) };
    };
    // The worked example: the card number with the most pack-pullable printings,
    // among those that include a Manga or SP art.
    const byNumber = new Map<string, typeof pullable>();
    for (const c of pullable) if (c.number) (byNumber.get(c.number) ?? byNumber.set(c.number, []).get(c.number)!).push(c);
    const example = [...byNumber.values()]
      .filter((ps) => ps.some((p) => p.printing === "standard") && ps.some((p) => p.printing === "manga" || p.printing === "sp" || p.printing === "alt"))
      .sort((a, b) => b.length - a.length || Math.max(...b.map((x) => x.marketUsd ?? 0)) - Math.max(...a.map((x) => x.marketUsd ?? 0)))[0];
    const exSorted = example ? [...example].sort((a, b) => (a.marketUsd ?? 0) - (b.marketUsd ?? 0)) : [];
    const exLow = exSorted[0];
    const exHigh = exSorted[exSorted.length - 1];
    const ratio = exLow?.marketUsd && exHigh?.marketUsd ? exHigh.marketUsd / exLow.marketUsd : null;
    const standard = med((c) => c.printing === "standard");
    const manga = med((c) => c.printing === "manga");
    const printingRows = PRINTING_KEYS.filter((k) => k !== "don" && k !== "promo").map((k) => {
      const s = med((c) => c.printing === k);
      return [PRINTINGS[k].label, s.n.toLocaleString("en-US"), money(s.med != null ? Math.round(s.med) : null, "US")];
    });
    const rarityRows = RARITY_KEYS.filter((k) => !["PR", "DON!!"].includes(k)).map((k) => {
      const s = med((c) => c.rarity === k && c.printing === "standard");
      return [`${RARITIES[k].label} (${k})`, s.n.toLocaleString("en-US"), money(s.med != null ? Math.round(s.med) : null, "US")];
    });
    return {
      heroCards: exSorted.slice(-3).reverse(),
      summary: [
        <>
          <strong>Rarity</strong> (C, UC, R, SR, SEC, L) is printed on the card; <strong>printing</strong> (standard, Parallel, Manga, SP, Treasure Rare) is which
          version of the card it is — and printing drives price far more.
        </>,
        standard.med != null && manga.med != null ? (
          <>
            The median standard print from a booster set is worth <strong>{money(Math.round(standard.med), "US")}</strong>; the median Manga printing{" "}
            <strong>{money(Math.round(manga.med), "US")}</strong>.
          </>
        ) : null,
        example && ratio ? (
          <>
            One card number, {example[0].number}, comes in {example.length} printings priced from {money(exLow.marketUsd, "US")} to {money(exHigh.marketUsd, "US")} —{" "}
            {Math.round(ratio).toLocaleString("en-US")}× apart.
          </>
        ) : null,
        <>Every printing has its own page on OP Compare, so you always compare like with like.</>,
      ].filter(Boolean),
      lede: (
        <p>
          <strong>Two cards with the same name and number can differ in price by a factor of a hundred or more.</strong> The One Piece Card Game has two ideas
          that are easy to mix up: a card&apos;s <em>rarity</em>, printed on it, and its <em>printing</em> — standard, Parallel, Manga, SP, Treasure Rare or a
          special foil. This guide explains both, with the median price of each from OP Compare&apos;s own data.
        </p>
      ),
      sections: [
        {
          id: "rarity",
          title: "The rarities: C, UC, R, SR, SEC and L",
          body: (
            <>
              <ul>
                <li><strong>Common (C), Uncommon (UC) and Rare (R)</strong> — the bulk of every booster set.</li>
                <li><strong>Super Rare (SR)</strong> — the set&apos;s headline characters and strongest cards, foil.</li>
                <li><strong>Secret Rare (SEC)</strong> — a set&apos;s top regular rarity, usually just a handful per set.</li>
                <li><strong>Leader (L)</strong> — the card a deck is built around. It starts in play, sets the deck&apos;s colours and has a Life value instead of a cost.</li>
                <li><strong>Promo (PR)</strong> and <strong>DON!!</strong> — promotional cards from events and products, and the resource cards every deck uses.</li>
              </ul>
              <p>Median TCGplayer market price of the standard print, by rarity, across every booster, extra booster and premium booster set:</p>
              <SimpleTable head={["Rarity", "Printings", "Median (US$)"]} rows={rarityRows} align={["l", "r", "r"]} />
            </>
          ),
        },
        {
          id: "printings",
          title: "The printings: Parallel, Manga, SP and Treasure Rare",
          body: (
            <>
              <ul>
                <li><strong>Standard</strong> — the regular print of a card.</li>
                <li>
                  <strong>Parallel / alternate art</strong> — the same card with new artwork, usually foil and pulled far less often than the standard print.
                  TCGplayer labels these “Parallel”, “Alternate Art” or “Full Art”.
                </li>
                <li><strong>Manga</strong> — alternate art taken from the manga&apos;s own panels, usually the scarcest pull in a set.</li>
                <li><strong>SP (special)</strong> — cards from earlier sets reprinted with new art and inserted into later products.</li>
                <li><strong>Treasure Rare (TR)</strong> — a special rarity in recent sets, among the scarcest pulls.</li>
                <li><strong>Special foils and reprints</strong> — finishes such as Jolly Roger or Pirate foil, and reprints in the Premium Booster “The Best” sets.</li>
              </ul>
              <p>Median TCGplayer market price by printing, cards from retail sets only:</p>
              <SimpleTable head={["Printing", "Printings", "Median (US$)"]} rows={printingRows} align={["l", "r", "r"]} />
            </>
          ),
        },
        ...(example
          ? [
              {
                id: "example",
                title: `One card, ${example.length} prices: ${example[0].name} ${example[0].number}`,
                body: (
                  <>
                    <p>
                      Every printing of {example[0].number} plays identically — same cost, power and effect. What changes is the art, the finish and how many
                      exist, and the market prices them accordingly:
                    </p>
                    <CardTable cards={[...example].sort(byMarketDesc)} setById={cat.setById} country={country} />
                  </>
                ),
              },
            ]
          : []),
        {
          id: "stamps",
          title: "Event stamps and promos",
          body: (
            <p>
              Pre-Release, Release Event and Anniversary Tournament cards reuse a set&apos;s card numbers with an event stamp, and tournament prize cards add
              placings such as Winner or Finalist. OP Compare treats each as its own printing — a store listing is matched to a stamped print only when its title
              names the stamp. See <Link href="/browse?printing=promo">every promo printing</Link>.
            </p>
          ),
        },
        {
          id: "takeaway",
          title: "What it means when you buy",
          body: (
            <Callout title="Rule of thumb">
              To play, buy the standard print — it is the same card and usually costs cents to a few dollars. To collect, decide which printing you want first,
              then compare stores for exactly that printing. On OP Compare every printing has its own page and its own price comparison.
            </Callout>
          ),
        },
      ],
    };
  },
};
