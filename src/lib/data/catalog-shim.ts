// src/lib/data/catalog-shim.ts (owner WP02; DELETED AT M3). The TRANSITION SHIM behind `getCatalog()`: 57 files import it today, 33 of them scan `cat.cards`, and the migration of those files is spread over 15 packages. Until each package has moved, the old name keeps compiling.
// Three rules keep it from becoming the architecture (critique 7, DP-01):
//   1. It is built from the BROWSE INDEX (the same rows the lists show), never from a table: 98,991 CardLite objects, about 77 MB of heap and 0.3 s, once per instance and ref (5-minute memo).
//   2. It REFUSES TO RUN in a production deployment (`VERCEL_ENV === "production"`): a page that still needs it fails its smoke test on the preview, not on the live site. There is no override. Dev, test and preview run it with ONE console.warn per process.
//   3. A ratchet owns it: tests/no-get-catalog.test.ts (WP19) counts the importers (57 at C0) per package, fails when the count goes UP, and at milestone M3 (RATCHET_STRICT=1) fails until it is 0. The milestone commit deletes this file, `Catalog` in types.ts and the line in api.ts.
import { PRICE_MASK } from "../constants";
import type { BrowseIndex } from "./plane/browse-index";
import type { Catalog, CardLite, SetLite } from "./types";

export class CatalogShimError extends Error { constructor() { super("getCatalog() is a transition shim and does not run in a production deployment: use getCardPage, getCardsByIds, getCardLookup, getSetIndex or the bounded views of section 7 (contract 7.9)"); this.name = "CatalogShimError"; } }
export const shimAllowed = (env: Record<string, string | undefined> = process.env): boolean => env.VERCEL_ENV !== "production";
export const SHIM_MEMO_MS = 300_000;
/** Pure: the LISTED class-0 rows of an index as the old Catalog shape. The rows are the headline unit of each card (the same `liteAt` the lists use). */
export function buildCatalog(ix: BrowseIndex, sets: readonly SetLite[], pricesAt: string): Catalog {
  const cards: CardLite[] = [];
  for (let i = 0; i < ix.n; i++) if ((ix.mk[i]! & PRICE_MASK.LISTED) !== 0 && ix.cls[i] === 0) cards.push(ix.liteAt(i));
  const setById = new Map(sets.map((s) => [s.id, s] as const)), setBySlug = new Map(sets.map((s) => [s.slug, s] as const));
  return { cards, sets: [...sets], setById, setBySlug, bySlug: new Map(cards.map((c) => [c.slug, c] as const)), byId: new Map(cards.map((c) => [c.id, c] as const)), pricesAt, complete: true };
}
/** The name pages import. Implemented in catalog.ts next to getBrowseIndex (it needs the typed-array engine): `shimAllowed()` or throw CatalogShimError; a 5-minute process memo keyed by the data commit; one console.warn per process; buildCatalog(ix, sets, pricesAt). Declared in api.ts. */
