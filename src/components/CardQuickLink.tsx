"use client";

import Link from "next/link";
import { useQuickView } from "./QuickViewProvider";

// A link to a card page that opens the card's QuickView on a plain left click
// (RiftCompare's CardQuickLink). It keeps a real href, so crawlers, sharing,
// "open in new tab" and middle/ctrl/cmd/shift-clicks behave like any link; with
// no QuickView provider mounted it is simply a link. Hovering or focusing it
// prefetches the card's prices, so the dialog usually opens already filled.
// Drop it in anywhere a card list would otherwise link to /card/[slug].
// A row that shows a card's FOIL unit passes `finish="F"`: the link opens the card
// page on that finish (?finish=foil) and skips the QuickView, which opens on the
// headline unit and would show another price than the row did.
export default function CardQuickLink({
  slug,
  finish,
  className,
  title,
  children,
}: {
  slug: string;
  /** The unit the row shows; "F" links to the card page's Foil tab. */
  finish?: "N" | "F";
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const quick = useQuickView();
  const qv = finish === "F" ? null : quick;
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!qv || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const a = e.currentTarget;
    const img = a.querySelector("img");
    const text = a.querySelector("h3, [data-card-name]")?.textContent ?? null;
    qv.open(slug, { thumb: img?.currentSrc || img?.src || null, label: text?.trim() || null });
  };
  const warm = qv ? () => qv.prefetch(slug) : undefined;
  return (
    <Link href={finish === "F" ? `/card/${slug}?finish=foil` : `/card/${slug}`} prefetch={false} className={className} title={title} onClick={onClick} onPointerEnter={warm} onFocus={warm}>
      {children}
    </Link>
  );
}
