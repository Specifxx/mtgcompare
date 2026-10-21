// RiftCompare's Pokémon section (riftcompare.com/pokemon), the owner's other Pokémon sealed site: it prices TCGplayer and eBay in six
// markets and keeps TCGplayer's market price HISTORY, which this site deliberately does not store (README, "What this site does not
// store"). The two are joined exactly by TCGplayer's productId (owner, 2026-10-15: "connect it … make things seamless"): RiftCompare's
// product id IS TCGplayer's, and this site's product image is TCGplayer's (".../product/<productId>_in_1000x1000.jpg"), so
// RiftCompare's /pokemon/tcgplayer/<id> redirects to the same product's page there. RiftCompare reads this site's /api/browse/<region>
// index for the other direction (its src/lib/pokemon/dexcompare.ts).
//
// Only for a set in RiftCompare's scope (English sealed, Sword & Shield on: from 2020-02-07), and never for a case (booster box, ETB or
// bundle case: RiftCompare leaves distributor cases out by design). The product's name rides along as `q`: an id RiftCompare does not
// carry lands on its search for that name, never a 404. nofollow: a data link on every product page, between two of the owner's sites.

const RIFT = "https://riftcompare.com";
/** RiftCompare's first day in scope (its src/lib/pokemon/catalog.ts SCOPE_START). */
export const RIFT_SCOPE_START = "2020-02-07";
export const RIFT_REL = "nofollow noopener";

const TCGPLAYER_IMAGE_ID = /tcgplayer-cdn\.tcgplayer\.com\/product\/(\d+)_/;

/** TCGplayer's productId from a TCGplayer CDN image URL, else null. */
export function tcgplayerIdFromImage(url: string | null | undefined): number | null {
  const m = url ? TCGPLAYER_IMAGE_ID.exec(url) : null;
  return m ? Number(m[1]) : null;
}

/**
 * The product's price history on RiftCompare, or null when it has no TCGplayer image, its set is outside RiftCompare's scope, or it is
 * a case (`productType` is its label: "Booster Box Case", "Elite Trainer Box Case", "Booster Bundle Case").
 */
export function riftHistoryHref(p: { imageUrl: string | null | undefined; setReleaseDate: string | null | undefined; productType: string; name: string }): string | null {
  const id = tcgplayerIdFromImage(p.imageUrl);
  if (id == null || !p.setReleaseDate || p.setReleaseDate < RIFT_SCOPE_START || /\bCase$/.test(p.productType)) return null;
  const q = new URLSearchParams({ q: p.name, utm_source: "dexcompare", utm_medium: "referral", utm_campaign: "dex-product" });
  return `${RIFT}/pokemon/tcgplayer/${id}?${q}`;
}
