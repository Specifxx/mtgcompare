// src/lib/search.ts (owner WP07). FROZEN: the type and the signature. The body is WP07's; the acceptance table is section 7.6 of the contract and becomes tests/search.test.ts.
// Pure: no I/O. `ctx.setCodes` is the set of known lower-case Scryfall codes (getScrySets) plus Set.tok values.
import type { Finish, TreatmentKey } from "./constants";

export interface ParsedSearch {
  text: string;                    // the remaining name text, folded
  set?: string;                    // a Scryfall set code (lower case) or Set.tok
  number?: string;                 // a collector number as typed; compare with nkey()
  finish?: Finish;                 // "foil" / "nonfoil" words
  etched?: boolean;                // "etched" / "foil etched"
  treat: TreatmentKey[];           // words found in TREATMENT_BY_SYNONYM
}
/** A set code is taken from the text only when it CONTAINS A DIGIT (m11, 2x2, c21, mh3, 40k) or is written `set:ice`, `e:ice`, `(ice)` or followed by a collector number ("ice 123"): of the 719 all-letter Scryfall codes 42 are also a word in a card name (war 129 oracles, one 77, all 54, ice 30 ...). */
export declare function parseSearch(q: string, ctx: { setCodes: ReadonlySet<string> }): ParsedSearch;
