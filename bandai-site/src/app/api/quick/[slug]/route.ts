// The quick view's prices for one card or sealed product (components/QuickView.tsx):
// the offers the card page's table draws and the day's exchange rates. Never an
// Amazon link (2026-11-02): Amazon's Operating Agreement allows none in a pop-up window. A function response kept by Vercel's CDN for six hours,
// like the pages (DECISIONS.md "Vercel cost"); the data only changes with a release.
import { NextResponse } from "next/server";
import { meta, priceOf, productBySlug, setById } from "@/lib/data";
import { imageAt } from "@/lib/image";
import { shortName } from "@/lib/names";

export const dynamic = "force-dynamic";

export function GET(_req: Request, { params }: { params: { slug: string } }) {
  const p = productBySlug(params.slug);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404, headers: { "Cache-Control": "public, s-maxage=21600" } });
  return NextResponse.json(
    {
      id: p.id,
      offers: priceOf(p.id).offers,
      fx: meta()?.fx ?? { USD: 1 },
      amazon: null,
      // As the tile sends them (ProductTile.tsx), for a quick view opened from a plain link.
      name: shortName(p.name),
      sub: [setById(p.setId)?.name, p.number].filter(Boolean).join(" · "),
      img: p.image ? imageAt(p.image, "400w") : null,
    },
    { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } },
  );
}
