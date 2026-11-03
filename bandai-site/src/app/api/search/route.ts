import { NextResponse } from "next/server";
import { products, refCents, setById } from "@/lib/data";
import { money } from "@/lib/format";
import { shortName } from "@/lib/names";
import { tokens } from "@/lib/slug";
import { kitBestByMarket, kitImage, kits } from "@/lib/kits";

// A plain function on Vercel caches only through its CDN header (Rift Compare,
// "Cached pages refresh every 6 to 24 hours"): six hours at the edge.
export const dynamic = "force-dynamic";

// Each product's search tokens, built once per server instance: tokenising all
// ~17,000 names on every query cost ~40 ms of CPU per keystroke.
let index: { hay: string[]; set: Set<string> }[] | null = null;
function haystacks() {
  return (index ??= products().map((p) => {
    const hay = tokens(`${p.name} ${setById(p.setId)?.name ?? ""} ${p.number ?? ""}`);
    return { hay, set: new Set(hay) };
  }));
}

let kitIndex: Set<string>[] | null = null;
/** Model kits (SITE.kits) whose name, grade, scale or JAN hold every word. */
function kitHits(want: string[], limit: number) {
  if (!want.length) return [];
  const all = kits();
  const idx = (kitIndex ??= all.map((k) => new Set(tokens(`${k.name} ${k.grade ?? ""} ${k.scale ?? ""} ${k.jan}`))));
  const out = [];
  for (let i = 0; i < all.length && out.length < limit; i++) {
    const set = idx[i];
    if (!want.every((w) => set.has(w) || [...set].some((h) => h.startsWith(w)))) continue;
    const k = all[i];
    const best = kitBestByMarket(k.jan)[0];
    out.push({ slug: k.slug, href: `/kit/${k.slug}`, name: k.name, set: "Model kit", image: k.image ? kitImage(k.image, 120) : null, price: best ? money(best.cents, best.currency) : "—", kind: "kit", number: null, rarity: null });
  }
  return out;
}

export function GET(req: Request) {
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").slice(0, 80);
  const limit = Math.min(60, Number(u.searchParams.get("limit") ?? 8) || 8);
  const want = tokens(q);
  if (u.searchParams.get("kind") === "kit")
    return NextResponse.json({ hits: kitHits(want, limit) }, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } });
  const numQ = q.match(/\d+\s*\/\s*\d+|[A-Z]{1,4}\d{0,2}-\d{2,3}/i)?.[0]?.replace(/\s/g, "").toUpperCase();
  const scored: { s: number; i: number }[] = [];
  const all = products();
  const idx = want.length ? haystacks() : [];
  if (want.length) {
    all.forEach((p, i) => {
      const { hay, set } = idx[i];
      let hit = 0;
      for (const w of want) if (set.has(w) || hay.some((h) => h.startsWith(w))) hit++;
      if (numQ && p.number?.toUpperCase() === numQ) hit += want.length;
      if (hit < want.length) return;
      const ref = refCents(p.id) ?? 0;
      scored.push({ s: hit * 10 + Math.log10(1 + ref) + (p.kind === "card" ? 0.5 : 0), i });
    });
  }
  scored.sort((a, b) => b.s - a.s);
  const hits = scored.slice(0, limit).map(({ i }) => {
    const p = all[i];
    return { slug: p.slug, href: `/card/${p.slug}`, name: shortName(p.name), set: setById(p.setId)?.name ?? "", image: p.image, price: money(refCents(p.id)), kind: p.kind, number: p.number, rarity: p.rarity };
  });
  // Kits fill what the cards leave: "hg aerial" finds the kit, "aerial" the card first.
  const all2 = [...hits, ...kitHits(want, Math.max(0, limit - hits.length))];
  return NextResponse.json({ hits: all2 }, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } });
}
