"use client";

import Link from "next/link";
import { useSealedQuickView } from "./SealedQuickView";

// A link to a sealed page that opens the product's quick view on a plain left
// click (the CardQuickLink pattern). It keeps a real href, so crawlers, sharing,
// new tabs and modified clicks behave like any link; with no provider mounted it
// is simply a link. Hover or focus prefetches the product's offers.
export default function SealedQuickLink({ slug, className, children }: { slug: string; className?: string; children: React.ReactNode }) {
  const qv = useSealedQuickView();
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!qv || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const a = e.currentTarget;
    const img = a.querySelector("img");
    qv.open(slug, { thumb: img?.currentSrc || img?.src || null, label: a.querySelector("h3")?.textContent?.trim() || null });
  };
  const warm = qv ? () => qv.prefetch(slug) : undefined;
  return (
    <Link href={`/sealed/${slug}`} prefetch={false} className={className} onClick={onClick} onPointerEnter={warm} onFocus={warm}>
      {children}
    </Link>
  );
}
