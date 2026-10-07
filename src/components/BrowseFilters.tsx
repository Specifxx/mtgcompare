"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { COLORS, COLOR_KEYS, PRINTINGS, PRINTING_KEYS, RARITIES, SET_KINDS, CARD_TYPES } from "@/lib/constants";
import { COUNTRIES, type Country } from "@/lib/country";
import type { BrowseQuery } from "@/lib/browse";
import type { SetLite } from "@/lib/data";
import { canonical, clearFilters, priceInput, toggle, values, withArticle } from "@/lib/filter-chips";

function Section({ title, open = false, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group border-t border-ink-800 py-3">
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between text-[12px] font-bold uppercase tracking-[0.1em] text-slate-300">
        {title}
        <span className="text-slate-500 transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="mt-3 space-y-1.5">{children}</div>
    </details>
  );
}

function Check({ name, value, checked, onToggle, children }: { name: string; value: string; checked: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <label className="flex min-h-8 cursor-pointer items-center gap-2.5 rounded px-1 text-[15px] text-slate-200 hover:bg-ink-800/60 hover:text-white">
      <input type="checkbox" name={name} value={value} checked={checked} onChange={onToggle} className="h-4 w-4 shrink-0 rounded border-ink-600 bg-ink-950 accent-[#d92b33]" />
      <span className="min-w-0 truncate">{children}</span>
    </label>
  );
}

