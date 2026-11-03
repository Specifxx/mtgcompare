import Link from "@/components/Link";
import { preorderSetList, sealedInSet } from "@/lib/hubs";
import { isPreorder, longDate, preorderPath } from "@/lib/preorders";

// One line under the header on every page while a release is on pre-order,
// linking its landing page: Rift Compare's season banner did the same for
// /radiance-preorders, which became its most visited page.
export function PreorderStrip() {
  // "Pre-orders are open" must be true: a set listed before any store (written copy, lib/preorders.ts) waits for its first listing.
  const next = preorderSetList().find((s) => isPreorder(s) && sealedInSet(s.id).length > 0);
  if (!next) return null;
  return (
    <div className="border-b border-ink-700/60 bg-ink-900/70">
      <p className="mx-auto max-w-7xl truncate px-4 py-1.5 text-center text-xs text-muted sm:text-sm">
        <Link href={preorderPath(next)} className="hover:text-fg">
          <b className="text-fg">{next.name}</b> pre-orders are open · out {longDate(next.releasedOn)} · <span className="link">compare every store →</span>
        </Link>
      </p>
    </div>
  );
}
