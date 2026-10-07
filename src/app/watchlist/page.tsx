import { redirect } from "next/navigation";

// /watchlist was OP Compare's browser-only list. Since wave 2 (2026-10-03) the
// watchlist is RiftCompare's /watching (account-backed, with target prices);
// this path stays as a NON-permanent redirect (a 307, never a cached 308), so
// old links and bookmarks still land on the list. Signed-out visitors are sent
// on to sign in by /watching itself; their browser list is in the header drawer.
export const dynamic = "force-dynamic";

export default function WatchlistRedirect() {
  redirect("/watching");
}
