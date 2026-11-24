"use client";
// The sort and filter bar over a product grid (owner, 2026-11-23 UX review, P0 3; rules in lib/grid-sort.ts). Browser only:
// it reorders the grid's cards with CSS `order` and hides the ones a filter leaves out. Nothing moves until the visitor picks.
import { useEffect, useMemo, useRef, useState } from "react";
import { GRID_SORTS, PRICE_BANDS, gridKeep, gridOrder, type GridFilter, type GridItem, type GridSort } from "@/lib/grid-sort";

const num = (v: string | undefined) => (v == null || v === "" ? null : Number(v));

export function GridControls({ gridId, sets, eras, langs, bandLabels }: { gridId: string; sets: string[]; eras: string[]; langs: string[]; bandLabels: string[] }) {
  const [sort, setSort] = useState<GridSort>("price");
  const [f, setF] = useState<GridFilter>({});
  const [shown, setShown] = useState<number | null>(null);
  const items = useRef<{ el: HTMLElement; it: GridItem }[]>([]);
  const total = useRef(0);

  useEffect(() => {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    items.current = [...grid.querySelectorAll<HTMLElement>("[data-gp]")].map((el, i) => ({
      el,
      it: { i, price: num(el.dataset.gp), pack: num(el.dataset.gk), under: num(el.dataset.gu), date: el.dataset.gn || null, set: el.dataset.gs || "", era: el.dataset.ge || "", lang: el.dataset.gl || "" },
    }));
    total.current = items.current.length;
  }, [gridId]);

  const active = sort !== "price" || !!(f.set || f.era || f.lang || f.band);
  useEffect(() => {
    if (!items.current.length) return;
    const order = gridOrder(items.current.map((x) => x.it), sort);
    const pos = new Map(order.map((it, n) => [it.i, n]));
    let n = 0;
    for (const { el, it } of items.current) {
      const keep = gridKeep(it, f);
      if (keep) n++;
      el.style.display = keep ? "" : "none"; // not `hidden`: the card's own `flex` class would win over it
      el.style.order = active ? String(pos.get(it.i)) : "";
    }
    setShown(active ? n : null);
  }, [sort, f, active]);

  const sel = "min-h-10 rounded-lg border border-line bg-surface px-2 text-sm text-ink";
  const opts = useMemo(() => PRICE_BANDS.map((b, i) => ({ v: String(i), label: bandLabels[i] ?? "" })), [bandLabels]);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Sort and filter">
      <label className="flex items-center gap-1.5 text-sm text-muted">
        Sort
        <select className={sel} value={sort} onChange={(e) => setSort(e.target.value as GridSort)}>
          {GRID_SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      {sets.length > 1 && (
        <select aria-label="Set" className={sel} value={f.set ?? ""} onChange={(e) => setF({ ...f, set: e.target.value || undefined })}>
          <option value="">All sets</option>
          {sets.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      )}
      {eras.length > 1 && (
        <select aria-label="Era" className={sel} value={f.era ?? ""} onChange={(e) => setF({ ...f, era: e.target.value || undefined })}>
          <option value="">All eras</option>
          {eras.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      )}
      {langs.length > 1 && (
        <select aria-label="Language" className={sel} value={f.lang ?? ""} onChange={(e) => setF({ ...f, lang: e.target.value || undefined })}>
          <option value="">All languages</option>
          {langs.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      )}
      <select
        aria-label="Price"
        className={sel}
        value={f.band ? String(PRICE_BANDS.findIndex((b) => b[0] === f.band![0])) : ""}
        onChange={(e) => setF({ ...f, band: e.target.value === "" ? null : PRICE_BANDS[Number(e.target.value)] })}
      >
        <option value="">Any price</option>
        {opts.map((o) => (
          <option key={o.v} value={o.v}>
            {o.label}
          </option>
        ))}
      </select>
      {active && (
        <>
          <span className="text-sm text-muted" aria-live="polite">
            {shown} of {total.current}
          </span>
          <button type="button" className="text-sm font-semibold text-muted underline-offset-2 hover:text-ink hover:underline" onClick={() => (setSort("price"), setF({}))}>
            Reset
          </button>
        </>
      )}
    </div>
  );
}
