"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

// Faceted sidebar filter for /sealed (RiftCompare's SealedFilters) on OP's param
// names: q, min, max, stock, promo, kind (repeated), set (csv of slugs). Every
// change pushes the URL, so the page applies it instantly with no submit button;
// the server (lib/sealed-query.ts) parses the same params back. "In stock at
// MSRP" is omitted: OP has no verified MSRP table (lib/msrp.ts does not exist).
// Options come from the server: only the types and sets that have sealed product.

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function SealedFilters({ types, sets, currency }: { types: string[]; sets: { slug: string; code: string; name: string }[]; currency: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const paramsStr = params.toString();
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState(paramsStr);
  useEffect(() => setOptimistic(paramsStr), [paramsStr]);
  const sp = useMemo(() => new URLSearchParams(optimistic), [optimistic]);

  const [q, setQ] = useState(params.get("q") ?? "");
  const [min, setMin] = useState(params.get("min") ?? "");
  const [max, setMax] = useState(params.get("max") ?? "");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [setQuery, setSetQuery] = useState("");

  const filteredSets = useMemo(() => {
    const term = setQuery.trim().toLowerCase();
    return term ? sets.filter((s) => s.name.toLowerCase().includes(term) || s.code.toLowerCase().includes(term)) : sets;
  }, [setQuery, sets]);

  function push(next: URLSearchParams) {
    next.delete("page");
    const qs = next.toString();
    setOptimistic(qs);
    startTransition(() => router.push(qs ? `/sealed?${qs}` : "/sealed", { scroll: false }));
  }
  function update(mutate: (p: URLSearchParams) => void) {
    const next = new URLSearchParams(optimistic);
    mutate(next);
    push(next);
  }
  // The search applies as you type, after a pause (the checkboxes already apply
  // instantly); Enter and blur still apply it at once.
  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim() !== (sp.get("q") ?? "")) update((p) => (q.trim() ? p.set("q", q.trim()) : p.delete("q")));
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  function clearAll() {
    const next = new URLSearchParams();
    const sort = sp.get("sort");
    if (sort) next.set("sort", sort);
    setQ("");
    setMin("");
    setMax("");
    push(next);
  }

  const kinds = sp.getAll("kind").flatMap((k) => k.split(",")).filter(Boolean);
  const setSlugs = (sp.get("set") ?? "").split(",").filter(Boolean);
  const toggleKind = (k: string) =>
    update((p) => {
      const cur = p.getAll("kind").flatMap((x) => x.split(",")).filter(Boolean);
      p.delete("kind");
      (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]).forEach((x) => p.append("kind", x));
    });
  const toggleSet = (slug: string) =>
    update((p) => {
      const cur = (p.get("set") ?? "").split(",").filter(Boolean);
      const nextSets = cur.includes(slug) ? cur.filter((x) => x !== slug) : [...cur, slug];
      if (nextSets.length) p.set("set", nextSets.join(","));
      else p.delete("set");
    });

  const activeCount = (sp.get("q") ? 1 : 0) + kinds.length + setSlugs.length + (sp.get("stock") ? 1 : 0) + (sp.get("promo") ? 1 : 0) + (sp.get("min") || sp.get("max") ? 1 : 0);

  return (
    <aside className="w-full shrink-0 xl:w-64">
      <button onClick={() => setMobileOpen((o) => !o)} aria-expanded={mobileOpen} className="mb-3 flex w-full items-center justify-between rounded-lg border border-ink-700 bg-ink-850 px-4 py-2.5 text-sm font-semibold text-white xl:hidden">
        <span className="flex items-center gap-2">
          Filters
          {activeCount > 0 ? <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs text-white">{activeCount}</span> : null}
        </span>
        <Chevron open={mobileOpen} />
      </button>
      <div className={`${mobileOpen ? "block" : "hidden"} xl:sticky xl:top-20 xl:block`}>
        <div className="card-surface p-4 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="hidden text-sm font-bold uppercase tracking-wide text-slate-300 xl:block">Filters</h2>
            {activeCount > 0 ? (
              <button onClick={clearAll} className="ml-auto text-xs text-brand-400 hover:underline">
                Clear ({activeCount})
              </button>
            ) : null}
          </div>

          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              update((p) => (q.trim() ? p.set("q", q.trim()) : p.delete("q")));
            }}
            className="pb-3"
          >
            <input type="search" aria-label="Search sealed products" placeholder="Search sealed…" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q.trim() !== (sp.get("q") ?? "") && update((p) => (q.trim() ? p.set("q", q.trim()) : p.delete("q")))} className="input w-full" />
          </form>

          <Section title={`Price (${currency})`} defaultOpen>
            <div className="flex items-center gap-2">
              <input type="number" min={0} aria-label="Minimum price" placeholder="Min" value={min} onChange={(e) => setMin(e.target.value)} className="input" />
              <span className="text-slate-500">–</span>
              <input type="number" min={0} aria-label="Maximum price" placeholder="Max" value={max} onChange={(e) => setMax(e.target.value)} className="input" />
            </div>
            <button
              onClick={() =>
                update((p) => {
                  if (min) p.set("min", min);
                  else p.delete("min");
                  if (max) p.set("max", max);
                  else p.delete("max");
                })
              }
              className="btn-ghost mt-2 w-full"
            >
              Apply
            </button>
            <Check className="mt-2" checked={sp.get("stock") === "1"} onChange={() => update((p) => (p.get("stock") === "1" ? p.delete("stock") : p.set("stock", "1")))} label="In stock only" />
            <Check className="mt-1" checked={sp.get("promo") === "1"} onChange={() => update((p) => (p.get("promo") === "1" ? p.delete("promo") : p.set("promo", "1")))} label="Include tournament promo packs" />
          </Section>

          <Section title="Product type" defaultOpen>
            <div className="flex flex-col gap-1">
              {types.map((t) => (
                <Check key={t} checked={kinds.includes(t)} onChange={() => toggleKind(t)} label={t} />
              ))}
            </div>
          </Section>

          {sets.length > 0 ? (
            <Section title="Set" last defaultOpen>
              {sets.length > 8 ? <input type="search" value={setQuery} onChange={(e) => setSetQuery(e.target.value)} placeholder={`Search ${sets.length} sets…`} className="input mb-2 w-full text-sm" /> : null}
              <div className="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
                {filteredSets.map((s) => (
                  <Check key={s.slug} checked={setSlugs.includes(s.slug)} onChange={() => toggleSet(s.slug)} label={`${s.code} ${s.name}`} />
                ))}
                {filteredSets.length === 0 ? <span className="px-1 py-2 text-xs text-slate-500">No sets match “{setQuery}”.</span> : null}
              </div>
            </Section>
          ) : null}

          <div className="sticky bottom-0 -mx-4 -mb-4 mt-3 rounded-b-lg border-t border-ink-700 bg-ink-850/95 p-3 backdrop-blur xl:hidden">
            <button
              type="button"
              className="btn-primary w-full"
              onClick={() => {
                setMobileOpen(false);
                requestAnimationFrame(() => document.getElementById("results")?.scrollIntoView({ block: "start" }));
              }}
            >
              Show results
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Section({ title, children, defaultOpen = false, last }: { title: string; children: React.ReactNode; defaultOpen?: boolean; last?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={last ? "" : "border-b border-ink-700"}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-11 w-full items-center justify-between py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-200">
        {title}
        <Chevron open={open} />
      </button>
      {open ? <div className="pb-3">{children}</div> : null}
    </div>
  );
}

function Check({ checked, onChange, label, className }: { checked: boolean; onChange: () => void; label: string; className?: string }) {
  return (
    <label className={`tap-link-block flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-slate-300 hover:bg-ink-800 ${className ?? ""}`}>
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 rounded border-ink-600 bg-ink-900 accent-brand-500" />
      <span className="truncate">{label}</span>
    </label>
  );
}
