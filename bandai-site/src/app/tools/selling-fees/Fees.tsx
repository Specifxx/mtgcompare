"use client";
import { useState } from "react";
import { money } from "@/lib/format";

// Standard US rates, October 2026 (estimates; marketplaces change them):
//  TCGplayer: 10.75% marketplace commission + payment processing 2.5% + $0.30
//  eBay (Collectible Card Games): 13.25% final value fee on the total incl.
//  shipping (up to $7,500) + $0.40 per order.
export function Fees() {
  const [price, setPrice] = useState("25");
  const [ship, setShip] = useState("1.00");
  const p = Math.round(Number(price || 0) * 100);
  const s = Math.round(Number(ship || 0) * 100);
  const tcg = Math.round((p + s) * 0.1075 + (p + s) * 0.025 + 30);
  const ebay = Math.round(Math.min(p + s, 750000) * 0.1325 + Math.max(0, p + s - 750000) * 0.0235 + 40);
  const row = (name: string, fee: number) => (
    <div className="card-surface p-4">
      <p className="font-bold">{name}</p>
      <p className="mt-1 text-sm text-muted">Fees {money(fee)} · {p + s ? ((fee / (p + s)) * 100).toFixed(1) : 0}%</p>
      <p className="mt-2 text-2xl font-black text-buy-400">You keep {money(p + s - fee)}</p>
      <p className="text-xs text-muted">before your own postage cost</p>
    </div>
  );
  const inp = "w-32 rounded-md border border-ink-700 bg-ink-900 px-2 py-1.5";
  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-4">
        <label className="text-sm">Sale price (US$)<br /><input className={inp} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        <label className="text-sm">Shipping charged (US$)<br /><input className={inp} inputMode="decimal" value={ship} onChange={(e) => setShip(e.target.value)} /></label>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">{row("TCGplayer", tcg)}{row("eBay", ebay)}</div>
    </div>
  );
}
