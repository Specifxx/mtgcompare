import { SITE } from "@/site.config";

const PREFIX = new RegExp(`^${SITE.game.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*`, "i");

/** "Disney Lorcana: Hyperia City Booster Box" → "Hyperia City Booster Box". */
export function shortName(name: string): string {
  return name.replace(PREFIX, "");
}
