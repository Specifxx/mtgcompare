"use client";

// The Black Friday / Cyber Monday pages' section chips (owner's review, 2026-11-24): anchor links that stay under the sticky header
// as the page scrolls, the current section highlighted. It also counts how far visitors get: each section sends one `bf_section`
// event the first time it scrolls into view (scroll depth per section, so sections nobody reaches can be cut). Chips for sections
// the page did not render are dropped on mount.
import { useEffect, useState } from "react";
import { track } from "@vercel/analytics";

export function SaleNav({ items, page }: { items: { id: string; label: string }[]; page: string }) {
  const [present, setPresent] = useState(items);
  const [active, setActive] = useState(items[0]?.id ?? "");
  useEffect(() => {
    const here = items.filter((i) => document.getElementById(i.id));
    setPresent(here);
    const seen = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const id = e.target.id;
          setActive(id);
          if (!seen.has(id)) {
            seen.add(id);
            try {
              track("bf_section", { page, section: id });
            } catch {
              /* analytics blocked */
            }
          }
        }
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    for (const i of here) io.observe(document.getElementById(i.id)!);
    return () => io.disconnect();
  }, [items, page]);
  return (
    <nav aria-label="On this page" className="sticky top-[var(--hdr)] z-30 -mx-4 mt-4 overflow-x-auto border-b border-line bg-bg/90 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-b-xl sm:px-2">
      <ul className="flex gap-2 whitespace-nowrap">
        {present.map((i) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              aria-current={active === i.id ? "true" : undefined}
              className={`inline-flex min-h-10 items-center rounded-full border px-3 text-sm font-semibold ${active === i.id ? "border-brand bg-brand text-white" : "border-line text-muted hover:text-ink"}`}
            >
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