// The /browse filter panel (RiftCompare's Filters): every tick applies at once
// — no Apply button — and the URL is the only state. A tick flips instantly
// (an optimistic copy of the query string) while the server renders the new
// results in the background; the copy resyncs whenever the URL changes (a
// chip removed, Back/Forward). Still a real GET form with named inputs, so it
// works without JavaScript (the "Show results" button submits it then).
export function BrowseFilters({ q, sets, country, action = "/browse", hide = [] }: { q: BrowseQuery; sets: SetLite[]; country: Country; action?: string; hide?: string[] }) {
  const c = COUNTRIES[country];
  const router = useRouter();
  const params = useSearchParams();
  const urlStr = params.toString();
  const [, startTransition] = useTransition();
  const [opt, setOpt] = useState(urlStr);
  const [instant, setInstant] = useState(false);
  useEffect(() => setOpt(urlStr), [urlStr]);
  useEffect(() => setInstant(true), []);
  const sp = useMemo(() => new URLSearchParams(opt), [opt]);

  const [min, setMin] = useState(q.min != null ? (q.min / 100).toString() : "");
  const [max, setMax] = useState(q.max != null ? (q.max / 100).toString() : "");
  const [priceError, setPriceError] = useState(false);
  useEffect(() => {
    setMin(values(params, "min")[0] ?? "");
    setMax(values(params, "max")[0] ?? "");
  }, [params]);

  const go = (next: URLSearchParams) => {
    const qs = canonical(next).toString();
    setOpt(qs);
    startTransition(() => router.push(qs ? `${action}?${qs}` : action, { scroll: false }));
  };
  const on = (key: string, value: string) => values(sp, key).some((v) => v.toLowerCase() === value.toLowerCase());
  const flip = (key: string, value: string) => go(toggle(sp, key, value));

  const applyPrice = (form?: HTMLFormElement | null) => {
    const a = priceInput(min);
    const b = priceInput(max);
    if (a == null || b == null) {
      setPriceError(true);
      return;
    }
    setPriceError(false);
    const next = new URLSearchParams(sp);
    if (a) next.set("min", a);
    else next.delete("min");
    if (b) next.set("max", b);
    else next.delete("max");
    // The sort and page-size pickers live outside this panel (form="filters").
    if (form) {
      const fd = new FormData(form);
      for (const k of ["sort", "per"]) {
        const v = fd.get(k);
        if (typeof v === "string") next.set(k, v);
      }
    }
    go(next);
  };

  // Enter in a price box applies it. The form has two text boxes and, with
  // JavaScript, no submit button, so the browser's implicit submission on
  // Enter never fires; this is that path.
  const onPriceKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    applyPrice(e.currentTarget.form);
  };

  const activeCount =
    ["set", "color", "rarity", "type", "printing"].reduce((n, k) => n + values(sp, k).length, 0) + (sp.get("priced") === "1" ? 1 : 0) + (sp.get("min") || sp.get("max") ? 1 : 0);

  const byKind = Object.entries(SET_KINDS)
    .sort((a, b) => a[1].order - b[1].order)
    .map(([k, v]) => ({ kind: k, label: v.plural, sets: sets.filter((s) => s.kind === k).sort((a, b) => (b.releasedOn ?? "").localeCompare(a.releasedOn ?? "")) }))
    .filter((g) => g.sets.length);

  return (
    <form
      id="filters"
      action={action}
      method="get"
      className="card-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        applyPrice(e.currentTarget);
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="rb-eyebrow text-slate-500">Filters</p>
        {activeCount > 0 ? (
          <button type="button" onClick={() => go(clearFilters(sp))} className="text-xs font-medium text-brand-400 hover:underline">
            Clear ({activeCount})
          </button>
        ) : null}
      </div>
      {q.q ? <input type="hidden" name="q" value={q.q} /> : null}
      {/* Sort and page size live in the results bar (SortSelect / PageSizeSelect,
          which navigate on their own); carried here so applying a filter keeps them. */}
      <input type="hidden" name="sort" value={q.sort} />
      <input type="hidden" name="per" value={String(q.per)} />
      <Section title={`Price (${c.currency})`} open>
        <div className="flex items-center gap-2">
          <input
            name="min"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            onKeyDown={onPriceKey}
            onBlur={(e) => {
              if ((priceInput(min) ?? "") !== (values(sp, "min")[0] ?? "")) applyPrice(e.currentTarget.form);
            }}
            inputMode="decimal"
            placeholder="Min"
            className="input"
            aria-label={`Minimum price, ${c.currency}`}
            aria-invalid={priceError || undefined}
          />
          <span className="text-slate-500">–</span>
          <input
            name="max"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            onKeyDown={onPriceKey}
            onBlur={(e) => {
              if ((priceInput(max) ?? "") !== (values(sp, "max")[0] ?? "")) applyPrice(e.currentTarget.form);
            }}
            inputMode="decimal"
            placeholder="Max"
            className="input"
            aria-label={`Maximum price, ${c.currency}`}
            aria-invalid={priceError || undefined}
          />
        </div>
        {priceError ? <p className="text-xs text-rose-400">Enter a number, like 5 or 12.50.</p> : <p className="text-xs text-slate-500">Press Enter or leave the box to apply.</p>}
        <label className="flex min-h-8 cursor-pointer items-center gap-2.5 pt-1 text-[15px] text-slate-200">
          <input type="checkbox" name="priced" value="1" checked={sp.get("priced") === "1"} onChange={() => {
              const n = new URLSearchParams(sp);
              if (n.get("priced") === "1") n.delete("priced");
              else n.set("priced", "1");
              go(n);
            }} className="h-4 w-4 accent-[#d92b33]" />
          Only cards with {withArticle(c.adjective)} listing
        </label>
      </Section>
      {!hide.includes("set") ? (
        <Section title="Set" open={values(sp, "set").length > 0}>
          {byKind.map((g) => (
            <div key={g.kind} className="pb-2">
              <p className="pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g.label}</p>
              <div className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
                {g.sets.map((s) => (
                  <Check key={s.id} name="set" value={s.slug} checked={on("set", s.slug) || on("set", s.code)} onToggle={() => (on("set", s.code) ? flip("set", s.code) : flip("set", s.slug))}>
                    {s.name} <span className="text-slate-500">({s.code})</span>
                  </Check>
                ))}
              </div>
            </div>
          ))}
        </Section>
      ) : null}
      {!hide.includes("color") ? (
        <Section title="Colour" open={values(sp, "color").length > 0}>
          {COLOR_KEYS.map((k) => (
            <Check key={k} name="color" value={k.toLowerCase()} checked={on("color", k)} onToggle={() => flip("color", k.toLowerCase())}>
              <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: COLORS[k].hex }} />
              {k}
            </Check>
          ))}
        </Section>
      ) : null}
      <Section title="Rarity" open={values(sp, "rarity").length > 0}>
        {Object.entries(RARITIES).map(([k, v]) => (
          <Check key={k} name="rarity" value={k} checked={on("rarity", k)} onToggle={() => flip("rarity", k)}>
            {v.label} <span className="text-slate-500">({k})</span>
          </Check>
        ))}
      </Section>
      <Section title="Card type" open={values(sp, "type").length > 0}>
        {CARD_TYPES.map((t) => (
          <Check key={t} name="type" value={t} checked={on("type", t)} onToggle={() => flip("type", t)}>
            {t}
          </Check>
        ))}
      </Section>
      <Section title="Printing" open>
        {PRINTING_KEYS.map((k) => (
          <Check key={k} name="printing" value={k} checked={on("printing", k)} onToggle={() => flip("printing", k)}>
            <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: PRINTINGS[k].dot }} />
            {PRINTINGS[k].label}
          </Check>
        ))}
      </Section>
      {/* Without JavaScript this submits the form. With it, filters apply as
          they change, so the bar is only the phone's way back to the results
          (the panel is an inline disclosure there, RiftCompare's "Show results"). */}
      <div className={`sticky bottom-0 -mx-4 -mb-4 mt-2 rounded-b-lg border-t border-ink-800 bg-ink-900/95 p-4 backdrop-blur ${instant ? "lg:hidden" : ""}`}>
        <button
          type={instant ? "button" : "submit"}
          className="btn-primary w-full"
          onClick={
            instant
              ? () => {
                  const t = document.getElementById("filters-toggle") as HTMLInputElement | null;
                  if (t) t.checked = false;
                  requestAnimationFrame(() => document.getElementById("results")?.scrollIntoView({ block: "start", behavior: "smooth" }));
                }
              : undefined
          }
        >
          {instant ? "Show results" : "Apply filters"}
        </button>
      </div>
    </form>
  );
}
