import { SITE } from "@/site.config";

// Titles the way Rift Compare writes them (its card and set pages, DECISIONS.md
// "Titles that fit"): Google cuts a title around 60 characters, so each page
// offers a ladder of candidates, longest and most specific first, and takes the
// first that fits. Each candidate is tried with " | <site>" and then bare, so a
// title keeps the brand when it fits and never gives up words people search for it.

export const TITLE_MAX = 60;

/** The first candidate that fits, as an absolute title (the layout's template would add the brand again). */
export function fitTitle(candidates: string[], max = TITLE_MAX): { absolute: string } {
  const suffix = ` | ${SITE.name}`;
  for (const t of candidates) {
    if (`${t}${suffix}`.length <= max) return { absolute: `${t}${suffix}` };
    if (t.length <= max) return { absolute: t };
  }
  return { absolute: candidates[candidates.length - 1] };
}

/** "Card List: All 120 Cards + Prices" for a set page, the phrase Rift Compare's set pages rank for. */
export function setTitleCandidates(setName: string, cardCount: number, upcoming = false): string[] {
  const g = SITE.gameShort;
  const named = setName.toLowerCase().includes(g.toLowerCase()) ? setName : `${g} ${setName}`;
  // Spoiler season (Rift Compare's best non-brand searches, "riftbound legacy spoilers"): until release day a set with
  // revealed cards is titled for the spoiler search; release day turns it back into the card list at the same URL.
  if (upcoming && cardCount > 0)
    return [`${named} Spoilers: ${cardCount} Cards Revealed + Prices`, `${named} Spoilers: ${cardCount} Cards Revealed`, `${setName} Spoilers: ${cardCount} Cards Revealed`, `${setName} Spoilers`];
  return [
    ...(cardCount > 0 ? [`${named} Card List: All ${cardCount} Cards + Prices`, `${setName} Card List: All ${cardCount} Cards + Prices`] : []),
    `${named} Card List & Prices`,
    `${setName} Card List & Prices`,
    `${setName} Card List`,
  ];
}

/** "<Card> <number> Price — <game> <set>", stepping down to the card and its number. */
export function cardTitleCandidates(name: string, number: string | null, setName: string | null, sealed: boolean): string[] {
  const g = SITE.gameShort;
  // Store names often carry the number already ("Jagd Doga (GD05-057)"): say it once.
  const bare = number ? name.replace(` (${number})`, "") : name;
  const head = number && !sealed && !bare.includes(number) ? `${bare} ${number}` : bare;
  const out: string[] = [];
  if (setName && !bare.includes(setName)) out.push(`${head} Price — ${g} ${setName}`, `${head} Price — ${setName}`);
  out.push(`${head} Price — ${g}`, `${head} Price`, head);
  return out;
}
