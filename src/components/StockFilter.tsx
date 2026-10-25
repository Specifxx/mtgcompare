"use client";

import { useState, type ReactNode } from "react";

/**
 * "In stock only", ON by default (stock first: owner's feedback, 2026-10-25), on the type and set pages. Both lists are in the server
 * HTML (one cached copy for everyone, crawlers included; no query parameter, no cookie): the in-stock list shows, and the sold-out
 * one is `hidden` until the visitor turns the filter off. A plain toggle button with aria-pressed; nothing moves above it.
 */
export function StockFilter({ soldCount, soldLabel = "sold out", children, soldOut }: { soldCount: number; soldLabel?: string; children: ReactNode; soldOut: ReactNode }) {
  const [only, setOnly] = useState(true);
  return (
    <div data-stock-filter="">
      {soldCount > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <button
            type="button"
            aria-pressed={only}
            onClick={() => setOnly((v) => !v)}
            className={`chip min-h-10 font-semibold ${only ? "chip-on" : ""}`}
          >
            <span className={`h-2 w-2 rounded-full ${only ? "bg-open" : "bg-faint"}`} aria-hidden="true" /> In stock only
          </button>
          <span>{only ? `${soldCount} ${soldLabel} hidden` : `Showing ${soldCount} ${soldLabel} too`}</span>
        </div>
      )}
      {children}
      <div hidden={only} data-sold-out="">
        {soldOut}
      </div>
    </div>
  );
}
