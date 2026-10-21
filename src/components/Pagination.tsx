import Link from "next/link";

/**
 * Server-rendered page links, so every row of a long list is reachable from
 * HTML (crawlers don't press "Show more"). Page 1 is the bare URL; page N is
 * `${base}/page/N`, each its own cached render. Nothing is prefetched: a
 * listing page's RSC payload is big and most links are never followed.
 */
export function pageHref(base: string, page: number): string {
  return page <= 1 ? base : `${base}/page/${page}`;
}

/** The page numbers to show: the first, the last, and two either side of the current one, with "…" for a gap. */
export function pageItems(page: number, pages: number): (number | "…")[] {
  const want = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2].filter((n) => n >= 1 && n <= pages));
  const items: (number | "…")[] = [];
  let prev = 0;
  for (const n of [...want].sort((a, b) => a - b)) {
    if (n - prev > 1) items.push("…");
    items.push(n);
    prev = n;
  }
  return items;
}

// Every link is a 44px target. A phone shows "← Previous · 3 of 47 · Next →" (the numbers would wrap at 320px); from sm the
// numbered pages show too. The numbers are in the HTML at every width, so every page stays linked for crawlers.
export function Pagination({ base, page, pages }: { base: string; page: number; pages: number }) {
  if (pages <= 1) return null;
  const cell = "inline-flex h-11 min-w-11 items-center justify-center rounded-full px-3 text-sm font-medium";
  const step = `${cell} gap-1.5 px-4`;
  return (
    <nav aria-label="Pages" className="mt-10 flex items-center justify-center gap-1">
      {page > 1 ? (
        <Link href={pageHref(base, page - 1)} prefetch={false} rel="prev" className={`${step} btn-ghost`}>
          <span aria-hidden="true">←</span> Previous
        </Link>
      ) : (
        <span className={`${step} text-faint`} aria-disabled="true">
          <span aria-hidden="true">←</span> Previous
        </span>
      )}
      <span className="tabular px-2 text-sm text-muted sm:hidden">
        {page} of {pages}
      </span>
      {pageItems(page, pages).map((it, i) =>
        it === "…" ? (
          <span key={`gap-${i}`} className="hidden w-6 justify-center text-sm text-faint sm:inline-flex" aria-hidden="true">
            …
          </span>
        ) : it === page ? (
          <span key={it} className={`${cell} tabular hidden bg-ink text-surface sm:inline-flex`} aria-current="page">
            {it}
          </span>
        ) : (
          <Link key={it} href={pageHref(base, it)} prefetch={false} aria-label={`Page ${it}`} className={`${cell} tabular hidden border border-line bg-surface hover:bg-raised sm:inline-flex`}>
            {it}
          </Link>
        ),
      )}
      {page < pages ? (
        <Link href={pageHref(base, page + 1)} prefetch={false} rel="next" className={`${step} btn-ghost`}>
          Next <span aria-hidden="true">→</span>
        </Link>
      ) : (
        <span className={`${step} text-faint`} aria-disabled="true">
          Next <span aria-hidden="true">→</span>
        </span>
      )}
    </nav>
  );
}
