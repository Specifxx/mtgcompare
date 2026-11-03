// The quick view's own link (owner, 2026-11-03: "quickview popup should have a link change as well … instead of using the same
// link"). Opening a quick view pushes the PRODUCT PAGE's own URL onto the history, so the address bar shows the product's link while
// the pop-up is open: copied, bookmarked or reloaded, it is the real product page, the one canonical URL (no ?view= duplicates for
// search engines, no extra CDN copies). Back closes the pop-up and puts the list's URL back; Forward reopens it; closing it (×,
// Escape, the backdrop) steps back the same way, so the history never fills with pop-ups.
//
// The pushed entry copies Next's own history state (__NA and the router tree), so the app router passes the push through untouched:
// the page under the pop-up stays what it is, and Back restores it without a fetch. "See price history and details" then navigates
// to the URL already in the address bar, which Next turns into a replace: Back from the product page goes to the list.
//
// Identical in every site's repo (tests/quick-view-url.test.ts pins the behaviour).

const KEY = "__qv";

type State = Record<string, unknown> | null;

/** The quick view an entry's state holds, or null. */
export function quickViewEntry<T>(state: unknown): T | null {
  const s = state as State;
  return s && typeof s === "object" && s[KEY] ? (s[KEY] as T) : null;
}

/** The path a pop-up for `href` puts in the address bar, or null when it would not change it (another site, or this very page). */
export function quickViewPath(href: string, here: { href: string; origin: string; pathname: string; search: string }): string | null {
  let url: URL;
  try {
    url = new URL(href, here.href);
  } catch {
    return null;
  }
  if (url.origin !== here.origin) return null;
  const trim = (p: string) => p.replace(/\/+$/, "") || "/";
  if (trim(url.pathname) === trim(here.pathname) && url.search === here.search) return null;
  return url.pathname + url.search + url.hash;
}

/** Show the product's link while its quick view is open. `entry` (plain data) comes back from quickViewEntry on Forward. */
export function openQuickViewUrl<T>(href: string, entry: T): void {
  try {
    const path = quickViewPath(href, window.location);
    if (!path) return;
    const cur = window.history.state as State;
    const state = { ...(cur && typeof cur === "object" ? cur : {}), [KEY]: entry };
    // Already on a pop-up's entry (one opened from inside another): swap it rather than stack a second.
    if (quickViewEntry(cur)) window.history.replaceState(state, "", path);
    else window.history.pushState(state, "", path);
  } catch {
    /* the pop-up still opens; only the address bar stays as it was */
  }
}

/** The visitor closed the pop-up: step back to the list's own URL when the pop-up put its link in the address bar. */
export function closeQuickViewUrl(): void {
  try {
    if (quickViewEntry(window.history.state)) window.history.back();
  } catch {
    /* nothing to undo */
  }
}

/** Back and Forward: called with the quick view the new entry holds (null: none, close it). Returns the unsubscribe. */
export function onQuickViewHistory<T>(fn: (entry: T | null) => void): () => void {
  const handler = (e: PopStateEvent) => fn(quickViewEntry<T>(e.state));
  window.addEventListener("popstate", handler);
  return () => window.removeEventListener("popstate", handler);
}
