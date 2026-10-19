// The props a card tile actually reads (components/CardTileClient.tsx), cut from a CardLite before it crosses into the client
// tile. A CardLite carries every field a list or the QuickView might need (about 700 bytes of RSC payload as a tile prop);
// the tile reads twelve. A server page that hands many tiles to the browser passes tileCard(c), not c.
import type { CardTileCard } from "@/components/CardTileClient";

export function tileCard(c: CardTileCard): CardTileCard {
  const t: CardTileCard = { id: c.id, slug: c.slug, name: c.name, number: c.number, rarity: c.rarity, variant: c.variant, printing: c.printing, hasImage: c.hasImage, marketUsd: c.marketUsd, low: c.low, stores: c.stores };
  if (c.thin) t.thin = true;
  return t;
}
