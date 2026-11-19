"use client";

import { useEffect } from "react";
import { applyEbayPop } from "@/lib/ebay-pop";

/** Assigns the eBay stand-out A/B arm and sets `<html data-ebaypop>` (lib/ebay-pop.ts). Renders nothing. */
export function EbayPopArm() {
  useEffect(() => applyEbayPop(), []);
  return null;
}
