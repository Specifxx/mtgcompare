// Copy-as-post text (used by CopyPostButton): a short, factual line a person
// pastes into Discord or a forum. Real numbers only; a missing price is left out.
import { SITE_NAME, SITE_URL } from "./site";
import { usd } from "./format";

export interface SharedCard { name: string; slug: string; setCode?: string | null; number?: string | null; marketUsd: number | null; change7d?: number | null }

export function cardPostText(c: SharedCard, siteUrl: string = SITE_URL): string {
  const where = [c.setCode, c.number].filter(Boolean).join(" ");
  const price = c.marketUsd != null ? ` is ${usd(c.marketUsd)} on TCGplayer (market)` : " is compared across stores";
  const move = c.change7d != null && c.change7d !== 0 ? `, ${c.change7d > 0 ? "up" : "down"} ${Math.abs(c.change7d).toFixed(1)}% this week` : "";
  return `${c.name}${where ? ` (${where})` : ""}${price}${move}. Every store, one page: ${siteUrl}/card/${c.slug} via ${SITE_NAME}`;
}
