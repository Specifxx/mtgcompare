// Box worth: every set whose odds we have, copied from Wizards' own "Collecting" articles (src/lib/box-ev/types.ts has the rules).
// ADDING A SET: write <code>.ts from the set's Collecting article, add it here, run `npx tsx scripts/box-ev-report.ts <code>` and
// `npm test` (tests/box-ev.test.ts checks each outcome's cards against the counts Wizards prints, and every slot's sum).
import type { SetOdds } from "@/lib/box-ev/types";
import { ECL } from "./ecl";
import { EOE } from "./eoe";
import { TRK } from "./trk";

export const BOX_ODDS: readonly SetOdds[] = [TRK, ECL, EOE];

export const BOX_ODDS_BY_CODE: ReadonlyMap<string, SetOdds> = new Map(BOX_ODDS.map((s) => [s.code, s]));
