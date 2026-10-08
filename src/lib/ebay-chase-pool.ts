// The eBay chase pool: which printings the "Chase cards on eBay right now" strip is built from. PURE (no I/O), pinned by tests/ebay-chase-pool.test.ts on real Magic data.
//
// The pool must be DEAREST and POPULAR across the whole catalogue and DIVERSE, or the strip is six serialised Ravnica lands (the naive "dearest 24" was Alpha and Beta power plus
// US$25,000 one-offs; "dearest chase treatments" was 18 sets of foils at US$2,800+). So:
//   * only printings with a TCGplayer MARKET price (a thin single listing is an unsold asking price: never a candidate), not thin (market over 3x the low), with art, in English, paper;
//   * score = min(market, cap)^0.7 x (0.15 + pop) x chase boost x recent boost  (the allocator's formula, lib/ebay-plan.ts, on a printing);
//   * a greedy pick that decays the score by 0.5 per card already taken from its set and 0.8 per card from its bucket (bluechip / modern-chase / special / other), one printing per
//     name in the first 24 and at most two afterwards;
//   * a head of display quotas so the visible row also has recognisable, buyable cards: bands of >= US$500 and the mainstream US$40-500 alternate, distinct sets and names;
//   * the newest sets (released within 60 days) are guaranteed their slots.
// All dials live in CHASE, this one object, pinned by tests/ebay-chase-pool.test.ts; the pool is recomputed by the eBay job and written to EbayTrack.banner.

export interface ChaseCandidate {
  id: number;                       // productId of the printing
  nameKey: string;                  // the eBay unit: the NAME (oracle)
  setCode: string;
  setKind: string;                  // constants.ts SetKind: "expansion" | "masters" | "promo" | "secret-lair" | ...
  releasedOn: string | null;        // ISO date
  rarity: string;
  finish: "nonfoil" | "foil" | "etched";   // the finish that carries marketCents (NOT best-of-finishes)
  treatments: readonly string[];    // treatment keys of the printing
  chase: boolean;                   // isChasePrinting
  reserved: boolean;
  edhrecRank: number | null;
  marketCents: number | null;       // TCGplayer MARKET only (null: not a candidate)
  lowCents: number | null;
  hasArt: boolean;
  cls: number;                      // CARD_CLASS: only 0 (a card) is a candidate
  layout: string;
  lang: string;                     // "en" unless a lang-* treatment key says otherwise
  popularity?: number | null;       // our own 0..1 signal when we have traffic
  ownWeight?: number;               // wOur = min(1, totalViews / 50,000)
}

export interface ChaseBand { minCents: number; maxCents: number | null; slots: number }
export interface ChaseConfig {
  minCents: number; capCents: number; poolSize: number; hotDays: number; hotMinSlots: number; setDecay: number; bucketDecay: number;
  nameLimitFirst: number; firstN: number; nameLimit: number; recentDays: number; recentBoost: number; chaseBoost: number; thinMarketRatio: number; bands: ChaseBand[];
}
export const CHASE: ChaseConfig = {
  minCents: 4000, capCents: 200_000, poolSize: 64, hotDays: 60, hotMinSlots: 2, setDecay: 0.5, bucketDecay: 0.8, nameLimitFirst: 1, firstN: 24, nameLimit: 2,
  recentDays: 45, recentBoost: 1.2, chaseBoost: 1.15, thinMarketRatio: 3,
  bands: [{ minCents: 50_000, maxCents: null, slots: 3 }, { minCents: 4000, maxCents: 50_000, slots: 3 }],
};
const NOT_CANDIDATE_LAYOUTS = new Set(["art_series", "token", "double_faced_token", "emblem"]);
const NOT_CANDIDATE_KINDS = new Set(["art-series", "oversized", "unset"]);
const SPECIAL_KINDS = new Set(["promo", "promo-pack", "secret-lair", "list", "gold-border"]);
const SPECIAL_SETS = new Set(["sld", "slp", "plst"]);
const DAY = 86_400_000;
const ageDays = (c: ChaseCandidate, today: string): number => (c.releasedOn ? Math.floor((Date.parse(today) - Date.parse(c.releasedOn)) / DAY) : 9999);

