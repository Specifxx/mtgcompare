import { NextResponse } from "next/server";
import { getCatalog, getSealedCatalog, getSparklines } from "@/lib/data";
import { getCountry } from "@/lib/get-country";
import { headline } from "@/lib/price";
import { money } from "@/lib/format";
import { cardImage } from "@/lib/images";

export const dynamic = "force-dynamic";

// Prices for the slugs in a browser's watchlist (it lives in localStorage).
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const cards = (sp.get("cards") ?? "").split(",").filter(Boolean).slice(0, 200);
  const sealedSlugs = (sp.get("sealed") ?? "").split(",").filter(Boolean).slice(0, 200);
  const country = getCountry();
  const [cat, sealed] = await Promise.all([getCatalog(), getSealedCatalog()]);
  // 30-day market-price shapes for the first cards and products in the list (the watchlist drawer and page).
  const ids = [...cards.map((slug) => cat.bySlug.get(slug)?.id), ...sealedSlugs.map((slug) => sealed.find((s) => s.slug === slug)?.id)].filter((id): id is number => id != null);
  const spark = await getSparklines(ids).catch(() => ({}) as Record<number, number[]>);
  const out = [
    ...cards.map((slug) => cat.bySlug.get(slug)).filter(Boolean).map((c) => {
      const h = headline(c!, country);
      return { kind: "card", slug: c!.slug, name: c!.name, variant: c!.variant, sub: `${cat.setById.get(c!.setId)?.code} · ${c!.number ?? ""}`, img: c!.hasImage ? cardImage.thumb(c!.id) : null, price: h.cents == null ? "—" : `${h.kind === "reference" ? "≈ " : ""}${money(h.cents, country)}`, stores: h.stores, change7d: c!.change7d, spark: spark[c!.id] ?? null };
    }),
    ...sealedSlugs.map((slug) => sealed.find((s) => s.slug === slug)).filter(Boolean).map((s) => {
      const h = headline(s!, country);
      return { kind: "sealed", slug: s!.slug, name: s!.name, variant: null, sub: s!.kind, img: s!.imageUrl?.replace("_in_1000x1000", "_200w") ?? null, price: h.cents == null ? "—" : `${h.kind === "reference" ? "≈ " : ""}${money(h.cents, country)}`, stores: h.stores, change7d: s!.change7d, spark: spark[s!.id] ?? null };
    }),
  ];
  return NextResponse.json({ items: out }, { headers: { "Cache-Control": "private, no-store" } });
}
