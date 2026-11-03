"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FamilySearch } from "@/components/FamilySearch";

interface Hit { slug: string; href?: string; name: string; set: string; image: string | null; price: string; number: string | null; rarity: string | null }

export function CardSearch() {
  const q = useSearchParams().get("q") ?? "";
  const [hits, setHits] = useState<Hit[] | null>(null);
  useEffect(() => {
    if (!q) return setHits(null);
    fetch(`/api/search?q=${encodeURIComponent(q)}&limit=60`).then((r) => r.json()).then((d: { hits: Hit[] }) => setHits(d.hits));
  }, [q]);
  if (!q) return null;
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-bold">Results for “{q}”</h2>
      {hits === null && <p className="text-muted">Searching…</p>}
      {hits?.length === 0 && <p className="text-muted">No cards match. Try fewer words, or a card number.</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {hits?.map((h) => (
          <a key={h.href ?? h.slug} href={h.href ?? `/card/${h.slug}`} className="card-surface overflow-hidden hover:border-brand/60">
            <div className="aspect-[5/7] bg-ink-850">{h.image && <img src={h.image.replace("_200w", "_400w")} alt={h.name} className="h-full w-full object-contain p-1.5" loading="lazy" />}</div>
            <div className="p-2.5">
              <p className="line-clamp-2 text-sm">{h.name}</p>
              <p className="truncate text-xs text-muted">{h.set}{h.number ? ` · ${h.number}` : ""}</p>
              <p className="font-bold text-brand-400">{h.price}</p>
            </div>
          </a>
        ))}
      </div>
      {/* The same words on the other card-game sites (2026-10-28). */}
      {hits !== null && <FamilySearch q={q} className="mt-4" />}
    </section>
  );
}
