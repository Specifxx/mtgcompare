import Link from "next/link";
import { hrefFor, type DealFinderParams, type DealFinderView } from "@/lib/deal-finder-href";

const VIEWS: { key: DealFinderView; label: string }[] = [
  { key: "tcg", label: "Underpriced vs TCGplayer" },
  { key: "ebay", label: "Cheapest on eBay" },
  { key: "vs-ebay", label: "Underpriced vs eBay" },
];

// Deal Finder's three views (RiftCompare's ViewTabs). Links, not client state:
// each view is its own URL (hrefFor with view + page 1, keeping the parameters
// that view uses), so Back works, a view can be shared and the server renders
// only the list that is showing. Three equal segments at every width — at 390px
// a label wraps inside its segment rather than the row wrapping.
export function ViewTabs({ params }: { params: DealFinderParams }) {
  return (
    <nav aria-label="Deal Finder views" className="mb-5 grid grid-cols-3 gap-1 rounded-xl border border-ink-800 bg-ink-900 p-1">
      {VIEWS.map((v) => {
        const active = params.view === v.key;
        return (
          <Link
            key={v.key}
            href={hrefFor(params, { view: v.key, page: 1 })}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center justify-center rounded-lg px-2 py-1.5 text-center text-xs font-bold leading-tight sm:text-sm ${active ? "bg-brand-500 text-[#ffffff]" : "text-slate-400 hover:bg-ink-800 hover:text-white"}`}
          >
            {v.label}
          </Link>
        );
      })}
    </nav>
  );
}
