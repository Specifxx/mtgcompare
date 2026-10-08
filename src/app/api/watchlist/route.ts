import { NextResponse } from "next/server";
import { getCardLookup, getSealedAll, getSparklines } from "@/lib/data";
import { imageFor, tcgplayerImage } from "@/lib/images";
import { unitKey } from "@/lib/constants";
import { getCountry } from "@/lib/get-country";
import { headline } from "@/lib/price";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

// Prices for the slugs in a browser's watchlist (it lives in localStorage).
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const cards = (sp.get("cards") ?? "").split(",").filter(Boolean).slice(0, 200);
  const sealedSlugs = (sp.get("sealed") ?? "").split(",").filter(Boolean).slice(0, 200);
  const country = getCountry();
  const [look, sealed] = await Promise.all([getCardLookup({ slugs: cards }), sealedSlugs.length ? getSealedAll() : Promise.resolve([])]);
  const sealedBySlug = new Map(sealed.filter((s) => sealedSlugs.includes(s.slug)).map((s) => [s.slug, s] as const));
  // 30-day market-price shapes for the first cards in the list (the watchlist drawer and page), one unit per card: its headline finish.
  const wanted = cards.map((slug) => look.bySlug.get(slug)).filter((c): c is NonNullable<typeof c> => !!c);
  const spark = await getSparklines(wanted.slice(0, 48).map((c) => ({ id: c.id, finish: c.headFinish }))).catch(() => ({}) as Record<string, number[]>);
  const out = [
    ...wanted.map((c) => {
      const h = headline(c, country);
      return { kind: "card", slug: c.slug, name: c.name, variant: c.variant, sub: `${c.setCode} · ${c.number ?? ""}`, img: imageFor(c, "thumb"), price: h.cents == null ? "—" : `${h.kind === "reference" ? "≈ " : ""}${money(h.cents, country)}`, stores: h.stores, change7d: c.change7d, spark: spark[unitKey(c.id, c.headFinish)] ?? null };
    }),
    ...sealedSlugs.map((slug) => sealedBySlug.get(slug)).filter((s): s is NonNullable<typeof s> => !!s).map((s) => {
      const h = headline(s, country);
      return { kind: "sealed", slug: s.slug, name: s.name, variant: null, sub: s.kind, img: tcgplayerImage(s.id, "200w"), price: h.cents == null ? "—" : `${h.kind === "reference" ? "≈ " : ""}${money(h.cents, country)}`, stores: h.stores, change7d: s.change7d, spark: null };
    }),
  ];
  return NextResponse.json({ items: out }, { headers: { "Cache-Control": "private, no-store" } });
}
