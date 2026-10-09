import { DECK_LINE_CAP } from "./deck";
import { parseMinCondition, type MinCondition } from "./basket-condition";
import { RARITY_KEYS } from "./constants";
import { parseCursor, type SetGapCursor } from "./set-gap";
import { parseScope, type SetScope } from "./set-scope";

// What a Best Basket request may send, parsed the same way for every caller
// (RiftCompare's lib/basket-request.ts). Pure (no database), so the tier story
// can be tested behaviourally: nothing here looks at the account. Who may send
// one is the route's call: since 2026-10-07 Best Basket is Premium only, and
// anyone else gets a 403 before this parser runs (app/api/basket/route.ts).
//
// MTG Compare differences:
//   • "watchlist" carries the watched card ids in the body (`ids`, from the
//     shared watchlist store, lib/use-watchlist.ts): signed in that is the
//     account list, signed out there is no basket at all.
//   • "binder" (replacement cost) and "set" (Finish a set) read the portfolio
//     and the set checklist (the collection track, merged). The set is named by
//     its SLUG (`set`), the one the set tracker links with.
export type BasketSourceKind = "deck" | "watchlist" | "binder" | "set";

/** Binder, Finish a set and "skip copies I own" (wave2-plan Track 3 item 1: on once the collection routes exist). */
export const BASKET_COLLECTION_SOURCES = true;

export interface PickedLine {
  cardId: string;
  qty: number;
}

export interface BasketRequest {
  source: BasketSourceKind;
  skipOwned: boolean;
  text: string;
  picked: PickedLine[];
  /** The watchlist source's card ids (decimal strings), at most DECK_LINE_CAP. */
  ids: string[];
  // The minimum condition asked for (lib/basket-condition.ts), "any" when the
  // request says nothing so every caller prices what it always did. Whether it
  // is HONOURED is the route's call: it is Premium's.
  minCondition: MinCondition;
  // The member changed the switch: remember it (User.basketPrefs).
  saveMinCondition: boolean;
  // The "set" source's own inputs (ignored by every other source): the set's
  // slug ("" = none or malformed; the route checks it is a known, released
  // set), which printings count, an optional rarity and per-card price ceiling,
  // and the cursor a later chunk starts strictly after (null = the cheapest end).
  setSlug: string;
  scope: SetScope;
  rarity: string | null;
  maxPriceCents: number | null;
  after: SetGapCursor | null;
}

// A pasted or picked quantity, clamped server-side whatever the client sends.
export const clampQty = (q: number) => Math.max(1, Math.min(99, Math.round(q)));

const ID = /^\d{1,9}$/;

export function parseBasketRequest(raw: unknown): BasketRequest {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const source: BasketSourceKind =
    body.source === "watchlist" || body.source === "binder" || body.source === "set" ? body.source : "deck";
  // The binder source prices replacing what you hold, so "skip what you own"
  // would leave nothing — it is ignored there. Finishing a set is the opposite:
  // it prices only what is missing, so skipping copies you own is locked ON.
  const skipOwned = BASKET_COLLECTION_SOURCES && (source === "set" ? true : body.skipOwned === true && source !== "binder");
  const setSlug = typeof body.set === "string" && /^[a-z0-9-]{1,80}$/i.test(body.set) ? body.set.toLowerCase() : "";
  const rarity = typeof body.rarity === "string" && (RARITY_KEYS as readonly string[]).includes(body.rarity) ? body.rarity : null;
  const ceiling = typeof body.maxPriceCents === "number" && Number.isFinite(body.maxPriceCents) ? Math.floor(body.maxPriceCents) : 0;
  const text = typeof body.text === "string" ? body.text.slice(0, 20_000) : "";
  const picked: PickedLine[] = Array.isArray(body.lines)
    ? body.lines
        .filter((l: unknown): l is PickedLine => !!l && typeof (l as PickedLine).cardId === "string" && ID.test((l as PickedLine).cardId) && Number.isFinite((l as PickedLine).qty))
        .slice(0, DECK_LINE_CAP)
    : [];
  const ids: string[] = Array.isArray(body.ids)
    ? [...new Set(body.ids.map((x: unknown) => (typeof x === "number" ? String(x) : x)).filter((x: unknown): x is string => typeof x === "string" && ID.test(x)))].slice(0, DECK_LINE_CAP)
    : [];
  return {
    source,
    skipOwned,
    text,
    picked,
    ids: source === "watchlist" ? ids : [],
    minCondition: parseMinCondition(body.minCondition, "any"),
    saveMinCondition: body.saveMinCondition === true,
    setSlug: source === "set" ? setSlug : "",
    scope: parseScope(body.scope),
    rarity: source === "set" ? rarity : null,
    maxPriceCents: source === "set" && ceiling > 0 && ceiling <= 10_000_000 ? ceiling : null,
    after: source === "set" ? parseCursor(body.after) : null,
  };
}
