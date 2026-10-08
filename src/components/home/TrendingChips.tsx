"use client";

import { useRef } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics";
import { useQuickView } from "@/components/QuickViewProvider";

export interface TrendingCard {
  id: number;
  slug: string;
  name: string;
  number: string | null;
  variant: string | null;
}

// RiftCompare's TrendingChips: six one-tap chips under the hero search that
// open the card's QuickView on a plain click (meta/ctrl clicks and drags fall
// through to the card page).
function TrendingChip({ c, showVariant }: { c: TrendingCard; showVariant: boolean }) {
  const qv = useQuickView();
  const downRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const full = `${c.name}${c.variant ? ` (${c.variant.split(" · ")[0]})` : ""}`;
  // The printing only shows when two chips share a name: a truncated "(Super Alt…" tells nobody anything.
  const label = showVariant ? full : c.name;
  function onPointerDown(e: React.PointerEvent) {
    downRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  }
  function onClick(e: React.MouseEvent) {
    trackEvent("trending_chip_click", { card: c.slug });
    if (!qv || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const down = downRef.current;
    if (down && (Math.abs(e.clientX - down.x) > 8 || Math.abs(e.clientY - down.y) > 8 || Date.now() - down.t > 600)) return;
    e.preventDefault();
    qv.open(c.slug, { thumb: null, label: full });
  }
  return (
    <Link
      href={`/card/${c.slug}`}
      prefetch={false}
      title={full}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onPointerEnter={qv ? () => qv.prefetch(c.slug) : undefined}
      className="chip min-h-11 min-w-0 justify-center border border-ink-700 bg-ink-900 px-2 text-slate-300 transition-colors hover:border-brand-500 hover:text-white"
    >
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function TrendingChips({ cards }: { cards: TrendingCard[] }) {
  if (cards.length === 0) return null;
  const six = cards.slice(0, 6);
  const counts = new Map<string, number>();
  for (const c of six) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
  return (
    <div className="animate-fade-in [animation-delay:320ms] mx-auto mt-3 grid max-w-2xl grid-cols-2 gap-1.5 sm:grid-cols-3">
      <span className="rb-eyebrow col-span-full text-center text-slate-600">Popular</span>
      {six.map((c) => (
        <TrendingChip key={c.id} c={c} showVariant={(counts.get(c.name) ?? 0) > 1} />
      ))}
    </div>
  );
}
