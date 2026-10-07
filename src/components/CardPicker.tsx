"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Country } from "@/lib/country";

/** A card picked from /api/search (the header search's own hits, cards only). */
export interface PickerCard {
  id: number;
  slug: string;
  name: string;
  number: string | null;
  variant: string | null;
  set: string;
  img: string | null;
  price: string;
  low?: Record<Country, number | null>;
}

// RiftCompare's CardSearch in "pick" mode: the header search navigates, this
// one hands the picked printing to the tool it sits in (the deck pricer, Best
// Basket, the trade calculator). Cards only, keyboard-driven, at most the
// search route's ten hits.
export function CardPicker({
  initialQuery = "",
  placeholder = "Card name or number, e.g. Nami or OP01-016",
  onPick,
  disabled = false,
  autoFocus = false,
  inputId,
  ariaLabel,
}: {
  initialQuery?: string;
  placeholder?: string;
  onPick: (card: PickerCard) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  inputId?: string;
  ariaLabel?: string;
}) {
  const [q, setQ] = useState(initialQuery);
  const [hits, setHits] = useState<PickerCard[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(Boolean(initialQuery));
  const input = useRef<HTMLInputElement>(null);
  const listId = `${useId()}-results`;
  useEffect(() => {
    if (autoFocus || initialQuery) input.current?.focus();
  }, [autoFocus, initialQuery]);
  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(s)}`, { signal: ctrl.signal });
        if (r.ok) {
          const j = (await r.json()) as { hits?: (PickerCard & { kind: string })[] };
          setHits((j.hits ?? []).filter((h) => h.kind === "card" && typeof h.id === "number"));
          setActive(-1);
        }
      } catch {
        /* aborted */
      }
    }, 160);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);
  const pick = (h: PickerCard) => {
    setOpen(false);
    setQ("");
    setHits([]);
    onPick(h);
  };
  return (
    <div className="relative">
      <input
        id={inputId}
        ref={input}
        value={q}
        disabled={disabled}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, hits.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, -1));
          } else if (e.key === "Enter" && hits.length) {
            e.preventDefault();
            pick(hits[Math.max(0, active)]);
          } else if (e.key === "Escape") setOpen(false);
        }}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open && hits.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        placeholder={placeholder}
        autoComplete="off"
        className="input sm:text-sm"
      />
      {open && hits.length ? (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 z-dropdown mt-1 max-h-80 overflow-y-auto rounded-lg border border-ink-700 bg-ink-900 shadow-glow">
          {hits.map((h, i) => (
            <li
              key={h.slug}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(h);
              }}
              className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${i === active ? "bg-ink-800" : "hover:bg-ink-800"}`}
            >
              {h.img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={h.img} alt="" className="h-11 w-8 shrink-0 rounded-sm bg-ink-800 object-cover" loading="lazy" />
              ) : (
                <span className="h-11 w-8 shrink-0 rounded-sm bg-ink-800" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-100">
                  {h.name}
                  {h.variant ? <span className="font-normal text-slate-400"> · {h.variant}</span> : null}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {h.set}
                  {h.number ? ` · ${h.number}` : ""}
                </span>
              </span>
              <span className="num shrink-0 text-sm font-semibold text-accent">{h.price}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
