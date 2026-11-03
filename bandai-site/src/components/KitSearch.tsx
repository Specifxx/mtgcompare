"use client";
// The /kits search: model kits only (/api/search?kind=kit), as you type.
import { useEffect, useRef, useState } from "react";

interface Hit { slug: string; href: string; name: string; image: string | null; price: string }

export function KitSearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const t = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(t.current);
    if (q.trim().length < 2) return setHits(null);
    t.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?kind=kit&limit=24&q=${encodeURIComponent(q.trim().toLowerCase())}`);
        setHits(((await r.json()) as { hits: Hit[] }).hits);
      } catch {}
    }, 250);
  }, [q]);
  return (
    <div>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a kit: “RG Hi-Nu”, “MG Barbatos”, “Aerial”…"
        aria-label="Search model kits"
        className="w-full rounded-lg border border-ink-700 bg-ink-900 px-4 py-3 text-fg placeholder:text-muted focus:border-brand focus:outline-none"
      />
      {hits && (
        <ul className="mt-2 divide-y divide-ink-800 overflow-hidden rounded-lg border border-ink-700 bg-ink-900">
          {hits.length === 0 && <li className="px-3 py-2 text-sm text-muted">No kits match. Try fewer words.</li>}
          {hits.map((h) => (
            <li key={h.slug}>
              <a href={h.href} className="flex items-center gap-3 px-3 py-2 hover:bg-ink-800">
                {h.image ? <img src={h.image} alt={h.name} width={40} height={40} className="h-10 w-10 rounded bg-white object-contain" loading="lazy" /> : <span className="h-10 w-10" />}
                <span className="min-w-0 flex-1 truncate text-sm text-fg">{h.name}</span>
                <span className="text-sm font-semibold text-brand-400">{h.price}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
