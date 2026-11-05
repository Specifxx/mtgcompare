// A listing the store will not post: "local pickup only", "in-store only", "collection only", "no shipping". Such a listing is not a
// price a visitor elsewhere can pay, and the store's measured postage (src/lib/shipping.ts) does not apply to it, so the importer leaves
// it out rather than show it with a shipping figure (2026-11-05, a visitor's report on a pre-order). Read from the title, the tags and
// the description the feed gives; rules here may only refuse more, never loosen. "Pickup available" is not "pickup only".
const PICKUP_ONLY = new RegExp(
  [
    // "local pickup only", "in-store pick up only", "store pickup only", "pickup in store only", "collection only", "click & collect only"
    String.raw`\b(?:local|in[- ]?store|store|shop|club|counter)?[- ]?(?:pick[- ]?up|collection|collect|click\s*(?:&|and|\+|n|'n')\s*collect)(?:\s+(?:in|from|at)[- ]?(?:store|shop))?\s+only\b`,
    // "in-store only", "instore only"
    String.raw`\bin[- ]?store\s+only\b`,
    // "only available for pickup", "available for local pickup only", "only for in store collection"
    String.raw`\bonly\s+(?:available\s+)?(?:for|via|by|through)\s+(?:local\s+|in[- ]?store\s+)?(?:pick[- ]?up|collection)\b`,
    String.raw`\b(?:for|via|by)\s+(?:local\s+|in[- ]?store\s+)?(?:pick[- ]?up|collection)\s+only\b`,
    // "no shipping", "no postage", "no delivery (pickup only)"; not "no shipping fee / charge / cost" (a free-postage promise)
    String.raw`\bno\s+(?:shipping|postage|delivery|mail\s*order)\b(?!\s*(?:fee|cost|charge|surcharge|label)s?\b)`,
    String.raw`\bnot\s+(?:available|eligible)\s+for\s+(?:shipping|delivery|postage|mail\s*order)\b`,
    // "cannot be shipped", "can't be posted", "will not be mailed"; not "cannot be shipped to PO boxes / outside the US / overseas",
    // which is a shipping policy, not a refusal to post
    String.raw`\b(?:can\s*not|cannot|can't|will\s+not|won't)\s+be\s+(?:shipped|posted|mailed|delivered)\b(?!\s+(?:to|outside|overseas|internationally|abroad|until|before|prior|separately|together|with)\b)`,
    // "this item does not ship", "these will not ship": the item, not a destination
    String.raw`\b(?:this|these|item|items|product|products)\s+(?:does\s+not|doesn't|do\s+not|don't|will\s+not|won't|cannot|can't)\s+(?:ship|post|be\s+(?:shipped|posted|mailed))\b(?!\s+(?:to|outside|overseas|internationally|abroad|until|before|prior|separately|together|with)\b)`,
  ].join("|"),
  "i",
);

/** Whether the text says the item is collected from the store and never posted. */
export function isPickupOnly(text: string | null | undefined): boolean {
  return !!text && PICKUP_ONLY.test(text);
}

/** Tags, a title and a description (HTML allowed) joined into one text for isPickupOnly. */
export function pickupText(parts: readonly (string | null | undefined)[]): string {
  return parts
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .map((s) => s.replace(/<[^>]+>/g, " "))
    .join(" \n ");
}
