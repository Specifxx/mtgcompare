"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { buyLabel } from "@/lib/deal-ui";
import type { DealSource } from "@/lib/deals";
import { hrefFor, type DealFinderParams } from "@/lib/deal-finder-href";

// The Deal Finder's store picker (RiftCompare's ArbitrageFilters), on the
// "Underpriced vs TCGplayer" view for Plus members. Only the BUY side is
// selectable: every row is measured against TCGplayer's market price, and
// TCGplayer is never on the list. Ticking changes a local draft; nothing
// reloads until Apply. "only" beside a source applies that one at once. All /
// None set the draft. OP Compare tracks up to ~50 stores in a market, so the
// list scrolls inside the panel.
//
// The URL is built by hrefFor() from the page's FULL parameter set, so applying
// a store change keeps the sort and "Only my cards" and resets only the page.
export function StorePicker({
  sources,
  buy,
  defaultBuy,
  params,
}: {
  sources: DealSource[];
  buy: string[]; // the effective selection (params.buy, or the default when absent)
  defaultBuy: string[];
  params: DealFinderParams;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(buy);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buyKey = buy.join(",");
  // A navigation (Back, a view tab) changes `buy` under an open picker.
  useEffect(() => setDraft(buyKey ? buyKey.split(",") : []), [buyKey]);

  // Keyboard: focus moves into the panel when it opens, and Escape closes it
  // (dropping the draft) and returns focus to the button.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("input,button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setDraft(buyKey ? buyKey.split(",") : []);
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, buyKey]);

  function apply(next: string[]) {
    setOpen(false);
    router.push(hrefFor(params, { buy: next, page: 1 }), { scroll: false });
  }
  // One checkbox click never empties the selection; "None" (deliberate) may.
  function toggle(key: string) {
    const next = draft.includes(key) ? draft.filter((k) => k !== key) : [...draft, key];
    if (!next.length) return;
    setDraft(next);
  }
  const dirty = draft.length !== buy.length || draft.some((k) => !buy.includes(k));

  return (
    <div className="relative">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Buy from</div>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="mt-0.5 flex min-h-11 min-w-[170px] items-center justify-between gap-2 rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm font-semibold text-white hover:border-brand-500"
      >
        <span className="truncate">{buyLabel(buy, sources, defaultBuy)}</span>
        <span className="text-slate-500" aria-hidden="true">▾</span>
      </button>
      {open ? (
        <>
          <button type="button" className="fixed inset-0 z-dropdown cursor-default" aria-hidden tabIndex={-1} onClick={() => setOpen(false)} />
          <div ref={panelRef} role="dialog" aria-label="Choose stores" className="absolute left-0 z-overlay mt-1 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-ink-700 bg-ink-900 p-2 shadow-glow">
            <div className="mb-1 flex items-center justify-between border-b border-ink-800 px-1 pb-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {draft.length} of {sources.length} sources
              </span>
              <div className="flex items-center gap-2 text-xs font-semibold">
                <button type="button" onClick={() => setDraft(sources.map((s) => s.key))} className="min-h-8 px-1 text-brand-400 hover:underline">
                  All
                </button>
                <span className="text-slate-600">·</span>
                <button type="button" onClick={() => setDraft([])} className="min-h-8 px-1 text-slate-400 hover:text-white hover:underline">
                  None
                </button>
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto overscroll-contain">
              {sources.map((s) => (
                <label key={s.key} className="flex min-h-10 cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-sm hover:bg-ink-800">
                  <span className="flex min-w-0 items-center gap-2">
                    <input type="checkbox" checked={draft.includes(s.key)} onChange={() => toggle(s.key)} className="h-4 w-4 accent-brand-500" />
                    <span className={`truncate ${s.isEbay ? "font-semibold text-sky-300" : "text-slate-200"}`}>{s.name}</span>
                  </span>
                  {/* Always visible: a hover-only reveal is unreachable on touch. */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault(); // don't also toggle the checkbox under it
                      apply([s.key]);
                    }}
                    className="shrink-0 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 hover:text-brand-400"
                  >
                    only
                  </button>
                </label>
              ))}
            </div>
            <div className="mt-1.5 flex items-center justify-end gap-2 border-t border-ink-800 px-1 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDraft(buy);
                  setOpen(false);
                }}
                className="min-h-9 px-2 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button type="button" onClick={() => apply(draft)} disabled={!dirty} className="btn-primary min-h-9 px-3 py-1 text-xs disabled:opacity-40">
                Apply
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