export function isCandidate(c: ChaseCandidate, o: Partial<ChaseConfig> = {}): boolean {
  const k = { ...CHASE, ...o };
  if (c.lang !== "en" || c.cls !== 0 || !c.hasArt) return false;
  if (NOT_CANDIDATE_LAYOUTS.has(c.layout) || NOT_CANDIDATE_KINDS.has(c.setKind)) return false;
  if (c.marketCents == null || c.marketCents < k.minCents) return false;                         // market only: no low-price fallback
  if (c.lowCents != null && c.marketCents > k.thinMarketRatio * c.lowCents) return false;       // a market far above the cheapest listing is a thin, unsold price
  return true;
}
export type ChaseBucket = "bluechip" | "modern-chase" | "special" | "other";
export function bucketOf(c: ChaseCandidate, today: string): ChaseBucket {
  const age = ageDays(c, today);
  if (c.reserved || age > 365 * 20) return "bluechip";
  if (age <= 730 && c.chase) return "modern-chase";
  if (SPECIAL_KINDS.has(c.setKind) || SPECIAL_SETS.has(c.setCode.toLowerCase())) return "special";
  return "other";
}
/** min(market, cap)^0.7 x (0.15 + pop) x (chase ? 1.15 : 1) x (released within 45 days ? 1.2 : 1). pop = max(wOur x popularity + (1 - wOur) x 1/(1 + edhrec/1500), Reserved List ? 0.5 : 0). */
export function chaseScore(c: ChaseCandidate, today: string, o: Partial<ChaseConfig> = {}): number {
  const k = { ...CHASE, ...o };
  const edh = c.edhrecRank && c.edhrecRank > 0 ? 1 / (1 + c.edhrecRank / 1500) : 0;
  const w = Math.min(1, Math.max(0, c.ownWeight ?? 0));
  const pop = Math.max(w * (c.popularity ?? 0) + (1 - w) * edh, c.reserved ? 0.5 : 0);
  const v = Math.min(c.marketCents ?? 0, k.capCents) / 100;
  return Math.pow(v, 0.7) * (0.15 + pop) * (c.chase ? k.chaseBoost : 1) * (ageDays(c, today) <= k.recentDays ? k.recentBoost : 1);
}

interface Scored { c: ChaseCandidate; s: number; b: ChaseBucket }
const inBand = (c: ChaseCandidate, b: ChaseBand): boolean => (c.marketCents ?? 0) >= b.minCents && (b.maxCents == null || (c.marketCents ?? 0) < b.maxCents);

/** The pool, ordered (the first six are the visible row), deterministic (ties: lower id). */
export function selectChasePool(cs: readonly ChaseCandidate[], today: string, o: Partial<ChaseConfig> = {}): ChaseCandidate[] {
  const k = { ...CHASE, ...o };
  const pool: Scored[] = cs.filter((c) => isCandidate(c, k)).map((c) => ({ c, s: chaseScore(c, today, k), b: bucketOf(c, today) }));
  const picked: Scored[] = [];
  const names = new Map<string, number>(), sets = new Map<string, number>(), buckets = new Map<ChaseBucket, number>();
  const taken = new Set<number>();
  const eff = (e: Scored): number => e.s * Math.pow(k.setDecay, sets.get(e.c.setCode) ?? 0) * Math.pow(k.bucketDecay, buckets.get(e.b) ?? 0);
  const nameCap = (): number => (picked.length < k.firstN ? k.nameLimitFirst : k.nameLimit);
  const better = (a: Scored, b: Scored): boolean => { const x = eff(a), y = eff(b); return x !== y ? x > y : a.c.id < b.c.id; };
  const take = (e: Scored): void => {
    picked.push(e); taken.add(e.c.id);
    names.set(e.c.nameKey, (names.get(e.c.nameKey) ?? 0) + 1); sets.set(e.c.setCode, (sets.get(e.c.setCode) ?? 0) + 1); buckets.set(e.b, (buckets.get(e.b) ?? 0) + 1);
  };
  const best = (filter: (e: Scored) => boolean): Scored | null => {
    let top: Scored | null = null;
    for (const e of pool) if (!taken.has(e.c.id) && (names.get(e.c.nameKey) ?? 0) < nameCap() && filter(e) && (!top || better(e, top))) top = e;
    return top;
  };
  // the head: display quotas, alternating bands, every place a distinct set and name
  const head = Math.min(6, k.poolSize);
  const quota = k.bands.map((b) => b.slots);
  for (let i = 0; i < head; i++) {
    const order = k.bands.map((_, j) => j).sort((a, b) => quota[b]! - quota[a]! || a - b);
    let e: Scored | null = null;
    for (const j of order) {
      if (quota[j]! <= 0) continue;
      e = best((x) => inBand(x.c, k.bands[j]!) && !sets.has(x.c.setCode) && !names.has(x.c.nameKey));
      if (e) { quota[j]!--; break; }
    }
    e ??= best((x) => !sets.has(x.c.setCode) && !names.has(x.c.nameKey));
    if (!e) break;
    take(e);
  }
  while (picked.length < k.poolSize) {
    const e = best(() => true);
    if (!e) break;
    take(e);
  }
  // the newest sets are guaranteed their slots: swap the best hot printings in for the lowest-ranked non-hot picks (never the head)
  const isHot = (e: Scored): boolean => ageDays(e.c, today) <= k.hotDays;
  let hot = picked.filter(isHot).length;
  if (hot < k.hotMinSlots) {
    const extra = pool.filter((e) => isHot(e) && !taken.has(e.c.id)).sort((a, b) => b.s - a.s || a.c.id - b.c.id);
    for (const e of extra) {
      if (hot >= k.hotMinSlots) break;
      let at = -1;
      for (let i = picked.length - 1; i >= head; i--) if (!isHot(picked[i]!)) { at = i; break; }
      if (at < 0) break;
      taken.delete(picked[at]!.c.id); picked[at] = e; taken.add(e.c.id); hot++;
    }
  }
  return picked.map((e) => e.c);
}
