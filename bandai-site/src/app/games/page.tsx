import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE } from "@/site.config";
import { canon } from "@/lib/site";
import { fitTitle } from "@/lib/seo-title";
import { GameTiles } from "@/components/GameTiles";
import { isMultiGame } from "@/lib/lines";

export const revalidate = 86400;
export const metadata: Metadata = {
  title: fitTitle([`Card Games We Compare — ${SITE.gameShort}`, "Card Games We Compare"]),
  description: `Every card game ${SITE.name} compares: ${SITE.game}. Pick one for its sets, booster boxes and card prices across every store.`,
  ...canon("/games"),
};

export default function Games() {
  if (!isMultiGame) notFound();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-black">The card games we compare</h1>
      <GameTiles />
    </div>
  );
}
