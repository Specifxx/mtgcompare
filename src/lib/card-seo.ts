// The card page's <title>, meta description and FAQ, as pure functions
// (card title, description and FAQ for Magic). Extracted from
// the route so the 60-character title guard, the single highest-volume SEO
// invariant on ~7,000 card pages, is tested (tests/card-seo.test.ts).
//
// Nothing here imports Prisma or the route.
import { rarityLabel } from "./constants";
import { PRINTING_SHORT, colourList, printingProse, tidy } from "./content/card-narrative";
import { money, usd } from "./format";
import type { Country } from "./country";
import { COUNTRIES } from "./country";

export const SUFFIX = " | MTG Compare";
/** Google truncates around here; the title is set with `absolute`, suffix included. */
export const TITLE_MAX = 60;
export const titleFits = (t: string): boolean => `${t}${SUFFIX}`.length <= TITLE_MAX;

export interface CardTitleInput {
  name: string;
  variant: string | null;
  number: string | null;
  setName: string;
  setCode: string;
  /** Card.printing, so the shortened rungs can keep the one printing word. */
  printing: string;
  hasPrice: boolean;
}

/**
 * The title, chosen from a longest-first ladder. What the ladder is willing to
 * lose, in order: the set name, then the set code, then the variant's long
 * form ("Borderless · Etched" becomes "Borderless"), then the word "Price". NEVER
 * the card number or the printing word: a Borderless and its standard print share
 * a name and a number, and the printing is the only thing separating their
 * titles. Uniqueness outranks length, so when nothing fits the shortest rung
 * ships (never the last one written).
 */
export function cardTitle(c: CardTitleInput): string {
  const num = c.number ? ` ${c.number}` : "";
  const word = c.hasPrice ? "Price" : "Card";
  const vari = c.variant ? ` (${c.variant})` : "";
  const P = c.printing !== "standard" ? PRINTING_SHORT[c.printing] ?? c.variant ?? "" : "";
  const printed = P ? ` ${P}` : "";
  const candidates = [
    `${c.name}${vari}${num} ${word} — ${c.setName}`,
    `${c.name}${vari}${num} ${word} — ${c.setCode}`,
    `${c.name}${vari}${num} ${word}`,
    `${c.name}${printed}${num} ${word}`,
    `${c.name}${printed}${num}`,
    `${c.name}${num}`,
  ];
  const ladder = candidates.filter((t, i) => candidates.indexOf(t) === i);
  const pick = ladder.find(titleFits) ?? ladder.reduce((a, b) => (b.length < a.length ? b : a));
  return `${pick}${SUFFIX}`;
}

export interface CardDescriptionInput {
  displayName: string;
  number: string | null;
  setName: string;
  setCode: string;
  printing: string;
  rarity: string | null;
  cardType: string | null;
  colors: string[];
  /** Rules text, first line only, already clamped; null when none. */
  textBit: string | null;
  marketUsd: number | null;
  /** Cheapest US listing, USD cents; null when none. */
  lowUsCents: number | null;
  aliases?: string[];
}

/** The meta description: what the card IS, what it DOES, what it COSTS. */
export function cardMetaDescription(c: CardDescriptionInput): string {
  const colour = colourList(c.colors);
  const stat = [colour, c.cardType, c.rarity ? rarityLabel(c.rarity) : null].filter(Boolean).join(" ");
  const special = c.printing !== "standard";
  const ident = c.number ? `${c.number}, ` : "";
  const head = special
    ? `${c.displayName}: the ${printingProse(c.printing)} printing of a ${stat.toLowerCase() || "card"} (${ident}${c.setName}).`
    : `${c.displayName}: ${stat || "Magic: The Gathering card"} (${ident}${c.setName}).`;
  const price =
    c.marketUsd != null
      ? `TCGplayer market price ${usd(c.marketUsd)}${c.lowUsCents != null ? `, cheapest US listing ${usd(c.lowUsCents)}` : ""}. Live prices compared across stores in the US, Australia, the UK, Singapore, Canada and the EU.`
      : "Live prices compared across stores in the US, Australia, the UK, Singapore, Canada and the EU.";
  const text = c.textBit ? ` ${c.textBit}` : "";
  const alias = c.aliases?.length ? ` Also known as "${c.aliases.join('", "')}".` : "";
  return tidy(`${head}${text} ${price}${alias}`).slice(0, 320);
}

