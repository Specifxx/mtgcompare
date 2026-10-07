import Link from "next/link";
import { breadcrumb, ldJson, type Crumb } from "@/lib/jsonld";

// RiftCompare's Breadcrumbs: "Home / Section / Page" in small slate type, the
// current page unlinked, and the page's BreadcrumbList JSON-LD emitted right
// here — so a page never needs (and must not add) a second BreadcrumbList.
export function Breadcrumbs({ trail, className }: { trail: Crumb[]; className?: string }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(breadcrumb(trail)) }} />
      <nav className={`flex flex-wrap items-center gap-1.5 text-xs text-slate-500 ${className ?? "mb-3"}`} aria-label="Breadcrumb">
        <Link href="/" className="hover:text-slate-300">
          Home
        </Link>
        {trail.map((c, i) => (
          <span key={`${c.href ?? ""}-${c.name}`} className="flex items-center gap-1.5">
            <span aria-hidden>/</span>
            {i === trail.length - 1 || !c.href ? (
              <span className="text-slate-300">{c.name}</span>
            ) : (
              <Link href={c.href} className="hover:text-slate-300">
                {c.name}
              </Link>
            )}
          </span>
        ))}
      </nav>
    </>
  );
}
