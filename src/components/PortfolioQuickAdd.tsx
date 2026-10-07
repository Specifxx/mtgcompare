"use client";

import { useRouter } from "next/navigation";
import { CollectionSearch } from "./MyCollection";

// The portfolio page's zero-state action — reuses MyCollection's own
// search-and-add widget (same endpoint, same result rows) rather than a
// second implementation, and refreshes the server-rendered page afterward
// so the headline value and every holdings-gated section pick up the new
// card immediately instead of waiting for a client refetch that doesn't exist.
export function PortfolioQuickAdd() {
  const router = useRouter();
  return <CollectionSearch onAdded={() => router.refresh()} />;
}
