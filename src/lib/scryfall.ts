// src/lib/scryfall.ts (owner WP01, FROZEN). Scryfall bulk data: fetched ONLY in GitHub Actions (never on Vercel), streamed line by line (default_cards is 79 MB gz / 634 MB raw; parse about 5 s, 124-184 MB RSS), never JSON.parse the whole file.
// Headers on every request to api.scryfall.com: User-Agent (the build string in CI, "MTGCompare/1.0 (+<SITE_URL>)" in production code, never a personal email) and Accept: */*. One GET /bulk-data per run, one GET /sets (626 KB) when the bulk
// updated_at changed, one download from data.scryfall.io (no rate limit). NEVER /cards/*. A 429 is never retried through: back off 30 s once, then continue in SCRYFALL_MODE=off.
// Scryfall's purchase_uris / related_uris carry Scryfall's affiliate codes and are NEVER stored or rendered; Scryfall prices are never read.
export interface ScryfallRow {                       // slim, paper only (games includes "paper"); about 450 B in memory
  id: string; oracleId: string; name: string; set: string; setName: string; setType: string; cn: string; releasedAt: string; lang: string;
  rarity: string; layout: string; manaCost: string; cmc: number; typeLine: string; colors: string[]; colorIdentity: string[];
  power: string | null; toughness: string | null; loyalty: string | null; keywords: string[]; oracleText: string | null;
  legalities: Record<string, string>; finishes: string[]; frameEffects: string[]; promoTypes: string[]; borderColor: string; fullArt: boolean;
  promo: boolean; reserved: boolean; gameChanger: boolean; edhrecRank: number | null; tcgplayerId: number | null; tcgplayerEtchedId: number | null;
  imageStatus: string; nfaces: number; flavorName: string | null; printedName: string | null; digital: boolean; oversized: boolean; games: string[];
  faces: string[]; faceFlavor: (string | null)[];   // face names and face flavor names (transform / reversible)
}
export interface ScryfallSet { code: string; name: string; setType: string; tcgplayerId: number | null; releasedAt: string | null; parentSetCode: string | null; digital: boolean }
export interface ScryfallIndex { byTcgId: Map<number, ScryfallRow[]>; byEtchedId: Map<number, ScryfallRow[]>; bySet: Map<string, ScryfallRow[]>; oracleByNameKey: Map<string, Set<string>> /* folded oracle AND face names */; sets: Map<string, ScryfallSet> }
export type LinkLevel = "id" | "etched" | "fallback" | "variant" | "oracle-name" | "none";
export type ClaimMap = Map<string, number>;          // Scryfall printing id -> productId that claimed it by id
export interface JoinResult { linkLevel: LinkLevel; oracleId: string | null; row: ScryfallRow | null; starRow: ScryfallRow | null; rootProductId: number | null; ambiguous: boolean }
export declare function fetchBulkListing(opts?: { fetch?: typeof fetch }): Promise<{ updatedAt: string; jsonlUrl: string; compressedSize: number }>;
export declare function streamDefaultCards(url: string, onRow: (r: ScryfallRow) => void, opts?: { fetch?: typeof fetch }): Promise<{ rows: number; kept: number }>;
export declare function slimScryfall(raw: unknown): ScryfallRow | null;           // pure; null for non-paper rows
export declare function buildScryfallIndex(rows: Iterable<ScryfallRow>, sets: ScryfallSet[]): ScryfallIndex;
export declare function joinProduct(p: { productId: number; groupId: number; name: string; number: string | null; cls: number }, g: { name: string; abbreviation: string; kind: string }, idx: ScryfallIndex, claimed: ClaimMap): JoinResult;   // the chain of 6.3
