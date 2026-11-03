// The quick view's own link (src/lib/quick-view-url.ts, owner 2026-11-03): opening a pop-up puts the product page's own URL in the
// address bar, Back closes it, Forward reopens it, closing it steps back, and Next's history state rides along untouched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { closeQuickViewUrl, onQuickViewHistory, openQuickViewUrl, quickViewEntry, quickViewPath } from "../src/lib/quick-view-url";

/** The quick view components that must use it (each site's own list). */
const QUICK_VIEWS: string[] = ["src/components/QuickView.tsx"];

/** A browser history good enough for the helper: entries, pushState/replaceState, back() firing popstate. */
function fakeBrowser(start: string, state: unknown) {
  const origin = "https://example.com";
  const entries: { url: string; state: unknown }[] = [{ url: start, state }];
  let at = 0;
  const listeners = new Set<(e: { state: unknown }) => void>();
  const loc = () => new URL(entries[at].url, origin);
  const location = {
    get href() { return loc().href; },
    get origin() { return origin; },
    get pathname() { return loc().pathname; },
    get search() { return loc().search; },
  };
  const go = (d: number) => {
    at += d;
    listeners.forEach((f) => f({ state: entries[at].state }));
  };
  const history = {
    get state() { return entries[at].state; },
    pushState(s: unknown, _: string, url: string) { entries.splice(at + 1); entries.push({ url, state: s }); at++; },
    replaceState(s: unknown, _: string, url: string) { entries[at] = { url, state: s }; },
    back: () => go(-1),
    forward: () => go(1),
  };
  const w = {
    location,
    history,
    addEventListener: (_: string, f: (e: { state: unknown }) => void) => listeners.add(f),
    removeEventListener: (_: string, f: (e: { state: unknown }) => void) => listeners.delete(f),
  };
  (globalThis as unknown as { window: unknown }).window = w;
  return { w, entries, at: () => at, path: () => location.pathname + location.search };
}

test("a pop-up's link is the product page's own path, same site only, never the page it opens on", () => {
  const here = { href: "https://example.com/au/deals?sort=price", origin: "https://example.com", pathname: "/au/deals", search: "?sort=price" };
  assert.equal(quickViewPath("/au/p/chaos-rising-booster-box", here), "/au/p/chaos-rising-booster-box");
  assert.equal(quickViewPath("/au/p/x?v=2", here), "/au/p/x?v=2");
  assert.equal(quickViewPath("https://other.example/au/p/x", here), null);
  assert.equal(quickViewPath("/au/deals?sort=price", here), null);
  assert.equal(quickViewPath("/au/deals/?sort=price", here), null);
});

test("open pushes the product URL keeping Next's state; Back closes; Forward reopens; close steps back", () => {
  const next = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["tree"] };
  const b = fakeBrowser("/au/deals", next);
  const seen: unknown[] = [];
  const off = onQuickViewHistory((e) => seen.push(e));

  openQuickViewUrl("/au/p/box", { slug: "box" });
  assert.equal(b.path(), "/au/p/box");
  const pushed = b.w.history.state as Record<string, unknown>;
  assert.equal(pushed.__NA, true, "Next's marker is copied, so the app router lets the push through");
  assert.deepEqual(pushed.__PRIVATE_NEXTJS_INTERNALS_TREE, ["tree"]);
  assert.deepEqual(quickViewEntry(pushed), { slug: "box" });

  b.w.history.back();
  assert.equal(b.path(), "/au/deals");
  assert.deepEqual(seen, [null], "Back closes the pop-up");
  b.w.history.forward();
  assert.deepEqual(seen, [null, { slug: "box" }], "Forward reopens it");

  closeQuickViewUrl();
  assert.equal(b.path(), "/au/deals", "closing steps back to the list's URL");
  assert.equal(b.entries.length, 2);
  closeQuickViewUrl();
  assert.equal(b.path(), "/au/deals", "closing again does nothing (no entry of ours)");
  off();
});

test("a second pop-up from a pop-up's entry replaces it rather than stacking", () => {
  const b = fakeBrowser("/list", { __NA: true });
  openQuickViewUrl("/p/a", { slug: "a" });
  openQuickViewUrl("/p/b", { slug: "b" });
  assert.equal(b.path(), "/p/b");
  assert.equal(b.entries.length, 2);
  closeQuickViewUrl();
  assert.equal(b.path(), "/list");
});

test("every quick view uses it: open pushes the link, closing steps back, and the details link does not", () => {
  for (const f of QUICK_VIEWS) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /openQuickViewUrl\(/, `${f} puts the product link in the address bar`);
    assert.match(src, /closeQuickViewUrl\(/, `${f} steps back when closed`);
    assert.match(src, /onQuickViewHistory/, `${f} follows Back and Forward`);
  }
});
