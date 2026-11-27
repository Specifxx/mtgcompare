"use client";
// TCGplayer's sale on TCGplayer's own row (owner, 2026-11-27: "capture this opportunity with TCG Player"): a small chip beside
// the TCGplayer name while its sale runs (9AM 27 Nov to 11PM 30 Nov New York time, lib/bf-mode.ts), saying what the sale is:
// 10% back in TCGplayer store credit. It is drawn only in the browser, after the clock is read, so a page the CDN kept never
// shows it outside the sale and the server HTML never differs from the first render. It ranks nothing and marks no row the
// cheapest. The same file in every TCGplayer site: change one, change all.
import { useEffect, useState } from "react";
import { BF_MODE } from "@/lib/bf-mode";

export function tcgSaleOn(now: number): boolean {
  return now >= BF_MODE.tcgplayerSale && now < BF_MODE.end;
}

export function TcgSaleChip({ className = "" }: { className?: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(tcgSaleOn(Date.now())), []);
  if (!on) return null;
  return (
    <span
      data-tcg-sale=""
      title="TCGplayer's sale: 10% back in TCGplayer store credit on orders until 11PM 30 Nov, New York time"
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase leading-3 tracking-wide ${className}`}
      style={{ background: "#ffd400", color: "#0b0b0c" }}
    >
      <span className="sm:hidden">10% credit</span>
      <span className="hidden sm:inline">Sale: 10% store credit</span>
    </span>
  );
}
