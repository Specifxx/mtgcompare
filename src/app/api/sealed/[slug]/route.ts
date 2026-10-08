import { NextResponse } from "next/server";
import { getSealedDetail, getSets } from "@/lib/data";
import { sealedQuickViewPayload } from "@/lib/sealed-quick-view";

// The sealed QuickView's data: one product's facts and every market's offers
// (affiliate-tagged), market-independent so one CDN entry serves every visitor.
// Reads only data.ts loaders (published files, never a query).
export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9-]{1,160}$/;

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  if (!SLUG.test(params.slug)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const s = await getSealedDetail(params.slug);
  if (!s) return NextResponse.json({ error: "not found" }, { status: 404, headers: { "Cache-Control": "public, s-maxage=300" } });
  const sets = await getSets().catch(() => []);
  const set = s.setId != null ? sets.find((x) => x.id === s.setId) ?? null : null;
  return NextResponse.json(sealedQuickViewPayload(s, set ? { code: set.code, name: set.name, slug: set.slug } : null), {
    headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
  });
}
