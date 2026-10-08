import { money as fmtMoney } from "@/lib/format";
import { MARKETS, type Country } from "@/lib/country";

// ─────────────────────────────────────────────────────────────────────────────
// Editorial intros for the COLLECTION pages: card hubs, type/rarity/treatment
// facets, colour pages, set pages, keyword pages.
// ─────────────────────────────────────────────────────────────────────────────
// The audit found these were the site's thinnest indexable surface after the
// empty card pages — character hubs sampled at a median of 164 unique editorial
// words, with a floor of 71. A hub whose entire content is a heading and a grid
// of tiles is a directory entry, not a page, and 82 of them is a pattern.
//
// This generates 150+ words per page from the collection's OWN live data: how
// many cards are in it, how many are actually priced, the range, where the money
// is concentrated, which members are worth knowing about, and what that means
// for someone buying. It is the same discipline as the card narrative — every
// sentence is a fact about THIS collection, and anything the data doesn't
// support is simply not said.

export type CollectionMember = {
  name: string;
  priceCents: number | null;
  setCode?: string;
  rarity?: string;
  collectorNumber?: string;
};

export type CollectionKind = "character" | "type" | "rarity" | "printing" | "colour" | "set" | "keyword";

export type CollectionInput = {
  kind: CollectionKind;
  /** Display label: "Sol Ring", "Creature", "Borderless", "Red", "Modern Horizons 3", "Flying". */
  label: string;
  /** The currency the prices below are in, and the market they belong to. */
  currency: string;
  place: string;
  members: CollectionMember[];
  /** Distinct sets represented, when meaningful (character and keyword hubs). */
  setCodes?: string[];
  /** Sitewide comparison point: the median price across every priced card. */
  siteMedianCents?: number | null;
};

const CUR_TO_MARKET = (cur: string): Country => MARKETS.find((m) => ({ US: "USD", AU: "AUD", UK: "GBP", SG: "SGD", CA: "CAD", EU: "EUR" } as Record<Country, string>)[m] === cur) ?? "US";
const money = (cents: number, currency: string) => fmtMoney(cents, CUR_TO_MARKET(currency));
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

// How the collection is referred to in prose. Kept explicit rather than
// templated off `kind`, because "the Red colour" and "Borderless printings" are
// different grammatical shapes and a generic phrasing reads like a mail merge.
function noun(kind: CollectionKind, label: string): { subject: string; member: string } {
  switch (kind) {
    case "character":
      return { subject: `${label}'s card pool`, member: `${label} card` };
    case "type":
      return { subject: `${label.toLowerCase()} cards`, member: `${label.toLowerCase()} card` };
    case "rarity":
      return { subject: `the ${label} rarity tier`, member: `${label.toLowerCase()} card` };
    case "printing":
      return { subject: `${label} printings`, member: `${label.toLowerCase()} printing` };
    case "colour":
      return { subject: `the ${label} colour`, member: `${label} card` };
    case "set":
      return { subject: label, member: "card" };
    case "keyword":
      return { subject: `cards with ${label}`, member: `${label} card` };
  }
}

/**
 * 150+ words of intro copy, or fewer if the collection genuinely has little to
 * say — a hub with three cards and no prices gets two honest sentences rather
 * than 150 words of padding. Returns paragraphs in reading order.
 */
