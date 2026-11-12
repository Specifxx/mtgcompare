// A listing a visitor cannot simply buy: "invite only", "by invitation", a raffle, a lottery or a draw entry, a "request an
// invite" page (2026-11-12, a visitor's report: most of the cheapest prices were invite-only offers). Such a price is not
// one anyone can pay, so it is never a store's price, never the cheapest and never a deal: the importer leaves it out and the
// reader drops any such row an older export still holds. Read from the title, the handle, the tags, the description and the
// variant names; rules here may only refuse more, never loosen. A store's own name ("Lucky Hits") is not a signal.
const INVITE_ONLY = new RegExp(
  [
    // "invite only", "invite-only", "invitation only", "invited customers only", "by invitation", "invitation required"
    String.raw`\binvit(?:e|ed|ation)[- ]?only\b`,
    String.raw`\bby[- ]invit(?:e|ation)\b`,
    String.raw`\binvit(?:e|ation)s?\s+(?:required|needed|only)\b`,
    String.raw`\b(?:available|sold|offered|open)\s+(?:to|for)\s+invited\s+(?:customers|members|buyers|accounts)\b`,
    String.raw`\b(?:request|apply\s+for)\s+(?:an?\s+)?invit(?:e|ation)\b`,
    // raffles, lotteries, ballots and draws: the buyer wins the right to buy
    String.raw`\braffle\b`,
    String.raw`\blotter(?:y|ies)\b`,
    String.raw`\b(?:purchase\s+)?ballot\b`,
    String.raw`\bdraw\s+(?:entry|entries|ticket)\b`,
    String.raw`\benter\s+(?:the\s+|our\s+)?(?:draw|lottery|raffle)\b`,
    String.raw`\bselected\s+(?:customers|buyers|winners)\s+(?:only|will\s+be)\b`,
    String.raw`\bwinners?\s+(?:only|will\s+be\s+(?:contacted|notified|emailed))\b`,
  ].join("|"),
  "i",
);

/** Whether the text says the item is sold only by invitation, raffle, lottery or draw. */
export function isInviteOnly(text: string | null | undefined): boolean {
  return !!text && INVITE_ONLY.test(text.replace(/[_/]+/g, " "));
}

/** Parts joined into one text for isInviteOnly. */
export function inviteText(parts: readonly (string | null | undefined)[]): string {
  return parts
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .map((s) => s.replace(/<[^>]+>/g, " "))
    .join(" \n ");
}

/** A listing's own link: `/products/raffle-purchase`, `…-invite-only-…`. The slug's dashes are spaces to the rules above. */
export function inviteOnlyUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return isInviteOnly(decodeURIComponent(new URL(url).pathname).replace(/-/g, " "));
  } catch {
    return false;
  }
}
