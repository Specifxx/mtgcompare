import { ogCard } from "@/lib/og-card";
import { REGION_LIST, regionOrNotFound } from "@/lib/regions";
import { storesInMarket } from "@/lib/stores";

// /og/<region>: the region home's share card (its og:image, seo.ts regionOgImage), the one a link to /au or /us shows on Reddit,
// Discord or X. Static: one PNG per region at build, from the store registry; no database.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return REGION_LIST.map((r) => ({ region: r.region }));
}

export function GET(_req: Request, { params }: { params: { region: string } }) {
  const r = regionOrNotFound(params.region);
  const n = storesInMarket(r.market).length;
  return ogCard({
    tag: r.name,
    lines: [
      ["Pokémon sealed,", false],
      ["cheapest first, across", false],
      [`${n} ${r.adjective} stores`, true],
    ],
    size: r.adjective.length > 10 ? 54 : 60,
    sub: "Booster boxes, ETBs, bundles · live stock",
    chips: [`Prices in ${r.currency}`, "Free", "No sign-up"],
  });
}
