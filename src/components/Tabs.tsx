"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

export interface Tab {
  label: string;
  /** A small number beside the label (how many the panel holds). */
  count?: number;
  panel: ReactNode;
}

/**
 * One shelf, several lists (owner, 2026-11-13: "the product's very easy to access rather than have everything everywhere all at
 * once"): the region home's deals, Play Booster Boxes, Collector Booster Boxes and pre-orders used to be four lists stacked down
 * the page. Every panel is rendered by the server and stays in the HTML (a crawler reads all of them; the ones not chosen are
 * `hidden`), so the tabs cost no fetch and no layout shift. The WAI-ARIA tabs pattern: arrow keys, Home and End move between tabs,
 * Tab goes into the panel.
 */
export function Tabs({ tabs, label }: { tabs: Tab[]; label: string }) {
  const id = useId();
  const [at, setAt] = useState(0);
  // The panel's fade-in is for a change of tab only: the first one is simply there (nothing on the page fades in on load).
  const [moved, setMoved] = useState(false);
  const go = (i: number) => {
    setAt(i);
    setMoved(true);
  };
  if (!tabs.length) return null;
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = e.key === "ArrowRight" ? (at + 1) % tabs.length : e.key === "ArrowLeft" ? (at - 1 + tabs.length) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    go(next);
    document.getElementById(`${id}-t${next}`)?.focus();
  };
  return (
    <div>
      <div role="tablist" aria-label={label} className="tabs-list" onKeyDown={onKeyDown}>
        {tabs.map((t, i) => (
          <button key={t.label} type="button" role="tab" id={`${id}-t${i}`} aria-selected={i === at} aria-controls={`${id}-p${i}`} tabIndex={i === at ? 0 : -1} onClick={() => go(i)} className="tab">
            {t.label}
            {t.count != null && <span className="tab-count">{t.count}</span>}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.label} role="tabpanel" id={`${id}-p${i}`} aria-labelledby={`${id}-t${i}`} hidden={i !== at} className={moved ? "tab-panel pt-6" : "pt-6"}>
          {t.panel}
        </div>
      ))}
    </div>
  );
}
