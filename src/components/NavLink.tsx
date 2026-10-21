"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Is `href` the section the visitor is in? The link's own page, or any page under it ("/us/sets/pitch-black" is in
 * "/us/sets"), or under one of `also` ("/us/type/tins" is in "All sealed"). Whole segments only: "/us/sets" does not match
 * "/us/setsx". Trailing slashes and query strings are ignored. Pure, so the tests pin it.
 */
export function isActivePath(pathname: string | null | undefined, href: string, also: readonly string[] = []): boolean {
  if (!pathname) return false;
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return [href, ...also].some((h) => {
    const base = h.replace(/\/+$/, "") || "/";
    return path === base || path.startsWith(`${base}/`);
  });
}

/** A header nav link that knows it is the current section: aria-current="page" and the raised, ink-coloured state. */
export function NavLink({ href, also, children, className = "" }: { href: string; also?: readonly string[]; children: ReactNode; className?: string }) {
  const active = isActivePath(usePathname(), href, also);
  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={active ? "page" : undefined}
      // bg-raised alone is a whisper on the white header in light mode: the inset hairline makes the current section legible.
      className={`${className} ${active ? "bg-raised text-ink ring-1 ring-inset ring-line" : "text-muted hover:bg-raised hover:text-ink"}`}
    >
      {children}
    </Link>
  );
}
