import { NextResponse } from "next/server";
import { getSealedPage, namePrintings, searchCards, searchNames, suggestNames, parseQuery, type CardLite } from "@/lib/data";
import { fold } from "@/lib/constants";
import { getCountry } from "@/lib/get-country";
import { headline } from "@/lib/price";
import { money } from "@/lib/format";
import { imageFor, tcgplayerImage } from "@/lib/images";

export const dynamic = "force-dynamic";

// The header/hero search dropdown (CardSearch). Cards first (up to 10, the box shows 6 on a phone), then up to 3 sealed products; when nothing matches, `suggest`
// carries up to three real card names close to what was typed. A card row is a card NAME (one row per Oracle card, never 159 Sol Rings) shown with the printing a
// player means by that name: its ORDINARY printing (namePrintings: the cheapest plain printing of a main set by MARKET price), never the dearest ("sol ring" once
// opened the serialized LTC 409z). A query that names a set and a number ("mh3 6"), a finish or a treatment ("sol ring foil", "borderless") shows those printings
// instead, in the search's own order (relevance for a name, market value for a treatment alone). Everything is read from the published name table and the in-memory
// browse engine; this route touches no database.
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 80);
  if (fold(q).replace(/\s/g, "").length < 2) return NextResponse.json({ hits: [], total: 0, suggest: [] });
  const country = getCountry();
  const fmt = (h: ReturnType<typeof headline>) => (h.cents == null ? "—" : `${h.kind === "reference" ? "≈ " : ""}${money(h.cents, country)}`);
  const parsed = await parseQuery(q);
  let cards: CardLite[] = [], total = 0;
  if (parsed.set || parsed.number || parsed.finish || parsed.treat.length) {
    const page = await searchCards(q, { per: 24 });
    cards = page.items.slice(0, 10); total = page.total;
  } else {
    const names = await searchNames(q, 10);
    const opens = await namePrintings(names);
    cards = names.flatMap((n) => (n.oracleNo != null ? opens.get(n.oracleNo) ?? [] : []));
    total = names.length;
  }
  const hits = cards.map((c) => {
    const h = headline(c, country);
    return {
      kind: "card" as const,
      // Additive fields for the tools: the card id (Best Basket's and the deck pricer's search-to-add) and every market's cheapest in-stock price, so the trade
      // calculator re-totals on a currency switch.
      id: c.id,
      low: c.low,
      slug: c.slug,
      name: c.name,
      number: c.number,
      variant: c.variant,
      set: c.setCode,
      img: imageFor(c, "thumb"),
      price: fmt(h),
      priceKind: h.kind,
    };
  });
  const sealed = hits.length < 10 && !parsed.set ? await getSealedPage({ q: parsed.text || q, sort: "value", per: 24 }).then((r) => r.items).catch(() => []) : [];
  const sealedHits = sealed
    .filter((s) => /box|deck|pack|case|bundle/i.test(s.kind))
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
        img: tcgplayerImage(s.id, "200w"),
        price: fmt(h),
        priceKind: h.kind,
      };
    });
  const suggest = hits.length || sealedHits.length ? [] : await suggestNames(q);
  return NextResponse.json(
    { hits: [...hits, ...sealedHits], total, suggest },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
