"use client";

import { useState } from "react";
import { QUANTITY_CAP } from "@/lib/collection-cost";
import { trackEvent } from "@/lib/analytics";
import { FREE_LIMIT_STATUS, parseFreeLimit, type FreeLimitBody } from "@/lib/free-limits";
import { useMe } from "@/lib/use-me";
import { Spinner } from "./ui/Skeleton";
import { PortfolioLimitNotice as FreeLimitPanel } from "./PortfolioLimitNotice";

// "＋ Add to collection" — RiftCompare's QuickView addToCollection block, as one
// component so QuickView and the card page share it (wave 2, 2026-10-03).
// States: saving / added (with "Add another +1") / sign-in / limit (the free
// portfolio's upgrade panel, inline) / full (999 copies already) / error.
// No foil toggle: on OP Compare a foil finish is its own TCGplayer product, so
// the route takes the card's own finish.
//
// btn-ghost, not btn-primary: the buy buttons above are the page's only filled
// CTA — this is a secondary action and shouldn't compete with them.
export function AddToCollectionButton({ cardId, cardPath, src = "quickview" }: { cardId: number; cardPath: string; src?: string }) {
  const [coll, setColl] = useState<"idle" | "saving" | "added" | "full" | "signin" | "error">("idle");
  // The free portfolio limit, when "Add to collection" hit it (lib/free-limits.ts).
  const [collLimit, setCollLimit] = useState<FreeLimitBody | null>(null);

  const { me, loaded } = useMe();

  async function addToCollection() {
    // A signed-out visitor is asked to sign in without a request that can only
    // answer 401 (which also logged a console error). The 401 branch below
    // still covers a session that expired after /api/me ran.
    if (loaded && !me.user) return setColl("signin");
    setColl("saving");
    try {
      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId }),
      });
      if (res.status === 401) return setColl("signin");
      // A new card on a free account at its portfolio limit: nothing was
      // added, and the upgrade panel shows under this button.
      if (res.status === FREE_LIMIT_STATUS) {
        const limit = parseFreeLimit(await res.json().catch(() => null));
        if (limit) {
          trackEvent("free_limit_hit", { kind: "portfolio", card_id: cardId });
          setCollLimit(limit);
          return setColl("idle");
        }
      }
      // Already at the per-row cap: nothing was added, so don't say it was.
      if (res.status === 409 && (await res.json().catch(() => null))?.full) return setColl("full");
      if (!res.ok) return setColl("error");
      setColl("added");
      trackEvent("collection_add", { card_id: cardId });
    } catch {
      setColl("error");
    }
  }

  return (
    <>
      <div className="mt-3 flex items-center gap-2">
        {coll === "signin" ? (
          <a href={`/login?next=${encodeURIComponent(cardPath)}&src=${encodeURIComponent(src)}`} className="btn-ghost flex-1 justify-center text-sm">
            Sign in to track your collection
          </a>
        ) : coll === "added" ? (
          <div className="flex flex-1 items-center justify-between rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-sm">
            <span className="font-semibold text-brand-300">✓ Added to your collection</span>
            <button onClick={addToCollection} className="text-xs text-slate-300 hover:text-white">Add another +1</button>
          </div>
        ) : (
          <button
            onClick={addToCollection}
            disabled={coll === "saving" || coll === "full"}
            aria-busy={coll === "saving"}
            className="btn-ghost flex-1 justify-center gap-1.5 text-sm"
          >
            {coll === "saving" && <Spinner size="sm" />}
            {coll === "saving" ? "Adding…" : coll === "error" ? "Try again" : coll === "full" ? `You already have ${QUANTITY_CAP}` : "＋ Add to collection"}
          </button>
        )}
      </div>
      {collLimit && <FreeLimitPanel kind="portfolio" count={collLimit.count} onClose={() => setCollLimit(null)} className="mt-2" />}
    </>
  );
}
