import { SITE } from "@/site.config";
import type { Offer } from "./site-types";

const NAMES: Record<string, string> = { tcgplayer: "TCGplayer", ebay: "eBay", amazon: "Amazon", ...Object.fromEntries(SITE.stores.map((s) => [s.key, s.name])), ...Object.fromEntries((SITE.kits?.stores ?? []).map((s) => [s.key, s.name])) };
export function sourceNameServer(o: Pick<Offer, "source" | "market">) {
  if (o.source === "ebay" && o.market !== "US") return `eBay ${o.market}`;
  return NAMES[o.source] ?? o.source;
}
