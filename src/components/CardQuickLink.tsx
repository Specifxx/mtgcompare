"use client";

import Link from "next/link";
import { useContext } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
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
//
// A THIN printing (outside the relevant quarter: noindex, out of the sitemap) passes `thin` (DECISIONS.md, "Crawlers stop finding
// the thin pages", 2026-10-19): the row is still a link for a person (a click opens its QuickView, Enter or a modified click
// opens the page) but carries NO href, so a crawler following list pages never reaches the three printings in four it is told
// not to index. CardAnchor is the same switch for components that draw their own anchor (CardTile).
type AnchorProps = Omit<React.AnchorHTMLAttributes<HTMLElement>, "href" | "onClick"> & { href: string; thin?: boolean; onClick?: (e: React.MouseEvent<HTMLElement>) => void; children: React.ReactNode };
export function CardAnchor({ href, thin, onClick, children, ...rest }: AnchorProps) {
  // The router's context, not useRouter(): that throws outside the app router (a server render in a test); without one, a full load.
  const router = useContext(AppRouterContext);
  if (!thin) return <Link href={href} prefetch={false} onClick={onClick} {...rest}>{children}</Link>;
  const go = (newTab: boolean) => (newTab ? window.open(href, "_blank", "noopener") : router ? router.push(href) : window.location.assign(href));
  return (
    <span
      role="link"
      tabIndex={0}
      data-card-href={href}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) go(e.metaKey || e.ctrlKey || e.shiftKey);
      }}
      onAuxClick={(e) => {
        if (e.button === 1) go(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") go(e.metaKey || e.ctrlKey);
      }}
      style={{ cursor: "pointer", ...(rest.style ?? {}) }}
    >
      {children}
    </span>
  );
}

export default function CardQuickLink({
  slug,
  finish,
  className,
  title,
  thin,
  children,
}: {
  slug: string;
  /** The unit the row shows; "F" links to the card page's Foil tab. */
  finish?: "N" | "F";
  className?: string;
  title?: string;
  /** A THIN printing: no href for crawlers (see CardAnchor). */
  thin?: boolean;
  children: React.ReactNode;
}) {
  const quick = useQuickView();
  const qv = finish === "F" ? null : quick;
  const onClick = (e: React.MouseEvent<HTMLElement>) => {
    if (!qv || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const a = e.currentTarget;
    const img = a.querySelector("img");
    const text = a.querySelector("h3, [data-card-name]")?.textContent ?? null;
    qv.open(slug, { thumb: img?.currentSrc || img?.src || null, label: text?.trim() || null });
  };
  const warm = qv ? () => qv.prefetch(slug) : undefined;
  return (
    <CardAnchor href={finish === "F" ? `/card/${slug}?finish=foil` : `/card/${slug}`} thin={thin} className={className} title={title} onClick={onClick} onPointerEnter={warm} onFocus={warm}>
      {children}
    </CardAnchor>
  );
}
