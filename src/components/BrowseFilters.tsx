"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { COLORS, COLOR_LETTERS, FORMAT_LABEL, FORMAT_UI, PRIMARY_TYPES, PRIMARY_TYPE_LABEL, RARITIES, RARITY_KEYS, SET_KINDS, TREATMENTS, TREATMENT_KIND_DOT, type TreatmentKind } from "@/lib/constants";
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
      <input type="checkbox" name={name} value={value} checked={checked} onChange={onToggle} className="h-4 w-4 shrink-0 rounded border-ink-600 bg-ink-950 accent-[#9140da]" />
      <span className="min-w-0 truncate">{children}</span>
    </label>
  );
}

function Radio({ name, value, checked, onPick, children }: { name: string; value: string; checked: boolean; onPick: () => void; children: React.ReactNode }) {
  return (
    <label className="flex min-h-8 cursor-pointer items-center gap-2.5 rounded px-1 text-[15px] text-slate-200 hover:bg-ink-800/60 hover:text-white">
      <input type="radio" name={name} value={value} checked={checked} onChange={onPick} className="h-4 w-4 shrink-0 border-ink-600 bg-ink-950 accent-[#9140da]" />
      <span className="min-w-0 truncate">{children}</span>
    </label>
  );
}

/** The treatments a visitor can filter by, grouped by what kind of difference they are; the hidden ones (languages, event placings) are left out. */
const TREATMENT_GROUPS: { kind: TreatmentKind; label: string }[] = [
  { kind: "frame", label: "Frames" }, { kind: "art", label: "Art" }, { kind: "foil", label: "Foil patterns" }, { kind: "edition", label: "Editions" }, { kind: "promo", label: "Promos" }, { kind: "serial", label: "Serialized" },
];

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
    ["set", "color", "rarity", "type", "treat"].reduce((n, k) => n + values(sp, k).length, 0) + ["priced", "finish", "format", "identity", "keyword"].filter((k) => sp.get(k)).length + (sp.get("min") || sp.get("max") ? 1 : 0);

  const byKind = Object.entries(SET_KINDS)
    .filter(([, v]) => !v.hidden)
    .sort((a, b) => a[1].order - b[1].order)
    .map(([k, v]) => ({ kind: k, label: v.plural, sets: sets.filter((s) => s.kind === k).sort((a, b) => (b.releasedOn ?? "").localeCompare(a.releasedOn ?? "")) }))
    .filter((g) => g.sets.length);
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(sp);
    if (value) next.set(key, value);
    else next.delete(key);
    go(next);
  };
  const identity = (sp.get("identity") ?? "").toLowerCase();
  const flipIdentity = (letter: string) => {
    const has = identity.includes(letter), rest = [...identity.replace("c", "")].filter((l) => l !== letter);
    setParam("identity", has ? rest.join("") || null : [...rest, letter].sort((a, b) => "wubrg".indexOf(a) - "wubrg".indexOf(b)).join(""));
  };
  const colors = values(sp, "color").map((v) => v.toLowerCase());

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
      <Section title="Market price (US$)" open>
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
            aria-label="Minimum market price, US dollars"
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
            aria-label="Maximum market price, US dollars"
            aria-invalid={priceError || undefined}
          />
        </div>
        {priceError ? <p className="text-xs text-rose-400">Enter a number, like 5 or 12.50.</p> : <p className="text-xs text-slate-500">TCGplayer&apos;s market price, in US$. Press Enter or leave the box to apply.</p>}
        <label className="flex min-h-8 cursor-pointer items-center gap-2.5 pt-1 text-[15px] text-slate-200">
          <input type="checkbox" name="priced" value="1" checked={sp.get("priced") === "1"} onChange={() => setParam("priced", sp.get("priced") === "1" ? null : "1")} className="h-4 w-4 accent-[#9140da]" />
          Only cards with {withArticle(c.adjective)} listing
        </label>
      </Section>
      <Section title="Version" open={!!sp.get("finish")}>
        <Radio name="finish" value="" checked={!sp.get("finish")} onPick={() => setParam("finish", null)}>Any (non-foil first)</Radio>
        <Radio name="finish" value="nonfoil" checked={sp.get("finish") === "nonfoil"} onPick={() => setParam("finish", "nonfoil")}>Non-foil prices</Radio>
        <Radio name="finish" value="foil" checked={sp.get("finish") === "foil"} onPick={() => setParam("finish", "foil")}>Foil prices</Radio>
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
        <Section title="Color" open={colors.length > 0 || !!identity}>
          {(Object.keys(COLORS) as (keyof typeof COLORS)[]).map((k) => (
            <Check key={k} name="color" value={COLORS[k].slug} checked={on("color", COLORS[k].slug)} onToggle={() => flip("color", COLORS[k].slug)}>
              <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: COLORS[k].hex }} />
              {COLORS[k].label}
            </Check>
          ))}
          <Check name="color" value="colorless" checked={on("color", "colorless")} onToggle={() => flip("color", "colorless")}>Colorless</Check>
          <Check name="color" value="multicolor" checked={on("color", "multicolor")} onToggle={() => flip("color", "multicolor")}>Multicolor</Check>
          {colors.filter((w) => w !== "colorless" && w !== "multicolor").length > 0 ? (
            <div className="pt-1" role="group" aria-label="How the colors match">
              <Radio name="cmode" value="any" checked={!sp.get("cmode") || sp.get("cmode") === "any"} onPick={() => setParam("cmode", null)}>Any of these</Radio>
              <Radio name="cmode" value="exact" checked={sp.get("cmode") === "exact"} onPick={() => setParam("cmode", "exact")}>Exactly these</Radio>
              <Radio name="cmode" value="within" checked={sp.get("cmode") === "within"} onPick={() => setParam("cmode", "within")}>Only these (or colorless)</Radio>
            </div>
          ) : null}
          <p className="pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Commander identity</p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {COLOR_LETTERS.map((l) => {
              const key = l.toLowerCase(), color = Object.values(COLORS).find((x) => x.letter === l)!, active = identity.includes(key);
              return (
                <button key={l} type="button" onClick={() => flipIdentity(key)} aria-pressed={active} title={`${color.label} in the commander's identity`} className={`grid h-8 w-8 place-items-center rounded-full border text-xs font-bold ${active ? "border-brand-500 bg-brand-500/20 text-white" : "border-ink-700 text-slate-300 hover:border-ink-600"}`}>
                  {l}
                </button>
              );
            })}
            <button type="button" onClick={() => setParam("identity", identity === "c" ? null : "c")} aria-pressed={identity === "c"} title="Colorless identity" className={`grid h-8 w-8 place-items-center rounded-full border text-xs font-bold ${identity === "c" ? "border-brand-500 bg-brand-500/20 text-white" : "border-ink-700 text-slate-300 hover:border-ink-600"}`}>C</button>
          </div>
        </Section>
      ) : null}
      <Section title="Rarity" open={values(sp, "rarity").length > 0}>
        {RARITY_KEYS.filter((k) => k !== "T").map((k) => (
          <Check key={k} name="rarity" value={k} checked={on("rarity", k)} onToggle={() => flip("rarity", k)}>
            {RARITIES[k].label} <span className="text-slate-500">({k})</span>
          </Check>
        ))}
      </Section>
      <Section title="Card type" open={values(sp, "type").length > 0}>
        {PRIMARY_TYPES.filter((t) => t !== "other").map((t) => (
          <Check key={t} name="type" value={t} checked={on("type", t)} onToggle={() => flip("type", t)}>
            {PRIMARY_TYPE_LABEL[t]}
          </Check>
        ))}
      </Section>
      <Section title="Playable in" open={!!sp.get("format")}>
        <select name="format" aria-label="Format" value={sp.get("format") ?? ""} onChange={(e) => setParam("format", e.target.value || null)} className="input">
          <option value="">Any format</option>
          {FORMAT_UI.map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABEL[f]}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500">Legal or restricted today, from the card&apos;s Oracle record.</p>
      </Section>
      <Section title="Treatment" open={values(sp, "treat").length > 0}>
        {TREATMENT_GROUPS.map((g) => {
          const items = TREATMENTS.filter((t) => t.kind === g.kind && !t.hidden && t.syn.length > 0);
          if (!items.length) return null;
          return (
            <div key={g.kind} className="pb-2">
              <p className="pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g.label}</p>
              <div className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
                {items.map((t) => (
                  <Check key={t.key} name="treat" value={t.key} checked={on("treat", t.key)} onToggle={() => flip("treat", t.key)}>
                    <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: TREATMENT_KIND_DOT[t.kind] }} />
                    {t.label}
                  </Check>
                ))}
              </div>
            </div>
          );
        })}
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
