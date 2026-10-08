import { COUNTRIES, type Country } from "../country";
import { money, usd } from "../format";
import { toUsdCents } from "../fx";
import { PRINTINGS, rarityLabel } from "../constants";

// ─────────────────────────────────────────────────────────────────────────────
// The card page's "About" section, generated compositionally from real data
// (written for Magic: The Gathering).
// ─────────────────────────────────────────────────────────────────────────────
// A fixed sentence skeleton with a card's attributes slotted in is one page
// written thousands of times. This assembles observations that exist only
// because of what THIS card's data says, and picks sentence forms by branching
// on data conditions, never by shuffling synonyms.
//
// Observation families, each emitted only when the data on this render backs it:
//   0. Identity: its type line, colours, mana cost and stats
//   1. Rules text: which keywords it prints, where it is legal
//   2. Printing: Borderless / Showcase / Extended Art / ..., and the price ratio
//      against the other printings that share its number
//   3. Price: TCGplayer's market price against the cheapest listing per market
//   4. Cross-market spread and stock depth
//   5. Trajectory: 7/30 day change and the distance from the 90-day high
//   6. Set context: where the price sits among the set's priced cards
//
// HARD RULE: nothing is asserted without the data on this render to back it. A
// card with no listing and no market price gets two short paragraphs, not a
// padded six. Filler is the failure mode.

export type NarrativeMarket = {
  country: Country;
  place: string;
  currency: string;
  /** Cheapest in-stock listing, item price only, in the market's currency. */
  lowestCents: number | null;
  /** Second-cheapest in-stock listing, item price only. */
  secondCents: number | null;
  /** Distinct in-stock STORES (never TCGplayer or eBay). */
  storeCount: number;
  /** Total in-stock listings of any source. */
  listingCount: number;
};

export type NarrativeInput = {
  name: string;
  variant: string | null;
  number: string | null;
  /** Card.printing: "standard" or the first treatment key (constants.ts TREATMENTS). */
  printing: string;
  setName: string;
  setCode: string;
  /** Set.kind (constants.ts SET_KINDS): expansion | core | masters | commander | ... */
  setKind: string;
  releasedOn: string | null;
  /** YYYY-MM-DD, the render day (an argument so the function stays pure). */
  today: string;
  rarity: string | null;
  /** The primary type label ("Creature", "Artifact", "Instant"). */
  cardType: string | null;
  /** The full printed type line ("Legendary Creature - Elf Druid"). */
  typeLine: string | null;
  /** Colour names in WUBRG order; [] is colourless. */
  colors: string[];
  manaCost: string | null;
  manaValue: number | null;
  /** "3/4" for a creature, null otherwise. */
  pt: string | null;
  loyalty: string | null;
  /** Printed keyword abilities, as printed: "Flying", "Trample". */
  keywords: string[];
  /** Labels of the formats the card is legal in, in display order ("Commander", "Modern"). */
  legalIn: string[];
  /** The Commander chip: a legal commander. */
  commander: boolean;
  marketUsd: number | null;
  change7d: number | null;
  change30d: number | null;
  high90Usd: number | null;
  /** The market the page is rendered for. */
  baseline: NarrativeMarket;
  /** Every market with data (baseline included). */
  markets: NarrativeMarket[];
  /** Other printings sharing the card number, with TCGplayer's market price (USD cents). */
  printings: { label: string; marketUsd: number | null }[];
  /** Where this card sits among its set's priced cards. */
  setContext: { pricedInSet: number; cheaperThan: number; medianUsd: number | null } | null;
  /** How many other cards share this name across sets. */
  sameNameElsewhere: number;
};

export type Narrative = { paragraphs: string[]; words: number };

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
const pctOf = (a: number, b: number) => Math.round(((a - b) / b) * 100);

/** Final hygiene pass: no doubled spaces, no doubled or space-preceded punctuation. */
export function tidy(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/([.,;:])\1+/g, "$1")
    .replace(/\.\s*\./g, ".")
    .trim();
}

