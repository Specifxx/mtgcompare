"use client";

import { usePathname } from "next/navigation";
import type { TcgplayerTile } from "@/lib/data";
import type { Region } from "@/lib/regions";
import { TcgplayerStrip } from "./TcgplayerStrip";

// Pages with a TCGplayer strip of their own (the region home, a product page, a set page) skip this one.
const OWN = [/^\/[a-z]{2}\/?$/, /^\/[a-z]{2}\/p\//, /^\/[a-z]{2}\/sets\/[^/]+\/?$/];

export function preFooterTcgplayerAllowed(path: string): boolean {
  return !OWN.some((r) => r.test(path));
}

/**
 * The TCGplayer strip above the footer on every other region page (owner, 2026-10-29: the eBay and TCGplayer ads on every page,
 * pre-orders and lists included), beside the eBay pre-footer strip. The newest sets' products (lib/data.ts tcgplayerTiles).
 */
export function PreFooterTcgplayer({ region, tiles }: { region: Region; tiles: TcgplayerTile[] }) {
  const path = usePathname() || "";
  if (!preFooterTcgplayerAllowed(path)) return null;
  return <TcgplayerStrip tiles={tiles} region={region} placement="tcgplayer-strip-footer" title="Magic sealed on TCGplayer" className="mt-6" />;
}
