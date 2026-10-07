import { NextResponse } from "next/server";
import { getCatalog, getSealedCatalog } from "@/lib/data";
import { getCountry } from "@/lib/get-country";
import { headline } from "@/lib/price";
import { money } from "@/lib/format";
import { cardImage } from "@/lib/images";
import { norm, searchCards, suggestNames } from "@/lib/search";

export const dynamic = "force-dynamic";

// The header/hero search dropdown (CardSearch). Cards first (up to 10, the
// box shows 6 on a phone), then up to 3 sealed products; when nothing matches,
// `suggest` carries up to three real card names close to what was typed.
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 80);
  if (norm(q).replace(/\s/g, "").length < 2) return NextResponse.json({ hits: [], total: 0, suggest: [] });
  const country = getCountry();
  const [cat, sealed] = await Promise.all([getCatalog(), getSealedCatalog()]);
  const all = searchCards(cat.cards, cat.setById, q);
  const fmt = (h: ReturnType<typeof headline>) => (h.cents == null ? "—" : `${h.kind === "reference" ? "≈ " : ""}${money(h.cents, country)}`);
  const cards = all.slice(0, 10).map((c) => {
    const h = headline(c, country);
    return {
      kind: "card" as const,
      // Additive fields for the tools (wave 2): the card id (Best Basket's and
      // the deck pricer's search-to-add) and every market's cheapest in-stock
      // price, so the trade calculator re-totals on a currency switch.
      id: c.id,
      low: c.low,
      slug: c.slug,
      name: c.name,
      number: c.number,
      variant: c.variant,
      set: cat.setById.get(c.setId)?.code ?? "",
      img: c.hasImage ? cardImage.thumb(c.id) : null,
      price: fmt(h),
      priceKind: h.kind,
    };
  });
  const words = norm(q).split(" ").filter(Boolean);
  const sealedHits = sealed
    .filter((s) => /box|deck|pack|case/i.test(s.kind) && words.every((w) => norm(s.name).includes(w)))
    .sort((a, b) => (b.marketUsd ?? 0) - (a.marketUsd ?? 0))
    .slice(0, 3)
    .map((s) => {
      const h = headline(s, country);
      return {
        kind: "sealed" as const,
        slug: s.slug,
        name: s.name,
        number: null,
        variant: null,
        set: s.kind,
        img: s.imageUrl ? s.imageUrl.replace("_in_1000x1000", "_200w") : null,
        price: fmt(h),
        priceKind: h.kind,
      };
    });
  const suggest = all.length || sealedHits.length ? [] : suggestNames(cat.cards.map((c) => c.name), q);
  return NextResponse.json(
    { hits: [...cards, ...sealedHits], total: all.length, suggest },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
