// A NEW SET'S PRE-ORDERS GO LIVE THE DAY THEY OPEN (owner, 2026-11-26: "new Magic sets and pre-orders go live on MTG Compare the day
// pre-orders open, with real prices from the first store that lists them"). DECISIONS.md, 2026-11-26.
//
// The sealed import runs twice a day and only the evening run's data commit is a release. A set whose first pre-order is read by
// the morning run would wait up to a day for it. This compares the snapshot the run just exported with the one on main before it:
// an upcoming set (released today or later) that had no offer at all and now has one is "newly listed", and the workflow then
// makes that run's data commit a release too. The 12-hour build gate (scripts/vercel-ignore-build.sh) still decides: within 12
// hours of the last production build the commit rides the next release as before. Only real offers count: the importer has
// already refused placeholder and outlier prices before the export.
//
// Pure: the script (scripts/new-set-release.ts) reads the files; tests/new-set-release.test.ts checks the rule.

export interface SnapshotProduct {
  id: string;
  setCode: string | null;
}
export interface SnapshotOffer {
  productId: string;
  store: string;
}
export interface Snapshot {
  products: readonly SnapshotProduct[];
  offers: readonly SnapshotOffer[];
}
export interface NewlyListed {
  code: string;
  name: string;
  releaseDate: string;
  products: number;
  stores: string[];
}

function storesBySet(s: Snapshot): Map<string, { products: Set<string>; stores: Set<string> }> {
  const setOf = new Map(s.products.map((p) => [p.id, p.setCode]));
  const out = new Map<string, { products: Set<string>; stores: Set<string> }>();
  for (const o of s.offers) {
    const code = setOf.get(o.productId);
    if (!code) continue;
    let e = out.get(code);
    if (!e) out.set(code, (e = { products: new Set(), stores: new Set() }));
    e.products.add(o.productId);
    e.stores.add(o.store);
  }
  return out;
}

/** Upcoming sets (release date today or later) with no offer in `before` and at least one in `after`, newest release first. */
export function newlyListedSets(
  before: Snapshot,
  after: Snapshot,
  sets: readonly { code: string; name: string; releaseDate: string }[],
  today: string,
): NewlyListed[] {
  const was = storesBySet(before);
  const now = storesBySet(after);
  const out: NewlyListed[] = [];
  for (const s of sets) {
    if (s.releaseDate < today) continue;
    const n = now.get(s.code);
    if (!n || was.get(s.code)?.stores.size) continue;
    out.push({ code: s.code, name: s.name, releaseDate: s.releaseDate, products: n.products.size, stores: [...n.stores].sort() });
  }
  return out.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || a.code.localeCompare(b.code));
}
