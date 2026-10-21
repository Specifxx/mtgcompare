// The server half of the context whitelist (the browser's half is ebay-context.ts): turns a `c`
// query value into a ParsedContext, or null. Kept apart because it needs sets.ts and sealed-title.ts
// (big tables the browser must not download).
//
// The route is not an open proxy and has no upstream at all: a request names a REGION (one of the
// seven) and a CONTEXT from the list below, and the answer is a read of rows the daily import stored.
// Nothing a visitor sends goes anywhere but into a parameterised SELECT on a whitelisted key.
//
//   chase | sealed        the generic feeds                      (home, landing, browse, releases, store, 404, pre-footer)
//   set:<slug>            a slug in sets.ts                      → that set's chase feed, else chase
//   type:<slug>           a slug in PRODUCT_TYPES                → that type's feed, else sealed
//   item:<slug>           a product slug (looked up by the route: unknown → nothing)
//                                                                → the product's feed, else its type's, else sealed
import { TYPE_BY_SLUG } from "./sealed-title";
import { SET_BY_SLUG } from "./sets";

export type ContextKind = "chase" | "sealed" | "set" | "type" | "item";

export interface ParsedContext {
  /** The canonical request string ("set:surging-sparks"). */
  id: string;
  kind: ContextKind;
  /** The set, type or product slug (null for chase and sealed). */
  slug: string | null;
}

const MAX_CONTEXT_LENGTH = 110;

/**
 * Parse a `c` query value. Only exact members of the whitelist parse; everything else (odd slugs, "../",
 * upper case, huge strings, non-strings) is null. A product slug is only SHAPE-checked here; the route's
 * lookup decides whether it exists. Never throws.
 */
export function parseContext(raw: unknown): ParsedContext | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_CONTEXT_LENGTH) return null;
  if (raw === "chase" || raw === "sealed") return { id: raw, kind: raw, slug: null };
  const m = /^(set|type|item):([a-z0-9][a-z0-9-]{0,99})$/.exec(raw);
  if (!m) return null;
  const [, kind, slug] = m;
  if (kind === "set") return SET_BY_SLUG.has(slug) ? { id: raw, kind: "set", slug } : null;
  if (kind === "type") return TYPE_BY_SLUG.has(slug) ? { id: raw, kind: "type", slug } : null;
  return { id: raw, kind: "item", slug };
}
