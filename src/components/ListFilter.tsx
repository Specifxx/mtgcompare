"use client";

// A filter box over a server-drawn list (owner, 2026-11-23 UX review, P2 17): the sets index and the Pokémon index. Every item is in
// the HTML (crawlers and no-script visitors see all of it); typing hides the items whose `data-filter` text lacks the words, and a
// `data-filter-group` (a series) with nothing left. Hidden with style.display: Tailwind's display classes beat the `hidden` attribute.
import { useEffect, useId, useState } from "react";

export function ListFilter({ target, label, placeholder }: { target: string; label: string; placeholder: string }) {
  const id = useId();
  const [q, setQ] = useState("");
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const root = document.getElementById(target);
    if (!root) return;
    const words = q.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/).filter(Boolean);
    let shown = 0;
    root.querySelectorAll<HTMLElement>("[data-filter]").forEach((el) => {
      const text = (el.dataset.filter ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      const keep = words.every((w) => text.includes(w));
      el.style.display = keep ? "" : "none";
      if (keep) shown++;
    });
    root.querySelectorAll<HTMLElement>("[data-filter-group]").forEach((g) => {
      const any = [...g.querySelectorAll<HTMLElement>("[data-filter]")].some((el) => el.style.display !== "none");
      g.style.display = any ? "" : "none";
    });
    setLeft(words.length ? shown : null);
  }, [q, target]);

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="h-11 w-full max-w-sm rounded-xl border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-faint focus:border-brand"
      />
      {left != null && (
        <p className="text-sm text-muted" aria-live="polite">
          {left === 0 ? (
            <>
              Nothing matches.{" "}
              <button type="button" onClick={() => setQ("")} className="font-semibold text-brand-strong hover:underline">
                Clear
              </button>
            </>
          ) : (
            `${left} shown`
          )}
        </p>
      )}
    </div>
  );
}
