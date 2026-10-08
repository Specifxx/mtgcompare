// The homepage's About + FAQ copy (RiftCompare's FAQS in app/page.tsx), built
// from the constants it states so a claim can never drift from the site:
// the six markets and currencies come from COUNTRY_LIST, the import cadence
// from IMPORT_CADENCE. tests/home.test.ts pins every claim.
import { COUNTRY_LIST } from "./country";

/** How often prices are imported: the daily import workflow (schedule.ts IMPORT_CRONS is one run a day plus two retries). */
export const IMPORT_CADENCE = "once a day";

/** "the US, Australia, the UK, Singapore, Canada and the EU" — COUNTRY_LIST order. */
export function marketList(): string {
  const names = COUNTRY_LIST.map((c) => (c.code === "US" ? "the US" : c.code === "UK" ? "the UK" : c.code === "EU" ? "the EU" : c.label));
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "USD in the US, AUD in Australia, …" */
export function currencyList(): string {
  const parts = COUNTRY_LIST.map((c) => `${c.currency} in ${c.code === "US" ? "the US" : c.code === "UK" ? "the UK" : c.code === "EU" ? "the EU" : c.label}`);
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export interface HomeFaq {
  q: string;
  a: string;
}

export function homeFaqs(opts: { ebayLive: boolean }): HomeFaq[] {
  const markets = marketList();
  const ebay = opts.ebayLive
    ? "plus TCGplayer and the cheapest matching eBay listing"
    : "plus TCGplayer, with a one-tap eBay search on every card";
  return [
    {
      q: "What is MTG Compare?",
      a: `MTG Compare is a free Magic: The Gathering price comparison site. It compares live prices for Magic single cards and sealed products across local stores in ${markets}, ${ebay}, in your own currency — so you can compare Magic card prices in one search instead of checking every store.`,
    },
    {
      q: "Where can I buy Magic cards?",
      a: `MTG Compare reads the public listings of the stores it tracks in ${markets} ${IMPORT_CADENCE}, so you can buy Magic cards from whichever shop is cheapest. Search any card to see every store's price and click straight through to buy.`,
    },
    {
      q: "How do I find the cheapest Magic card prices?",
      a: "Search or browse the card database — every card shows the lowest live price across the stores in your market, and its page ranks every store cheapest first by item price. Where no store in your market has a card, its TCGplayer market price is shown converted to your currency and marked ≈, as a reference rather than a price you can buy at.",
    },
    {
      q: "How do I price check a Magic card?",
      a: "Search the card by name and open it: MTG Compare lists every store that stocks that exact printing — nonfoil, foil, etched, borderless, showcase or promo — with its live price, cheapest first, beside TCGplayer's market price. Tracked cards chart their price history, so you can see whether today's number is high or low for that card.",
    },
    {
      q: "Does MTG Compare include shipping costs?",
      a: "Store prices are item prices, before postage, and stores are ranked by item price so a store without a published rate isn't pushed down unfairly. eBay listings show their postage where the listing states it. Always check the delivered total at the store's checkout.",
    },
    {
      q: "Is there a Magic deck price calculator?",
      a: "Yes. Paste a decklist into the free Deck Builder & Pricer and it prices every card at the cheapest in-stock store price in your market and currency, then totals the deck — so you know what a list costs before you buy it.",
    },
    {
      q: "Does MTG Compare cover Magic singles and sealed products?",
      a: "Yes — compare prices on every English Magic singles printing TCGplayer lists, and on sealed products like booster boxes, booster packs, bundles, Commander decks and Secret Lair drops, all priced across local retailers.",
    },
    {
      q: "Are the Magic prices shown in my local currency?",
      a: `Yes. Prices are shown in the local currency of your selected market — ${currencyList()} — and store prices are shown as the stores themselves charge them. TCGplayer's market price, and the 7-day change worked out from it, is a US-dollar figure converted at our reference rate.`,
    },
  ];
}
