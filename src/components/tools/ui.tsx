"use client";

// The tools' shared controls (src/components/tools): a labelled field, a money field that keeps what the reader typed, a result figure,
// and the per-browser memory each tool keeps its inputs in (localStorage, wrapped: private windows and blocked storage just forget).
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export const INPUT =
  "h-11 w-full min-w-0 rounded-xl border border-line bg-raised px-3 text-base tabular outline-none transition-shadow placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/15 md:text-sm";

export function Field({ label, hint, children, className = "" }: { label: string; hint?: ReactNode; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
      </label>
      {children(id)}
      {hint && <p className="mt-1 text-xs leading-5 text-muted">{hint}</p>}
    </div>
  );
}

/** A text field for money or a percentage: keeps the reader's own text (no reformatting while they type). */
export function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  hint,
  placeholder = "0.00",
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  hint?: ReactNode;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Field label={label} hint={hint} className={className}>
      {(id) => (
        <div className="relative">
          {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">{prefix}</span>}
          <input
            id={id}
            inputMode="decimal"
            autoComplete="off"
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className={`${INPUT} ${prefix ? "pl-12" : ""} ${suffix ? "pr-8" : ""}`}
          />
          {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">{suffix}</span>}
        </div>
      )}
    </Field>
  );
}

/** One figure of a result panel. */
export function Figure({ label, value, tone = "ink", sub }: { label: string; value: ReactNode; tone?: "ink" | "open" | "sold" | "brand"; sub?: ReactNode }) {
  const color = { ink: "text-ink", open: "text-open", sold: "text-sold", brand: "text-brand-strong" }[tone];
  return (
    <div className="min-w-0 rounded-xl bg-raised px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className={`tabular mt-1 font-display text-xl font-extrabold sm:text-2xl ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs leading-5 text-muted">{sub}</div>}
    </div>
  );
}

/** The tool's own box on the page. */
export function ToolCard({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section aria-label={label} className="card mt-6 p-4 sm:p-6" data-tool="">
      {children}
    </section>
  );
}

/** State that this browser remembers (key per tool and region). Starts from `initial` on the server and first render, then loads. */
export function useRemembered<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(initial);
  const loaded = useRef(false);
  useEffect(() => {
    try {
      const s = window.localStorage.getItem(key);
      if (s) setV(JSON.parse(s) as T);
    } catch {
      /* storage blocked: start fresh */
    }
    loaded.current = true;
  }, [key]);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* storage blocked or full: nothing to keep */
    }
  }, [key, v]);
  return [v, setV];
}

/** The currency's code as an input prefix ("A$", "US$", "£"…), from money()'s own formatting of zero. */
export function currencyPrefix(zero: string): string {
  return zero.replace(/[\d.,\s]/g, "") || "$";
}