// ── FAQ ──────────────────────────────────────────────────────────────────────
export interface FaqContext {
  name: string;
  displayName: string;
  number: string | null;
  setName: string;
  setCode: string;
  rarity: string | null;
  cardType: string | null;
  colors: string[];
  printing: string;
  country: Country;
  /** Cheapest open listing in the visitor's market, local cents; null when none. */
  lowest: number | null;
  stores: number;
  /** Other printings sharing the number. */
  printingCount: number;
  /** TCGplayer market price (USD cents) of this printing and of the standard one. */
  marketUsd: number | null;
  baseMarketUsd: number | null;
  /** "A$14.00 in Australia, £6.50 in the United Kingdom": null with fewer than two markets. */
  currencyAnswer: string | null;
  /** Set not yet released. */
  preRelease: boolean;
}

/**
 * Printing-specific Q&A, rendered as a visible <dl> and published as FAQPage
 * JSON-LD. An entry that cannot be answered honestly for this card sets its
 * answer to "" and is dropped in one place at the end: a Question with an empty
 * acceptedAnswer is a structured-data error.
 */
export function buildCardFaqs(c: FaqContext): { q: string; a: string }[] {
  const co = COUNTRIES[c.country];
  const special = c.printing !== "standard";
  const num = c.number ? ` (${c.number})` : "";
  const faqs: { q: string; a: string }[] = [
    {
      q: `How much does ${c.displayName} cost?`,
      a:
        c.lowest != null && c.stores > 0
          ? `The cheapest live price for ${c.name}${num} is currently ${money(c.lowest, c.country)} across ${c.stores} ${c.stores === 1 ? "store" : "stores"} in ${co.place}${c.marketUsd != null ? `, and TCGplayer's market price is ${usd(c.marketUsd)}` : ""}; every other market we cover is compared on this page too. Prices are read twice a day.`
          : c.lowest != null
            ? `The cheapest listing for ${c.name}${num} in ${co.place} is ${money(c.lowest, c.country)}, from a marketplace rather than one of the stores we track.${c.marketUsd != null ? ` TCGplayer's market price is ${usd(c.marketUsd)}.` : ""}`
            : c.marketUsd != null
              ? `No store we track in ${co.place} has ${c.name}${num} in stock right now. TCGplayer's market price, built from recent US sales, is ${usd(c.marketUsd)}.`
              : c.preRelease
                ? `${c.setName} has not been released yet, so ${c.name}${num} has no market price. Pre-order and pre-release listings appear on this page as soon as a store we track lists one.`
                : `We do not have a live price for ${c.name}${num} right now. Prices refresh twice a day across US, UK, EU, AU, CA and SG stores, so check back for the cheapest place to buy it.`,
    },
    { q: `How much is ${c.name} in other currencies?`, a: c.currencyAnswer ? `${c.currencyAnswer}. Each is a real listing in the currency its seller bills in.` : "" },
    {
      q: `What set is ${c.name} from?`,
      a: `${c.name} is card ${c.number ?? "without a number"} from ${c.setName} (${c.setCode}) in Magic: The Gathering.${c.rarity || c.cardType ? ` It is a ${[c.rarity ? rarityLabel(c.rarity).toLowerCase() : null, c.colors.length ? colourList(c.colors) : null, c.cardType?.toLowerCase()].filter(Boolean).join(" ")}.` : ""}`,
    },
    {
      q: `Where can I buy ${c.name}?`,
      a: `Compare every store selling ${c.name} across the US, Australia, the UK, Singapore, Canada and the EU on this page, then buy from whichever seller offers the lowest total including postage. MTG Compare links straight through to each store.`,
    },
  ];
  if (c.printingCount > 0) {
    faqs.push({
      q: `Are there other printings of ${c.name}?`,
      a: `Yes. MTG Compare tracks ${c.printingCount} other ${c.printingCount === 1 ? "printing" : "printings"} of ${c.number ?? c.name} (borderless, showcase, extended-art, reprint or promo versions), each a distinct TCGplayer product trading at its own price. They are listed further down this page.`,
    });
  }
  if (special) {
    const label = PRINTING_SHORT[c.printing] ?? "special";
    faqs.push({
      q: `Is the ${label} printing of ${c.name} worth it?`,
      a:
        c.marketUsd != null && c.baseMarketUsd != null
          ? `On TCGplayer the ${label} printing of ${c.name} is ${usd(c.marketUsd)}, against ${usd(c.baseMarketUsd)} for the standard print, ${c.marketUsd > c.baseMarketUsd ? `a ${usd(c.marketUsd - c.baseMarketUsd)} premium` : c.marketUsd < c.baseMarketUsd ? `a ${usd(c.baseMarketUsd - c.marketUsd)} discount` : "no premium right now"}. Whether that is worth it depends on whether you want a copy to play with or one to collect; both are tracked separately here.`
          : "",
    });
  }
  return faqs.map((f) => ({ q: tidy(f.q), a: tidy(f.a) })).filter((f) => f.a.length > 0);
}
