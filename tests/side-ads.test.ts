// The in-page ad block (components/InlineAds.tsx, owner 2026-11-13, in place of the side rails) and the phone dock (components/SideAds.tsx).
// Pinned: browser only (nothing in the server HTML but an empty box of the block's height), eBay and TCGplayer only (never Amazon), labelled
// Ad, rel sponsored, its own placements, one block a page, nothing fixed or floating, the rails gone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { PLACEMENTS } from "../src/lib/affiliate";
import { MAX_TILES, MIN_WIDTH, mergeListings } from "../src/components/SideAds";
import { INLINE_H, INLINE_MAX, inlineOrder, layoutInlineAdsAllowed } from "../src/components/InlineAds";
import { DOCK_ARM, dockShows, interleave, type DockState } from "../src/components/AdDock";

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

test("the in-page block: eBay and TCGplayer tiles taking turns, eBay first, six at most, drawn in the browser, labelled Ad, no Amazon", () => {
  assert.equal(INLINE_MAX, 6);
  assert.deepEqual(inlineOrder(["e1", "e2", "e3", "e4"], ["t1", "t2", "t3", "t4"]), ["e1", "t1", "e2", "t2", "e3", "t3"]);
  assert.deepEqual(inlineOrder(["e1"], ["t1", "t2", "t3", "t4", "t5"]), ["e1", "t1", "t2", "t3", "t4", "t5"], "a short side hands its turns over");
  assert.deepEqual(inlineOrder([], ["t1", "t2"]), ["t1", "t2"]);
  for (const p of ["listings-inline", "tcgplayer-strip-inline"]) assert.ok((PLACEMENTS as readonly string[]).includes(p), `${p} is a placement`);
  const s = src("components/InlineAds.tsx");
  assert.match(s, /^"use client";/);
  assert.match(s, /const \[mounted, setMounted\] = useState\(false\);/, "drawn after hydration: no tiles in the server HTML");
  assert.match(s, /style=\{\{ minHeight: INLINE_H \}\}/, "the box keeps its height in every state (CLS 0)");
  assert.ok(INLINE_H >= 300);
  assert.match(s, /<span className="ad-pill">Ad<\/span>/, "labelled Ad");
  assert.match(s, /rel=\{REL_SPONSORED\}/, "sponsored links");
  assert.match(s, /className="scroller/, "scrolls sideways when narrow");
  // A sideways scroller is the containing block of its tiles' hidden labels (globals.css). Without it each tile's sr-only label
  // counted toward the page's width: 962px on a 390px phone once this block loaded (measured 2026-11-13), so the page slid sideways.
  assert.match(src("app/globals.css"), /:where\(\.scroller, \.overflow-x-auto, \.overflow-x-scroll\) \{\s*position: relative;/, "a scroller holds its own hidden labels");
  assert.match(s, /EbayMark/, "each eBay tile carries its logo word");
  assert.match(s, /aria-label="TCGplayer"/, "each TCGplayer tile carries its logo word");
  assert.doesNotMatch(s, /amazon/i, "never Amazon on a TCG site");
  assert.doesNotMatch(s, /\bfixed\b|\bsticky\b/, "nothing fixed or floating");
});

test("the block is placed once a page: the layout's copy skips the pages that place it themselves; the side rails and pre-footer strips are gone", () => {
  for (const p of ["/us", "/us/", "/au/p/some-product", "/uk/sets/pitch-black"]) assert.ok(!layoutInlineAdsAllowed(p), `${p} places its own`);
  for (const p of ["/us/deals", "/us/sealed", "/au/type/secret-lair", "/us/sets", "/uk/stores/foo"]) assert.ok(layoutInlineAdsAllowed(p), `${p} gets the layout's block`);
  const layout = src("app/[region]/layout.tsx");
  assert.equal(layout.match(/<LayoutInlineAds /g)?.length, 1);
  assert.doesNotMatch(layout, /PreFooterStrip|PreFooterTcgplayer/);
  for (const f of ["app/[region]/page.tsx", "app/[region]/p/[slug]/page.tsx", "app/[region]/sets/[set]/page.tsx"]) {
    const t = src(f);
    assert.equal(t.match(/<InlineAds /g)?.length, 1, `${f}: one block`);
    assert.doesNotMatch(t, /<TcgplayerStrip/, `${f}: the old strip is replaced`);
  }
  assert.ok(!existsSync(new URL("../src/components/TcgplayerStrip.tsx", import.meta.url)) && !existsSync(new URL("../src/components/PreFooterTcgplayer.tsx", import.meta.url)));
  assert.doesNotMatch(src("components/SideAds.tsx"), /fixed z-30|SIDE_RAILS|EbayRail|TcgRail|listings-side|tcgplayer-strip-side/, "no rail code");
  assert.ok(!(PLACEMENTS as readonly string[]).includes("listings-side") && !(PLACEMENTS as readonly string[]).includes("tcgplayer-strip-side"));
  // The page is ONE centred column since 2026-11-13 (the minimal look: no sidebar, so no shell around the sidebar and the page).
  assert.match(src("app/globals.css"), /\.page \{\s*@apply mx-auto w-full max-w-page px-4 sm:px-6;/, "the page column is centred");
  assert.match(readFileSync(new URL("../tailwind.config.ts", import.meta.url), "utf8"), /maxWidth: \{ page: "1200px" \}/, "and 1200px wide");
  assert.doesNotMatch(src("app/globals.css") + src("app/[region]/layout.tsx") + src("app/(site)/layout.tsx") + src("components/Header.tsx"), /max-w-shell/, "no shell width left");
});

test("the dock's tiles: up to ten, popular sealed first, no listing twice", () => {
  assert.equal(MIN_WIDTH, 1280);
  assert.equal(MAX_TILES, 10);
  const item = (id: string) => ({ id }) as never;
  const ready = (ids: string[]) => ({ status: "ready", a: { items: ids.map(item) } }) as never;
  const merged = mergeListings([ready(["a", "b", "c", "d", "e", "f", "g", "h"]), ready(["c", "i", "j", "k", "l"]), { status: "none" } as never]);
  assert.deepEqual(merged.map((i: { id: string }) => i.id), ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]);
});

test("the home page keeps the phone dock, in the visitor's region, read per request (never at build)", () => {
  const home = src("app/(site)/page.tsx");
  assert.match(home, /^export const dynamic = "force-dynamic"/m);
  assert.match(home, /<SoftSideAds tiles=\{railTiles\} \/>/);
  assert.match(src("components/SideAds.tsx"), /export function SoftSideAds[\s\S]*?useSoftRegion\(\)/);
});

test("the phone dock: narrow screens only, never on the first screen, never beside another unit, the buy bar or a dialog", () => {
  const ok: DockState = { narrow: true, scrolled: 1000, screen: 800, blockers: 0, buybar: false, modal: false, typing: false, dismissed: false };
  assert.ok(dockShows(ok));
  assert.ok(!dockShows({ ...ok, narrow: false }), "wide screens have the in-page block");
  assert.ok(!dockShows({ ...ok, scrolled: 800 * DOCK_ARM - 1 }), "not on the first screen");
  assert.ok(!dockShows({ ...ok, blockers: 1 }), "another unit or the footer in view");
  assert.ok(!dockShows({ ...ok, buybar: true }), "never on a page with the buy bar");
  assert.ok(!dockShows({ ...ok, modal: true }), "never over a dialog or the menu");
  assert.ok(!dockShows({ ...ok, typing: true }), "never over the keyboard");
  assert.ok(!dockShows({ ...ok, dismissed: true }));
  assert.deepEqual(interleave([{ items: ["e1", "e2", "e3"] }, { items: ["t1"] }]), ["e1", "t1", "e2", "e3"], "the sides take turns");
  const d = src("components/AdDock.tsx");
  assert.match(d, /^"use client";/);
  assert.match(d, /return armed \? <>\{children\}<\/> : null;/, "nothing rendered or fetched before the visitor scrolls");
  assert.match(d, /translate-y-full/, "slides on transform only (CLS 0)");
  assert.match(d, /querySelectorAll\(`footer, \[data-dock-yield\], \[data-rate-card\], \$\{yieldTo\}`\)/, "hides beside every other unit, the rating card and the footer");
  assert.match(d, /yieldTo = "\[data-ad\]"/, "every [data-ad] unit by default");
  assert.match(d, /sessionStorage\.setItem\(DISMISS_KEY, "1"\)/, "✕ hides it for the visit");
  assert.match(d, />Ad<\/span>/, "labelled Ad");
  const s = src("components/SideAds.tsx");
  for (const p of ["listings-dock", "tcgplayer-strip-dock"]) assert.ok((PLACEMENTS as readonly string[]).includes(p), `${p} is a placement`);
  assert.match(s, /placement="?\{?placement\}?[\s\S]*minWidth=\{MIN_WIDTH\}/);
  assert.doesNotMatch(d + s, /amazon/i, "no Amazon in the dock");
});
