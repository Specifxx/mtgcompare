import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NAV_GROUPS } from "../src/components/nav-groups";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const readCode = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const MENU = "src/components/CinematicNavMenu.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// "Get rid of any duplicate information... we don't even need the see all
// features anymore when you look at the menu... they can just scroll down and
// look at all the features." The phone Explore overlay used to lead with a
// curated "Popular" subset (flat, no category headers) and hide the full
// NAV_GROUPS grid behind a "Show all features →" button. Popular was always a
// filter() over the SAME links shown again in the grid below it — every
// visitor who tapped through saw each popular link twice. Both the subset and
// the gate are gone: the full category grid now renders unconditionally, one
// copy of every link, reachable by scrolling.
// ─────────────────────────────────────────────────────────────────────────────

test("the overlay has no curated Popular subset or a button gating the rest", () => {
  const code = readCode(MENU);
  assert.doesNotMatch(code, /Show all features/, "the gate reported as \"kind of useless\" must be gone");
  assert.doesNotMatch(code, /showAll/i, "no state should exist to gate the full grid any more");
  assert.doesNotMatch(code, /POPULAR_LINKS/, "no separate curated subset rendered alongside the full grid");
  assert.doesNotMatch(code, />\s*Popular\s*</, "no 'Popular' section heading left behind");
});

test("the full category grid renders unconditionally (not just while filtering)", () => {
  const code = readCode(MENU);
  // Before, the grid only rendered when `filtering || showAll`; it must now
  // render regardless of `filtering`.
  assert.match(code, /sections\.map\(\(sec, si\)/, "the category grid map must still exist");
  assert.doesNotMatch(code, /!filtering && !showAll/, "no leftover gate condition");
});

test("POPULAR_LINKS and the `popular` flag are gone from nav-groups.ts, not just unused", () => {
  const code = readCode("src/components/nav-groups.ts");
  assert.doesNotMatch(code, /POPULAR_LINKS/, "dead export must be removed, not left for no consumer");
  assert.doesNotMatch(code, /popular\?:\s*boolean/, "dead field on NavGroupLink must be removed");
  assert.doesNotMatch(code, /popular:\s*true/, "no more per-link flags with nothing left to read them");
});

test("nothing was actually deleted from the nav — every link is still in NAV_GROUPS", () => {
  // The complaint was about a redundant SUBSET and a useless GATE, not about
  // any destination going away.
  for (const href of ["/deck", "/premium", "/tools/deal-finder", "/watching", "/browse", "/blog"]) {
    assert.ok(
      NAV_GROUPS.flatMap((g) => g.links).some((l) => l.href === href),
      `${href} must still be reachable from the overlay's full grid`
    );
  }
});

test("the phone menu lists the privacy policy and terms, beside About in Help", () => {
  // 2026-09-26, "Blog and tools, joined up" in DECISIONS.md: both policies used
  // to be footer-row links only, so the phone menu (and the rail, ⌘K and
  // llms.txt, which read the same NAV_GROUPS) never listed them.
  const help = NAV_GROUPS.find((g) => g.title === "Help")?.links ?? [];
  const hrefs = help.map((l) => l.href);
  const about = hrefs.indexOf("/about");
  assert.ok(about >= 0, "Help must still carry About");
  assert.deepEqual(hrefs.slice(about, about + 3), ["/about", "/privacy", "/terms"], "Privacy policy and Terms of service sit right after About");
  for (const href of ["/privacy", "/terms"]) {
    const link = help.find((l) => l.href === href)!;
    // The footer's always-visible row already links both on every page, so
    // the site map must not print them a second time.
    assert.equal(link.hideInFooter, true, `${href} is hideInFooter`);
  }
});
