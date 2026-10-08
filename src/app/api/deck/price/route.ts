import { NextResponse } from "next/server";
import { isDeckFormat } from "@/lib/commander-rules";
import { lineForSlug, priceDeck } from "@/lib/deck-price";
import { getCountry } from "@/lib/get-country";
import { ipKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// The free, no-account deck and list pricer behind /deck: paste a Magic
// decklist (MTG Arena, MTGO, Moxfield, Archidekt or hand-typed), get each line
// resolved to a printing and a finish (lib/deck.ts) and priced in the
// visitor's market from the published data (lib/deck-price.ts), judged against
// a format when the request names one. Unauthenticated, so it is rate-limited
// per IP — generously, because a real user prices a list, switches a printing
// and re-prices.
export async function POST(req: Request) {
  const rl = rateLimit(`deck-price:${ipKey(req)}`, 30, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const body = (await req.json().catch(() => null)) as { text?: unknown; format?: unknown; add?: { slug?: unknown; qty?: unknown } } | null;
  let text = typeof body?.text === "string" ? body.text.slice(0, 20_000) : "";
  try {
    // "Add a card" on /deck: a card picked in the search joins the list as its
    // own line (mergeLines folds it into a line already holding that printing).
    const add = body?.add;
    if (add && typeof add.slug === "string" && add.slug.length < 200) {
      const line = await lineForSlug(add.slug, typeof add.qty === "number" ? add.qty : 1);
      if (!line) return NextResponse.json({ error: "That card can't be added to a deck." }, { status: 400 });
      text = text.trim() ? `${text.trimEnd()}\n${line}` : line;
    }
    if (!text.trim()) return NextResponse.json({ error: "Paste a decklist first." }, { status: 400 });
    const result = await priceDeck(text, getCountry(), isDeckFormat(body?.format) ? { format: body.format } : {});
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Card prices are unavailable right now. Try again in a minute." }, { status: 503 });
  }
}
