import type { ReactNode } from "react";

/**
 * Reading matter that stays in the HTML but out of the way (owner, 2026-11-13: fewer things on a page): the week's market report,
 * the regions compared, every set, the day's summary. One line each, its heading still an <h2> in the page's outline, opened with
 * a tap. A native <details>: no script, and the browser's find-in-page opens it. Closed by default; a crawler reads it either way.
 */
export function Fold({ id, title, children, open = false, ...data }: { id: string; title: ReactNode; children: ReactNode; open?: boolean; [key: `data-${string}`]: string | undefined }) {
  return (
    <details className="fold" open={open || undefined} data-fold={id} {...data}>
      <summary>
        <h2 id={id}>{title}</h2>
        <span className="fold-mark" aria-hidden="true">
          <svg viewBox="0 0 12 12" width="12" height="12">
            <path d="M6 1.5v9M1.5 6h9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}

/** A list of folds under one quiet label. */
export function Folds({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="mt-20 border-t border-line sm:mt-24">
      {children}
    </section>
  );
}
