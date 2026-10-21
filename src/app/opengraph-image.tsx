import { ogCard, OG_SIZE } from "@/lib/og-card";
import { REGION_LIST } from "@/lib/regions";
import { STORES } from "@/lib/stores";

// The site's share card: every page without an image of its own points og:image here (seo.ts DEFAULT_OG_IMAGE). Drawn by
// lib/og-card.tsx, static, rendered once at build.

export const alt = `DexCompare — compare Pokémon sealed prices across ${STORES.length} stores in ${REGION_LIST.length} regions`;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OG() {
  // The headline in four set lines (a ragged wrap leaves "regions" alone on the last one); the store count in the brand's red.
  return ogCard({
    lines: [
      ["Compare Pokémon", false],
      ["sealed prices across", false],
      [`${STORES.length} stores`, true],
      [`in ${REGION_LIST.length} regions`, false],
    ],
    sub: "Booster boxes, ETBs, bundles and more",
    chips: REGION_LIST.map((r) => r.short),
  });
}
