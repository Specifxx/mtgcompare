import Link from "next/link";
import { breadcrumbJsonLd, jsonLd } from "@/lib/seo";

export interface Crumb {
  href?: string;
  label: string;
}

/** The crumb a phone's back link goes to: the last one with a link before the current page (the page itself has none). */
export function parentCrumb(items: Crumb[]): (Crumb & { href: string }) | null {
  for (let i = items.length - 2; i >= 0; i--) {
    const it = items[i];
    if (it.href) return { ...it, href: it.href };
  }
  return null;
}

/**
 * Where the page sits. Below sm, one "← {parent}" link (40px tall: a thumb's target, and one line instead of a wrapping trail
 * above the H1); from sm, the whole trail. The BreadcrumbList JSON-LD (seo.ts breadcrumbJsonLd) is emitted once, whichever shows.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const parent = parentCrumb(items);
  return (
    <nav aria-label="Breadcrumb" className="mb-2 text-sm text-muted sm:mb-5">
      {parent && (
        <Link href={parent.href} prefetch={false} className="-ml-1 inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-lg px-1 font-medium hover:text-ink sm:hidden">
          <span aria-hidden="true">←</span>
          <span className="truncate">{parent.label}</span>
        </Link>
      )}
      <ol className={`${parent ? "hidden sm:flex" : "flex"} flex-wrap items-center gap-1.5`}>
        {items.map((it, i) => (
          <li key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && (
              <span aria-hidden="true" className="text-faint">
                /
              </span>
            )}
            {it.href ? (
              <Link href={it.href} prefetch={false} className="hover:text-ink hover:underline hover:underline-offset-2">
                {it.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-ink">
                {it.label}
              </span>
            )}
          </li>
        ))}
      </ol>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd(items)) }} />
    </nav>
  );
}
