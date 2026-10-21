"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { REGION_LIST, isRegion, type Region } from "@/lib/regions";

/** The path after the region segment: "/au/sets/pitch-black" → "/sets/pitch-black", "/au" → "", "/about" → "/about". */
export function pathAfterRegion(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length && isRegion(parts[0])) parts.shift();
  return parts.length ? `/${parts.join("/")}` : "";
}

/**
 * The same page in another region. On a region page (`current` set) that is the same path with the first segment swapped;
 * on a page with no region of its own (About, the legal pages, a 404 even under /au/…) it is the region's home.
 */
export function regionSwitchHref(pathname: string, to: Region, current: Region | null): string {
  const first = pathname.split("/").filter(Boolean)[0];
  return current && isRegion(first) ? `/${to}${pathAfterRegion(pathname)}` : `/${to}`;
}

// Plain links, not a redirect: each region is its own set of pages.
//
// `compact`: a flag-only, 44×44 button below lg (the phone header's one row has room for the logo mark, the search box, this and
// the menu button), the flag-and-code chip from lg up. Without it, the chip at every width; with no region, "Choose region".
export function RegionSwitcher({ region, compact = false }: { region: Region | null; compact?: boolean }) {
  const pathname = usePathname() || "/";
  const ref = useRef<HTMLDetailsElement>(null);
  const current = region ? REGION_LIST.find((r) => r.region === region) : null;

  useEffect(() => {
    if (region) {
      try {
        localStorage.setItem("dex-region", region);
      } catch {
        /* storage blocked — fine */
      }
    }
  }, [region]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    // Escape closes the list and gives focus back to its button (a <details> has no Escape of its own).
    const esc = (e: KeyboardEvent) => {
      const d = ref.current;
      if (e.key !== "Escape" || !d?.open) return;
      d.open = false;
      d.querySelector("summary")?.focus();
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  const label = current ? `Region: ${current.name}. Change region` : "Choose region";
  return (
    <details ref={ref} className="relative shrink-0">
      <summary
        aria-label={label}
        title={label}
        className={`chip cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden ${
          compact ? "h-11 w-11 justify-center px-0 text-xl lg:h-9 lg:w-auto lg:px-3 lg:text-sm" : "h-11 lg:h-9"
        }`}
      >
        <span aria-hidden="true" className={compact ? "leading-none lg:text-base" : ""}>
          {current?.flag ?? "🌏"}
        </span>
        <span className={compact ? "hidden lg:inline" : ""}>{current?.short ?? "Choose region"}</span>
        <svg viewBox="0 0 20 20" className={`h-3.5 w-3.5 text-faint ${compact ? "hidden lg:block" : ""}`} aria-hidden="true">
          <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </summary>
      <div className="card absolute right-0 z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] p-1.5 shadow-lift">
        <p className="px-3 pb-1 pt-2 text-xs font-semibold text-muted">Each region compares its own stores, in its own currency</p>
        <ul>
          {REGION_LIST.map((r) => (
            <li key={r.region}>
              <Link
                href={regionSwitchHref(pathname, r.region, region)}
                prefetch={false}
                aria-current={r.region === region ? "true" : undefined}
                onClick={() => ref.current && (ref.current.open = false)}
                className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-raised ${r.region === region ? "bg-raised font-semibold" : ""}`}
              >
                <span className="text-lg" aria-hidden="true">
                  {r.flag}
                </span>
                <span className="flex-1">{r.name}</span>
                <span className="text-xs text-muted">{r.currency}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
