// The Price Duel's card pool (lib/daily.ts), shared by /daily and the
// /embed/daily widget so both show the same puzzle. Committed data only.
import { products, refCents, setById } from "./data";
import type { DailyCard } from "./daily";

let pool: DailyCard[] | null = null;
export function dailyCards(): DailyCard[] {
  if (pool) return pool;
  const out: DailyCard[] = [];
  for (const p of products()) {
    if (p.kind !== "card" || !p.image) continue;
    const set = setById(p.setId)?.name ?? "";
    // Token sets are filler, not cards anyone collects for a price guess.
    if (/\btokens?\b/i.test(set)) continue;
    const cents = refCents(p.id);
    if (cents == null) continue;
    out.push({ id: p.id, slug: p.slug, name: p.name, set, image: p.image, cents });
  }
  return (pool = out);
}
