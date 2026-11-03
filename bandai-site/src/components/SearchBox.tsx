"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SITE } from "@/site.config";

interface Hit { slug: string; href?: string; name: string; set: string; image: string | null; price: string; kind: string }

export function SearchBox({ big = false, placeholder }: { big?: boolean; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const t = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(t.current);
    if (q.trim().length < 2) return setHits([]);
    t.current = setTimeout(async () => {
      try {
        // Lower-cased so "Dark Magician" and "dark magician" share one CDN entry.
        const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim().toLowerCase())}`);
        setHits(((await r.json()) as { hits: Hit[] }).hits);
        setOpen(true);
      } catch {}
    }, 250);
  }, [q]);
  return (
    <form
      role="search"
      className="relative w-full"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/cards?q=${encodeURIComponent(q.trim())}`);
        setOpen(false);
      }}
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder ?? (SITE.kits ? `Search any card, sealed product or ${SITE.kits.label} kit…` : "Search any card or sealed product…")}
        aria-label="Search cards"
        className={`w-full rounded-lg border border-ink-700 bg-ink-900 text-fg placeholder:text-muted focus:border-brand focus:outline-none ${big ? "px-5 py-4 text-lg" : "px-3 py-1.5 text-sm"}`}
      />
      {open && hits.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-96 w-full overflow-auto rounded-lg border border-ink-700 bg-ink-900 shadow-xl">
          {hits.map((h) => (
            <li key={h.href ?? h.slug}>
              <a href={h.href ?? `/card/${h.slug}`} className="flex items-center gap-3 px-3 py-2 hover:bg-ink-800">
                {h.image ? <img src={h.image} alt={h.name} width={32} height={44} className="h-11 w-8 rounded object-cover" loading="lazy" /> : <span className="h-11 w-8" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-fg">{h.name}</span>
                  <span className="block truncate text-xs text-muted">{h.set}</span>
                </span>
                <span className="text-sm font-semibold text-brand-400">{h.price}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