export function buildCollectionNarrative(c: CollectionInput): string[] {
  const { subject, member } = noun(c.kind, c.label);
  const total = c.members.length;
  const priced = c.members.filter((m) => m.priceCents != null) as (CollectionMember & { priceCents: number })[];
  const values = priced.map((m) => m.priceCents).sort((a, b) => a - b);
  const out: string[] = [];

  if (total === 0) {
    return [
      `We have no ${member} in the database yet. This page fills in automatically as cards are imported — ` +
        `nothing here is hand-maintained.`,
    ];
  }

  // ── 1. Scale and coverage ──────────────────────────────────────────────────
  const setBit =
    c.setCodes && c.setCodes.length > 1
      ? ` spread across ${c.setCodes.length} sets (${c.setCodes.join(", ")})`
      : c.setCodes && c.setCodes.length === 1
      ? ` all from ${c.setCodes[0]}`
      : "";
  out.push(
    `MTG Compare lists ${total} ${plural(total, member)} in ${subject}${setBit}, ` +
      (priced.length === total
        ? `and every one of them currently has a live price.`
        : priced.length === 0
        ? `though none currently has a live listing in ${c.place} — prices refresh daily and this page updates itself as stock appears.`
        : `${priced.length} of which have a live price in ${c.place} right now. The rest are tracked but not currently stocked by any store we monitor; they reappear here priced the moment one lists them.`),
  );

  if (!priced.length) {
    out.push(
      `Every card below links to its own page with its full text, its printings, and price comparison across ` +
        `the United States, Australia, the United Kingdom, Singapore, Canada and the EU.`,
    );
    return out;
  }

  // ── 2. The range, and where the money actually is ──────────────────────────
  const lo = values[0];
  const hi = values[values.length - 1];
  const median = values[Math.floor(values.length / 2)];
  const total_ = values.reduce((n, v) => n + v, 0);
  // How concentrated is the value? The top decile's share is the number that
  // separates "one chase card and a pile of bulk" from "uniformly mid-priced".
  const topDecileCount = Math.max(1, Math.round(values.length * 0.1));
  const topDecileShare = Math.round(
    (values.slice(-topDecileCount).reduce((n, v) => n + v, 0) / total_) * 100,
  );

  if (values.length >= 4) {
    let s =
      `Prices run from ${money(lo, c.currency)} to ${money(hi, c.currency)}, with a median of ` +
      `${money(median, c.currency)}.`;
    // THREE bands, not two — the middle 26-54% used to add nothing, which is why
    // a set whose value genuinely isn't lopsided in either direction (neither a
    // few chase cards carrying it nor an unusually even spread) got only the
    // bare "prices run from…" sentence above and read as thinner than sets
    // whose numbers happened to land in one of the two flagged bands. Same
    // computed `topDecileShare`, same honesty rule (only true things, nothing
    // padded) — this just states the unremarkable case explicitly instead of
    // silently saying nothing about it.
    //
    // GUARDED on total_ > 0: an all-$0.00 collection (every member priced but
    // worthless — a real, if rare, case) makes topDecileShare a 0/0 NaN, and the
    // new middle band is the one branch of the three that would otherwise print
    // it straight into the sentence ("for NaN% of the group's total value").
    // The original two-branch version never hit this because `NaN >= 55` and
    // `NaN <= 25` are both false — this preserves that same silent skip for the
    // one case where there is genuinely nothing true to say about concentration.
    if (total_ > 0 && topDecileShare >= 55) {
      s +=
        ` The value is heavily concentrated: the most expensive ${topDecileCount === 1 ? "card alone accounts" : `${topDecileCount} cards account`} ` +
        `for ${topDecileShare}% of what it would cost to buy one of everything here. If you are completing this group, ` +
        `that handful is the whole budget — the rest is close to bulk.`;
    } else if (total_ > 0 && topDecileShare <= 25) {
      s +=
        ` Value is spread unusually evenly — no single card dominates the cost, so completing this group is a steady ` +
        `accumulation rather than one expensive purchase.`;
    } else if (total_ > 0) {
      s +=
        ` The priciest ${plural(topDecileCount, "card")} here ${topDecileCount === 1 ? "accounts" : "account"} for ${topDecileShare}% of the group's ` +
        `total value — a fairly ordinary spread, tilted toward the top end without one or two cards carrying the whole group.`;
    }
    out.push(s);

    if (c.siteMedianCents != null && c.siteMedianCents > 0) {
      const vs = Math.round(((median - c.siteMedianCents) / c.siteMedianCents) * 100);
      // Same completeness fix as the concentration band above: under 20% either
      // way used to add nothing at all. Stated plainly, it's still a real,
      // useful fact — "this group prices about like everything else" is the
      // honest answer for most sets, not a gap to leave blank.
      if (Math.abs(vs) >= 20) {
        out.push(
          `Against the ${money(c.siteMedianCents, c.currency)} median across every priced Magic card we track, ` +
            `${subject} sits ${Math.abs(vs)}% ${vs > 0 ? "above" : "below"} the market — ` +
            (vs > 0
              ? `a premium group, and one worth checking postage on before buying card by card.`
              : `which makes it one of the cheaper places to buy in bulk, where a single combined order beats paying postage per card.`),
        );
      } else {
        out.push(
          `That ${money(median, c.currency)} median is close to the ${money(c.siteMedianCents, c.currency)} median across every ` +
            `priced Magic card we track — ${subject} prices roughly in line with the rest of the game, no unusual premium or discount either way.`,
        );
      }
    }
  } else {
    out.push(
      `The ${plural(values.length, "priced card")} here ${values.length === 1 ? "sits" : "sit"} at ` +
        `${values.length === 1 ? money(lo, c.currency) : `${money(lo, c.currency)}–${money(hi, c.currency)}`} in ${c.place}.`,
    );
  }

  // ── 3. Notable members, named ──────────────────────────────────────────────
  const byPrice = [...priced].sort((a, b) => b.priceCents - a.priceCents);
  // DEDUPE BY NAME. A collection routinely holds several printings of one card —
  // a base, a Borderless, a Showcase — and they cluster at the top of the
  // price sort, so the raw top 3 read "Sol Ring at $195.73, Mana Crypt at $190.47,
  // Sol Ring at $188.86". Naming the same card twice reads as a bug and wastes
  // one of only three slots that exist to tell a reader something new. The
  // dearest printing of each distinct card wins, which is also the one a "cards
  // to know" line should be quoting.
  const seenNames = new Set<string>();
  const dearest = byPrice.filter((m) => !seenNames.has(m.name) && seenNames.add(m.name)).slice(0, 3);
  const cheapest = byPrice[byPrice.length - 1];
  if (dearest.length >= 2) {
    out.push(
      `The cards to know: ${dearest
        .map((m) => `${m.name} at ${money(m.priceCents, c.currency)}`)
        .join(", ")}` +
        (cheapest && cheapest.priceCents < median
          ? `. At the other end, ${cheapest.name} is the cheapest way in at ${money(cheapest.priceCents, c.currency)}.`
          : `.`),
    );
  } else if (dearest.length === 1) {
    out.push(`The most expensive is ${dearest[0].name}, at ${money(dearest[0].priceCents, c.currency)}.`);
  }

  // ── 4. What a buyer should actually do with this ───────────────────────────
  const buyerAdvice: Record<CollectionKind, string> = {
    character: `Every printing of a ${c.label} card is a separate product with its own price, and each has a Normal and a Foil price of its own: a plain print, a Borderless one and a Foil Etched one of the same card rarely track each other. The prices below are each printing's cheapest in-stock listing in a single market, and every card's own page compares the six markets we cover, so building around ${c.label} usually means checking which market each individual card is cheapest in rather than buying the whole list from one shop.`,
    type: `${c.label} cards are bought for play far more often than for collection, which means condition matters less than price: a lightly played copy plays identically in a sleeve. Postage regularly outweighs the card on anything at the cheap end, so price the whole list as one order in Best Basket rather than card by card.`,
    rarity: `Rarity sets the pull rate, not the price. Plenty of ${c.label.toLowerCase()} cards here trade below cards a tier under them, because demand comes from whether a card is played, not from what is printed on it. The prices below are what stores actually charge today.`,
    printing: `${c.label} printings are collector versions: the same card to play with, priced on scarcity and looks. If you want the card to play with, the plain printing is on each card's own page and is almost always cheaper. If you want this one, the price below is its cheapest in-stock listing, and the card's own page compares every store that has it.`,
    colour: `Colour decides which decks a card can go in, which is why ${c.label} prices move with the ${c.label} decks that are winning rather than with the rest of the set. Cards below are priced from each card's cheapest in-stock listing in a single market; each card's own page compares all six markets we cover.`,
    set: `Buying a set card by card and buying sealed are different questions — the Box EV calculator answers the second, and the prices below answer the first. The calculator values each card at TCGplayer's US market price, converted, rather than the cheapest listing shown here, so its per-card figures will differ.`,
    keyword: `Cards sharing a keyword tend to be bought together, because they are what a deck built around that ability actually needs. Prices below are the cheapest live listing for each, so a whole shopping list can be costed in one pass rather than card by card.`,
  };
  out.push(buyerAdvice[c.kind]);

  return out;
}

/** Word count of the generated intro — used by tests and the audit. */
export function collectionWordCount(paragraphs: string[]): number {
  return paragraphs.join(" ").split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;
}
