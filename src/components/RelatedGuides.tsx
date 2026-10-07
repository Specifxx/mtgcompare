import Link from "next/link";
import type { RelatedGuide } from "@/lib/content/tool-guides";

// "Read next": up to three of our posts, each with one line on what it covers
// (RiftCompare's RelatedGuides). Shared so every tool and data page links to
// the writing that explains it (lib/content/tool-guides.ts). A server component
// with no data of its own — callers pass guidesForTool(...) — and nothing at
// all when there is nothing relevant, because a "related" link that isn't
// related is worse than none.
//
// Placement: after the page's own data and before any affiliate block, so our
// content leads and the commercial block follows.
export function RelatedGuides({
  guides,
  heading = "Read next",
  className = "card-surface mt-6 p-5",
}: {
  guides: RelatedGuide[];
  heading?: string;
  className?: string;
}) {
  if (!guides.length) return null;
  return (
    <section className={className} aria-label={heading}>
      <h2 className="font-bold text-white">{heading}</h2>
      <ul className="mt-3 space-y-3">
        {guides.map((g) => (
          <li key={g.slug}>
            <Link href={g.href} className="group block">
              <span className="block text-sm font-semibold text-brand-400 group-hover:underline">{g.title}</span>
              <span className="block text-xs text-slate-500">{g.reason}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