function capitalise(s: string): string {
  const t = s.trimStart();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** The only sanctioned way to join fragments: capitalised, terminated. */
function sentences(...fragments: (string | null | undefined | false)[]): string {
  return tidy(
    fragments
      .filter((f): f is string => Boolean(f && f.trim()))
      .map((f) => {
        const t = capitalise(f.trim());
        return /[.!?]$/.test(t) ? t : `${t}.`;
      })
      .join(" "),
  );
}

// ── Printing is not rarity ───────────────────────────────────────────────────
// `Card.variant` is TCGplayer's own suffix ("Borderless", "Extended Art",
// "SP") and `printing` is our bucket for it. Prose uses the bucket, never the
// raw suffix, so the page cannot call one printing two things.
/** Prose names come from the closed treatment vocabulary; "standard" is the plain frame. */
export const PRINTING_PROSE: Record<string, string> = Object.fromEntries(
  Object.entries(PRINTINGS).map(([k, v]) => [k, k === "standard" ? "standard" : v.label.toLowerCase()]),
);

export const PRINTING_SHORT: Record<string, string> = Object.fromEntries(Object.entries(PRINTINGS).map(([k, v]) => [k, v.label]));

export const printingProse = (printing: string): string => PRINTING_PROSE[printing] ?? "alternate";
export const isSpecialPrinting = (printing: string): boolean => printing !== "standard";

/** "Red and Green", "Red, Green and Blue", "" for none. */
export function colourList(colors: string[]): string {
  if (colors.length <= 1) return colors[0] ?? "";
  return `${colors.slice(0, -1).join(", ")} and ${colors[colors.length - 1]}`;
}

const setKindProse: Record<string, string> = {
  expansion: "a main expansion",
  core: "a core set",
  masters: "a reprint set, which collects earlier cards",
  commander: "a Commander product",
  list: "The List, which reprints earlier cards",
  deck: "a preconstructed deck product",
  "secret-lair": "a Secret Lair drop",
  promo: "a promo release",
  "promo-pack": "a promo pack release",
  "gold-border": "a gold-bordered collector set, not legal in sanctioned play",
  unset: "an Un-set, which is not legal in sanctioned play",
};

// ── 0. Identity ──────────────────────────────────────────────────────────────
function identity(c: NarrativeInput): string {
  const colour = colourList(c.colors);
  const num = c.number ? ` (${c.number})` : "";
  const where = `${c.setName}${c.setCode ? ` (${c.setCode})` : ""}`;
  const pk = c.printing;
  const rar = c.rarity && rarityLabel(c.rarity) !== c.cardType ? rarityLabel(c.rarity) : null;
  const what = c.typeLine ?? c.cardType ?? "card";
  const stats = [
    c.manaCost ? `costs ${c.manaCost}` : null,
    c.manaValue != null && c.manaValue > 0 ? `has mana value ${c.manaValue}` : null,
    c.pt ? `is a ${c.pt}` : null,
    c.loyalty ? `starts with ${c.loyalty} loyalty` : null,
  ].filter(Boolean) as string[];

  // Specials open with the printing: it is what makes this page different from
  // its siblings, and the phrase a collector types ("sol ring borderless").
  if (isSpecialPrinting(pk)) {
    return sentences(
      `This page covers the ${printingProse(pk)} printing of ${c.name}${num}, ${/^[aeiou]/i.test(what) ? "an" : "a"} ${colour && !/land/i.test(what) ? `${colour} ` : ""}${what} from ${where}`,
      rar && c.rarity !== "L" && c.rarity !== "P" && `It is printed at ${rar} rarity`,
    );
  }
  return sentences(
    `${c.name}${num} is ${/^[aeiou]/i.test(colour || what) ? "an" : "a"} ${colour && !/land/i.test(what) ? `${colour} ` : ""}${what} from ${where}`,
    stats.length ? `It ${stats.join(", ").replace(/, ([^,]*)$/, " and $1")}` : null,
    c.commander && "It can be your commander",
    rar && `It is printed at ${rar} rarity`,
  );
}

// ── 1. Rules text and legality ───────────────────────────────────────────────
function rulesText(c: NarrativeInput): string | null {
  const parts: string[] = [];
  const ks = c.keywords;
  if (ks.length) {
    const list = ks.slice(0, 3);
    parts.push(
      ks.length === 1
        ? `The one keyword in its text is ${list[0]}`
        : `Its text prints ${list.join(", ").replace(/, ([^,]*)$/, " and $1")}${ks.length > 3 ? " among others" : ""}`,
    );
  }
  if (c.legalIn.length) {
    const shown = c.legalIn.slice(0, 4);
    parts.push(`it is legal in ${shown.join(", ").replace(/, ([^,]*)$/, " and $1")}${c.legalIn.length > 4 ? ` and ${c.legalIn.length - 4} more ${plural(c.legalIn.length - 4, "format")}` : ""}`);
  }
  if (!parts.length) return null;
  return sentences(...parts);
}

// ── 2. Printing and siblings ─────────────────────────────────────────────────
function printingParagraph(c: NarrativeInput): string | null {
  const others = c.printings.filter((p) => p.marketUsd != null);
  const mine = c.marketUsd;
  if (!c.printings.length) {
    return isSpecialPrinting(c.printing)
      ? sentences(`We track no other printing of ${c.number ?? c.name} in this set, so there is no base card here to compare its price with`)
      : null;
  }
  const n = c.printings.length;
  const head = `${c.number ?? c.name} exists in ${n + 1} printings on TCGplayer, and each is priced as its own product`;
  if (mine == null || !others.length) {
    return sentences(head, "None of the others has a TCGplayer market price to set beside this one yet");
  }
  const priciest = others.reduce((a, b) => ((b.marketUsd ?? 0) > (a.marketUsd ?? 0) ? b : a));
  const cheapest = others.reduce((a, b) => ((b.marketUsd ?? 0) < (a.marketUsd ?? 0) ? b : a));
  const base = c.printings.find((p) => p.label === "Standard" && p.marketUsd != null);
  const out: string[] = [head];
  if (isSpecialPrinting(c.printing) && base?.marketUsd) {
    const ratio = mine / base.marketUsd;
    out.push(
      ratio >= 1.15
        ? `At ${usd(mine)} on TCGplayer this ${PRINTING_SHORT[c.printing] ?? "special"} print is ${ratio >= 10 ? `${Math.round(ratio)}x` : `${ratio.toFixed(1)}x`} the standard print at ${usd(base.marketUsd)}`
        : ratio <= 0.87
          ? `Unusually, it sits below the standard print: ${usd(mine)} against ${usd(base.marketUsd)}`
          : `Its ${usd(mine)} is within a few percent of the standard print's ${usd(base.marketUsd)}, so the art costs you almost nothing extra`,
    );
  } else if (!isSpecialPrinting(c.printing)) {
    if (priciest.marketUsd! > mine * 1.5) {
      out.push(
        `The standard print is the one to play with at ${usd(mine)}, while the ${priciest.label} print is the collector's version at ${usd(priciest.marketUsd)}`,
      );
    } else {
      out.push(`The spread between printings is narrow here: from ${usd(cheapest.marketUsd)} to ${usd(priciest.marketUsd)} against this print's ${usd(mine)}`);
    }
  }
  const listed = c.printings
    .filter((p) => p.marketUsd != null)
    .sort((a, b) => (b.marketUsd ?? 0) - (a.marketUsd ?? 0))
    .slice(0, 4)
    .map((p) => `${p.label} ${usd(p.marketUsd)}`);
  if (listed.length) out.push(`For reference the other printings read ${listed.join(", ").replace(/, ([^,]*)$/, " and $1")} on TCGplayer`);
  return sentences(...out);
}

// ── 3. Price: reference against listings ─────────────────────────────────────
function pricePara(c: NarrativeInput): string | null {
  const b = c.baseline;
  const low = b.lowestCents;
  const ref = c.marketUsd;
  if (low == null && ref == null) return null;
  const out: string[] = [];
  if (ref != null && low != null && b.currency === "USD") {
    const d = pctOf(low, ref);
    out.push(
      d >= 10
        ? `TCGplayer's market price, built from recent sales, is ${usd(ref)}, and the cheapest listing we track in ${b.place} is ${money(low, b.country)}, ${d}% above it`
        : d <= -10
          ? `The cheapest listing we track in ${b.place} is ${money(low, b.country)}, ${Math.abs(d)}% below TCGplayer's ${usd(ref)} market price`
          : `The cheapest listing in ${b.place} is ${money(low, b.country)}, level with TCGplayer's ${usd(ref)} market price`,
    );
  } else if (ref != null && low != null) {
    out.push(
      `TCGplayer's market price is ${usd(ref)} (US dollars), while the cheapest listing we track in ${b.place} is ${money(low, b.country)} in ${b.currency}; the two are different currencies, so read the markets table below for the converted gap`,
    );
  } else if (low != null) {
    out.push(`The cheapest listing we track in ${b.place} is ${money(low, b.country)}, with no TCGplayer market price yet to check it against`);
  } else if (ref != null) {
    out.push(`TCGplayer's market price is ${usd(ref)}, but no store we track in ${b.place} has a copy in stock right now`);
  }
  // Stock depth
  if (low != null && b.storeCount > 0) {
    if (b.storeCount === 1) {
      out.push(`Only one store has it in ${b.place}, so the price is whatever that shop asks and there is no second quote to check it against`);
    } else if (b.secondCents != null && b.secondCents > low) {
      const gap = pctOf(b.secondCents, low);
      out.push(
        `${b.storeCount} stores have it in stock, and the next-cheapest listing is ${money(b.secondCents, b.country)}${gap >= 15 ? `, ${gap}% more than the cheapest, so the first row is worth taking` : `, only ${gap}% more, so postage will decide the order`}`,
      );
    } else {
      out.push(`${b.storeCount} ${plural(b.storeCount, "store")} stock it in ${b.place}`);
    }
  } else if (low != null) {
    out.push(`That listing is a marketplace or reference row rather than one of the stores we track`);
  }
  return sentences(...out);
}

// ── 4. Cross-market spread ───────────────────────────────────────────────────
function marketsPara(c: NarrativeInput): string | null {
  const have = c.markets.filter((m) => m.lowestCents != null);
  if (have.length < 2) {
    if (have.length === 1 && have[0].country !== c.baseline.country) {
      return sentences(`${COUNTRIES[have[0].country].place === have[0].place ? have[0].place : have[0].place} is currently the only one of our six markets with a copy in stock, at ${money(have[0].lowestCents, have[0].country)}`);
    }
    return null;
  }
  const rows = have
    .map((m) => ({ m, usd: toUsdCents(m.lowestCents!, m.currency) }))
    .sort((a, b) => a.usd - b.usd);
  const lo = rows[0];
  const hi = rows[rows.length - 1];
  const spread = lo.usd > 0 ? pctOf(hi.usd, lo.usd) : 0;
  const out: string[] = [];
  if (lo.m.country === c.baseline.country) {
    out.push(`${capitalise(c.baseline.place)} is the cheapest of the ${have.length} markets that have it, and ${hi.m.place} is dearest at about ${spread}% more once converted`);
  } else if (c.baseline.lowestCents != null) {
    const mine = rows.find((r) => r.m.country === c.baseline.country);
    const gap = mine && lo.usd > 0 ? pctOf(mine.usd, lo.usd) : null;
    out.push(
      gap != null && gap >= 8
        ? `Across ${have.length} markets, ${lo.m.place} has it cheapest, about ${gap}% below ${c.baseline.place} before postage and import tax`
        : `Across ${have.length} markets the prices sit close together; ${lo.m.place} is cheapest, but not by enough to cover shipping`,
    );
  } else {
    out.push(`${capitalise(lo.m.place)} has the lowest price of the ${have.length} markets stocking it, ${money(lo.m.lowestCents, lo.m.country)}`);
  }
  const list = rows.map((r) => `${money(r.m.lowestCents, r.m.country)} in ${r.m.place}`);
  out.push(`In each market's own currency the cheapest listings read ${list.join(", ").replace(/, ([^,]*)$/, " and $1")}`);
  out.push("Conversions use indicative exchange rates, and postage, duty and import tax are not included, so a cheaper market elsewhere is a fact about listings and not a reason to import");
  return sentences(...out);
}

// ── 5. Trajectory ────────────────────────────────────────────────────────────
function trendPara(c: NarrativeInput): string | null {
  const { change7d: d7, change30d: d30, high90Usd: hi, marketUsd: now } = c;
  if (d7 == null && d30 == null && hi == null) return null;
  const out: string[] = [];
  if (d7 != null && d30 != null) {
    const same = Math.sign(d7) === Math.sign(d30) || Math.abs(d7) < 1;
    if (Math.abs(d7) < 2 && Math.abs(d30) < 3) out.push(`TCGplayer's market price has barely moved: ${d7 >= 0 ? "+" : ""}${d7}% over a week and ${d30 >= 0 ? "+" : ""}${d30}% over a month`);
    else if (same) out.push(`The market price is ${d30 > 0 ? "up" : "down"} ${Math.abs(d30)}% over 30 days, and ${Math.abs(d7) >= 1 ? `${d7 > 0 ? "up" : "down"} ${Math.abs(d7)}% of that in the last 7` : "flat this week"}`);
    else out.push(`The week and the month disagree: ${d7 > 0 ? "up" : "down"} ${Math.abs(d7)}% over 7 days against ${d30 > 0 ? "up" : "down"} ${Math.abs(d30)}% over 30, which usually means a recent turn rather than a trend`);
  } else if (d7 != null) {
    out.push(`The market price moved ${d7 >= 0 ? "+" : ""}${d7}% over the last 7 days; there is not yet a 30-day window to set that against`);
  } else if (d30 != null) {
    out.push(`The market price moved ${d30 >= 0 ? "+" : ""}${d30}% over the last 30 days`);
  }
  if (hi != null && now != null && hi > 0) {
    const off = pctOf(now, hi);
    if (off <= -15) out.push(`That leaves it ${Math.abs(off)}% under its 90-day high of ${usd(hi)}`);
    else if (off >= -2) out.push(`It is trading at its 90-day high of ${usd(hi)}`);
    else out.push(`Its 90-day high was ${usd(hi)}, ${Math.abs(off)}% above today's price`);
  }
  return out.length ? sentences(...out) : null;
}

// ── 6. Set context ───────────────────────────────────────────────────────────
function setPara(c: NarrativeInput): string | null {
  const ctx = c.setContext;
  const kind = setKindProse[c.setKind];
  const out: string[] = [];
  const released = c.releasedOn;
  const upcoming = released != null && released > c.today;
  if (upcoming) {
    out.push(`${c.setName} has not been released yet, so any price on this page is a pre-order or pre-release market, and it can move a lot once boxes are opened`);
  } else if (kind) {
    out.push(`${c.setName} is ${kind}${released ? `, released ${new Date(released + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}` : ""}`);
  }
  if (ctx && ctx.pricedInSet >= 10 && c.marketUsd != null) {
    const share = Math.round((ctx.cheaperThan / ctx.pricedInSet) * 100);
    out.push(
      share >= 95
        ? `Among the ${ctx.pricedInSet} priced cards in the set, only a handful are worth more, which makes it one of the set's chase cards`
        : share >= 60
          ? `It is dearer than ${share}% of the ${ctx.pricedInSet} priced cards in the set`
          : share >= 30
            ? `It sits in the middle of the set's ${ctx.pricedInSet} priced cards`
            : `It is one of the cheaper cards in the set, below ${100 - share}% of the ${ctx.pricedInSet} that have a price`,
    );
    if (ctx.medianUsd != null) out.push(`The set's median card is ${usd(ctx.medianUsd)}`);
  }
  if (c.sameNameElsewhere > 0) {
    out.push(`${c.name} has ${c.sameNameElsewhere} other ${plural(c.sameNameElsewhere, "card")} in the database, listed further down the page`);
  }
  return out.length ? sentences(...out) : null;
}

export function buildNarrative(input: NarrativeInput): Narrative {
  const paras = [identity(input), rulesText(input), printingParagraph(input), pricePara(input), marketsPara(input), trendPara(input), setPara(input)]
    .filter((p): p is string => Boolean(p && p.trim()))
    .map(tidy);
  // Identity and rules read as one opening block; the rest stand alone.
  const out: string[] = [];
  let i = 0;
  if (paras.length && rulesText(input)) {
    out.push(`${paras[0]} ${paras[1]}`);
    i = 2;
  }
  for (; i < paras.length; i++) out.push(paras[i]);
  return { paragraphs: out, words: out.join(" ").split(/\s+/).filter(Boolean).length };
}
