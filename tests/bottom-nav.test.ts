// The phone bottom nav (components/BottomNav.tsx, owner 2026-11-18). Rift's earlier bar was deleted on 2026-09-18 for riding up the screen
// (position arithmetic against the browser's address bar) and floating under pinch-zoom. These pin that THIS one does none of that.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bottomNavEnabled, bottomNavShows, navRegion, nextDir, NAV_DELTA, NAV_DELTA_UP, NAV_TOP, type BottomNavState } from "../src/components/BottomNav";

const ok: BottomNavState = { enabled: true, narrow: true, scrollY: 0, dir: "", zoomed: false, typing: false, modal: false, buybar: false, covers: false };

test("shows at the top, hides on scroll down, shows on scroll up", () => {
  assert.ok(bottomNavShows(ok));
  assert.ok(bottomNavShows({ ...ok, scrollY: NAV_TOP - 1, dir: "down" }), "the top of a page always shows it");
  assert.ok(!bottomNavShows({ ...ok, scrollY: 900, dir: "down" }));
  assert.ok(bottomNavShows({ ...ok, scrollY: 900, dir: "up" }));
  assert.ok(!bottomNavShows({ ...ok, scrollY: 900, dir: "" }), "deep in a page with no scroll yet (a restored position): hidden until the visitor scrolls up");
});

test("never shows zoomed, over the keyboard, over a dialog or the menu or the cart, on a buy-bar page, off a phone, or when off", () => {
  for (const k of ["zoomed", "typing", "modal", "buybar", "covers"] as const) assert.ok(!bottomNavShows({ ...ok, [k]: true }), k);
  assert.ok(!bottomNavShows({ ...ok, narrow: false }));
  assert.ok(!bottomNavShows({ ...ok, enabled: false }));
});

test("direction flips only after NAV_DELTA of real movement", () => {
  let s = nextDir("", 500, 500);
  assert.equal(s.dir, "");
  s = nextDir(s.dir, s.anchor, 500 + NAV_DELTA);
  assert.equal(s.dir, "", "exactly the delta is jitter");
  s = nextDir(s.dir, s.anchor, 500 + NAV_DELTA + 1);
  assert.equal(s.dir, "down");
  s = nextDir(s.dir, s.anchor, 700);
  assert.equal(s.dir, "down");
  s = nextDir(s.dir, s.anchor, 700 - NAV_DELTA_UP + 1);
  assert.equal(s.dir, "down", "a small bounce back does not flip it");
  s = nextDir(s.dir, s.anchor, 700 - NAV_DELTA_UP - 1);
  assert.equal(s.dir, "up", "the first real upward flick shows the bar");
  s = nextDir(s.dir, s.anchor, 300);
  assert.equal(s.dir, "up");
});

test("the opt-in: off ignores everything, ?bn=1 keeps it, ?bn=0 clears it, optin needs the keep", () => {
  assert.deepEqual(bottomNavEnabled("off", "?bn=1", "1"), { enabled: false, store: null });
  assert.deepEqual(bottomNavEnabled("optin", "", null), { enabled: false, store: null });
  assert.deepEqual(bottomNavEnabled("optin", "?bn=1", null), { enabled: true, store: "1" });
  assert.deepEqual(bottomNavEnabled("optin", "", "1"), { enabled: true, store: null });
  assert.deepEqual(bottomNavEnabled("optin", "?bn=0", "1"), { enabled: false, store: "0" });
  assert.deepEqual(bottomNavEnabled("on", "", null), { enabled: true, store: null });
  assert.deepEqual(bottomNavEnabled("on", "", "0"), { enabled: false, store: null });
});

test("no position arithmetic: no lvh/dvh/svh, no visualViewport height or offset, bottom never animated", () => {
  const src = readFileSync(new URL("../src/components/BottomNav.tsx", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  assert.ok(!/\b\d*(lvh|dvh|svh)\b/.test(src), "the deleted bar's first attempt");
  assert.ok(!/visualViewport(\?)?\.(height|offsetTop|pageTop)/.test(src), "the deleted bar's third attempt");
  assert.ok(!/style\.(bottom|transform)/.test(src), "placement is CSS only");
  const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
  const bn = css.slice(css.indexOf(".bn {"), css.indexOf(".bn-row"));
  assert.ok(/position: fixed; left: 0; right: 0; bottom: 0/.test(bn));
  assert.ok(!/backdrop|blur/.test(bn), "a blur on a fixed bar repaints every scroll frame on a phone");
  assert.ok(/transition: transform/.test(bn) && !/transition:[^;]*\bbottom\b/.test(bn), "moves on transform only");
});

test("the scroll path does no layout reads and no React state", () => {
  const src = readFileSync(new URL("../src/components/BottomNav.tsx", import.meta.url), "utf8").replace(/\/\/.*$/gm, "");
  assert.ok(!/getBoundingClientRect|offsetHeight|offsetTop|getComputedStyle/.test(src), "layout reads force a reflow mid-scroll");
  assert.ok(!/setShown/.test(src), "show/hide is an attribute write, not a re-render");
  assert.ok(/addEventListener\("scroll", decide, \{ passive: true \}\)/.test(src));
});

test("the layout mounts it only through BOTTOM_NAV, outside the quick view, and the server HTML never carries it", () => {
  const layout = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
  assert.ok(/BOTTOM_NAV !== "off" && <BottomNav/.test(layout));
  const qv = readFileSync(new URL("../src/components/QuickView.tsx", import.meta.url), "utf8");
  assert.ok(!/BottomNav/.test(qv), "the quick view (A/B test) never draws it");
  const src = readFileSync(new URL("../src/components/BottomNav.tsx", import.meta.url), "utf8");
  assert.ok(/if \(!enabled\) return null;/.test(src), "renders nothing until the browser has read the opt-in");
});

test("the tabs link into the page's region, else the visitor's pick, else the US", () => {
  assert.deepEqual(navRegion("/au/sets/fdn", null), { region: "au", regionPage: true });
  assert.deepEqual(navRegion("/about", "uk"), { region: "uk", regionPage: false });
  assert.deepEqual(navRegion("/", "zz"), { region: "us", regionPage: false });
});

test("the ad dock yields while the bar shows, and only a SHOWN buy bar hides the bar", () => {
  const dock = readFileSync(new URL("../src/components/AdDock.tsx", import.meta.url), "utf8");
  assert.ok(/\[data-bottomnav\]/.test(dock));
  const src = readFileSync(new URL("../src/components/BottomNav.tsx", import.meta.url), "utf8");
  assert.ok(/\[data-buybar='shown'\]/.test(src));
});
