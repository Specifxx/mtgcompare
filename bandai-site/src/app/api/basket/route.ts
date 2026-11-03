// Best Basket: price a pasted list, or a shared list's product ids (/list), for one market.
import { NextResponse } from "next/server";
import { bestMatch, parseLine } from "@/lib/lookup";
import { priceBasket } from "@/lib/tools";
import { productById } from "@/lib/data";
import { decodeList } from "@/lib/share";
import { MARKETS, type Market } from "@/lib/site-types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { text, ids, market } = (await req.json().catch(() => ({}))) as { text?: string; ids?: string; market?: string };
  const m: Market = MARKETS.includes(market as Market) ? (market as Market) : "US";
  if (typeof ids === "string") {
    const lines = decodeList(ids).map((l) => ({ qty: l.qty, id: l.id, query: productById(l.id)?.name ?? `#${l.id}` }));
    return NextResponse.json(priceBasket(lines, m));
  }
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .slice(0, 100)
    .map(parseLine)
    .filter((x): x is { qty: number; query: string } => !!x)
    .map((l) => ({ ...l, id: bestMatch(l.query)?.id ?? null }));
  return NextResponse.json(priceBasket(lines, m));
}
