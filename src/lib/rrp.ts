// US MSRP, so US pages can say "below MSRP": a fact about today's listing, not history.
//
// US only, and only where Wizards of the Coast published a list price for the set's product line: Wizards stopped printing MSRPs
// for most sets, and the site never invents one (CLAUDE.md). Each entry names its source. A box's price is never derived from a
// pack's, and a line whose products differ in price (a Commander deck and its Collector's Edition) has no entry.
import { TYPE_BY_LABEL, type TypeKey } from "./sealed-title";

export { RRP_AS_OF, RRP_NOTE } from "./rrp-note";

const BY_SET: Record<string, Partial<Record<TypeKey, number>>> = {
  // Wizards' "Collecting Magic: The Gathering | Star Trek" article (published 14 July 2026, read 16 October 2026): "MSRPs for
  // Magic: The Gathering | Star Trek will be set as follows". Its Commander Deck ($74.99) and Collector's Edition ($159.99), Beam
  // Me Up Bundle ($99.99) and Scene Box ($41.99) are multi-product lines here, so they carry no per-type MSRP.
  trk: {
    "play-booster": 699,
    "collector-booster": 3799,
    bundle: 6999,
    "draft-night": 11999,
  },
};

/** US MSRP in cents for a set product, or null when Wizards publishes none we trust. */
export function usMsrpCents(type: TypeKey, setCode: string | null): number | null {
  if (!setCode) return null;
  return BY_SET[setCode]?.[type] ?? null;
}

/** usMsrpCents() by the product type LABEL a Product row carries; null outside the US. */
export function usMsrpForCard(market: string, typeLabel: string, setCode: string | null): number | null {
  if (market !== "US") return null;
  const t = TYPE_BY_LABEL.get(typeLabel);
  return t ? usMsrpCents(t.key, setCode) : null;
}


