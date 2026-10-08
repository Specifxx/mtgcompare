import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { exportRows, PORTFOLIO_FREE } from "@/lib/collection-server";
import { collectionCsv, exportFilename } from "@/lib/collection-csv";

export const dynamic = "force-dynamic";

// The binder as a CSV download: one row per entry in the visitor's currency,
// with the finish (Foil, Etched or blank) and the TCGplayer product id, so the file imports straight back (lib/collection-csv.ts).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  if (!isPremium(user) && !PORTFOLIO_FREE) return NextResponse.json({ error: "Premium required" }, { status: 403 });
  const country = getCountry();
  const rows = await exportRows(user.id, country);
  return new NextResponse(collectionCsv(rows, COUNTRIES[country].currency), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename()}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
