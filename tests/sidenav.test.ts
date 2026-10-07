import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NAV_GROUPS } from "../src/components/nav-groups";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ─────────────────────────────────────────────────────────────────────────────
// THE DESKTOP RAIL. Visible the instant a visitor lands on any page, rendering
// the same NAV_GROUPS index the ⌘K launcher searches, the footer site-map
// prints and /llms.txt publishes.
//
// IT IS A NAVIGATION SYSTEM AND NOTHING ELSE (2026-09-21). Two shapes were
// tried and rejected in one day, and the tests below pin what replaced them:
//
//   • A flat list of eight "primary destinations" above the grouped index.
//     Every one was also a link inside a group below it, so the rail showed
//     the same page twice and a section header read like a destination:
//     "when I click prices, it should just expand to all of the different
//     features — I'm not going to a single page when I click prices."
//   • A two-mode rail (4rem icon strip with hover flyouts / 17rem list),
//     chosen before first paint from a cookie and flipped with a chevron or
//     `[`. Removed outright rather than re-defaulted — "the collapsible
//     option is actually, there's no point" — taking the cookie, the boot
//     script, the flyout positioning and the mode CSS with it.
//
// What remains: one width, always open, group headers are disclosures, the
// leaves are the links.
// ─────────────────────────────────────────────────────────────────────────────

test("--sidenav-w is 0 below lg and 17rem from 1024px, with no second mode", () => {
  const css = codeOnly(read("src/app/globals.css"));
  assert.match(css, /--sidenav-w:\s*0px/, "0 by default, so every consumer is a no-op below the breakpoint");
  const lg = /@media \(min-width: 1024px\) \{\s*:root \{\s*--sidenav-w:\s*17rem;/.exec(css);
  assert.ok(lg, "expected a single 1024px rule setting the full width");
  // The mode machinery must stay gone: no attribute, no display toggles.
  assert.doesNotMatch(css, /data-sidenav/, "the rail has no modes to switch between");
  assert.doesNotMatch(css, /\.sidenav-(expanded|collapsed|row|boxed)/, "the mode-switching classes went with it");
  // SideNav's own breakpoint and the media query must always agree.
  const rail = read("src/components/SideNav.tsx");
  assert.match(rail, /hidden h-screen w-\[var\(--sidenav-w\)\] flex-col[^"]*lg:flex/, "the component must render at exactly the same breakpoint");
});

test("nothing is left of the collapsed mode: no cookie, no boot script, no flyouts", () => {
  const rail = codeOnly(read("src/components/SideNav.tsx"));
  for (const gone of ["SIDENAV_COOKIE", "data-sidenav", "RailGroup", "getBoundingClientRect", "railMode", "toggleRail"]) {
    assert.ok(!rail.includes(gone), `${gone} belongs to the removed two-mode rail`);
  }
  const layout = read("src/app/layout.tsx");
  assert.doesNotMatch(layout, /SIDENAV_BOOT_SCRIPT|sidenav-shared/, "the pre-paint boot script is gone");
  // The theme boot script is a different thing and must NOT have gone with it.
  assert.match(layout, /THEME_BOOT_SCRIPT/, "the theme script is unrelated and stays");
  assert.match(layout, /suppressHydrationWarning/, "…and still needs the hydration-warning suppression");
});

test("a group header is a disclosure, never a link — that was the whole complaint", () => {
  const rail = codeOnly(read("src/components/SideNav.tsx"));
  const header = /onClick=\{\(\) => toggleGroup\(group\.title\)\}[\s\S]*?<\/button>/.exec(rail)?.[0] ?? "";
  assert.ok(header, "expected the group header button");
  assert.doesNotMatch(header, /<Link/, "a group header must not navigate anywhere");
  assert.match(header, /aria-expanded=\{open\}/, "it is a disclosure, and must say so");
  // And no flat duplicate list above the groups.
  assert.ok(!rail.includes("PRIMARY_NAV"), "the duplicated primary list is gone");
});

test("SideNav renders the same NAV_GROUPS index the ⌘K launcher searches, hidden below lg", () => {
  const src = read("src/components/SideNav.tsx");
  assert.match(src, /"use client"/);
  assert.match(src, /import \{ NAV_GROUPS \} from "\.\/nav-groups"/);
  assert.match(src, /NAV_GROUPS\.map/);
  // Tailwind's lg breakpoint (1024px) — the width at which --sidenav-w first
  // becomes non-zero in globals.css. The two must agree, or the panel either
  // overlaps un-padded content or leaves a gap.
  assert.match(src, /aria-label="Site navigation"\s*\n\s*className="fixed left-0 [^"]*hidden [^"]*lg:flex/);
  // One mode now — the full list. See the globals.css test above.
  // Fixed, not a layout participant — see the file's own doc comment for why
  // (CinematicHero's full-bleed breakout depends on <main> staying centred on
  // the true viewport; a flex/grid sidebar would break that).
  assert.match(src, /fixed left-0/);
  assert.match(src, /w-\[var\(--sidenav-w\)\]/);
});

test("SideNav branches on external links, same contract every other NAV_GROUPS renderer follows", () => {
  const src = read("src/components/SideNav.tsx");
  assert.match(src, /link\.external \?/);
  assert.match(src, /target="_blank"/);
  assert.match(src, /rel="noopener noreferrer"/);
});

test("SideNav highlights the active route without matching every page via a bare '/' prefix", () => {
  const src = read("src/components/SideNav.tsx");
  assert.match(src, /link\.href !== "\/"/, "must special-case the homepage href — startsWith(\"/\") would match everything");
});

test("nav-groups.ts lists SideNav as a required branch-on-external renderer", () => {
  const src = read("src/components/nav-groups.ts");
  assert.match(src, /FooterNav, *\n?\s*\* CinematicNavMenu, CommandLauncher, SideNav\)/s);
});

test("layout.tsx mounts SideNav and reserves its width for main, the footer ad zone, and the footer", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /import \{ SideNav \} from "@\/components\/SideNav"/);
  assert.match(layout, /<Navbar \/>\s*\n\s*<SideNav \/>/, "SideNav must mount right after Navbar");

  // Every pl-[var(--sidenav-w)] must live on its OWN element, never combined
  // with a px-* utility on the same tag — Tailwind resolves two padding-left
  // declarations of equal specificity by GENERATED CSS order, not by
  // className string order, so combining them is order-dependent and fragile.
  //
  // container-app counts too (2026-09-23). Its px-4/sm:px-6 lives in
  // @layer components, so a pl-[…] utility on the same element ALWAYS wins
  // and silently deletes the gutter. The footer shipped exactly that
  // (`container-app pl-[var(--sidenav-w)]`): 0 padding below 1024 with
  // controls touching x=0 at 390, and the rail's 17rem with no gutter from
  // 1024. The old /\bpx-/ check could not see it because no literal px-
  // was on the line.
  // OP Compare's <footer> lives in components/Footer.tsx, so its reservation
  // is counted there.
  const footer = read("src/components/Footer.tsx");
  const plMatches = [...layout.matchAll(/^.*pl-\[var\(--sidenav-w\)\].*$/gm), ...footer.matchAll(/^.*pl-\[var\(--sidenav-w\)\].*$/gm)];
  assert.ok(plMatches.length >= 3, "expected at least 3 reservations (main wrapper, ad zone, footer)");
  for (const [line] of plMatches) {
    assert.doesNotMatch(line, /\bpx-|container-app/, `pl-[var(--sidenav-w)] must not share a line/element with a px-* utility or with container-app, whose px-* it silently overrides: ${line}`);
  }
  assert.match(footer, /<footer className="[^"]*\bpl-\[var\(--sidenav-w\)\]/, "the footer reserves the rail on the <footer> itself, outside container-app");
});

test("FooterAds reserves the same width — SideNav is fixed and spans the full page height", () => {
  const layout = read("src/app/layout.tsx");
  const idx = layout.indexOf("<FooterAds");
  const before = layout.slice(Math.max(0, idx - 200), idx);
  assert.match(before, /pl-\[var\(--sidenav-w\)\]/, "the wrapper immediately around <FooterAds /> must reserve SideNav's width");
});

test("CinematicHero's full-bleed breakout compensates for --sidenav-w, not a bare -translate-x-1/2", () => {
  const src = read("src/components/home/CinematicHero.tsx");
  const classLine = /<ParallaxRoot\s+id="op-hero"\s+className="([^"]*)"/.exec(src)?.[1] ?? "";
  assert.ok(classLine, "expected to find ParallaxRoot's className");
  // Scoped to the actual className (not the whole file — the doc comment right
  // above it explains the fix by NAMING the old, now-removed pattern, which
  // would otherwise make this assertion fail against its own documentation).
  assert.doesNotMatch(classLine, /-translate-x-1\/2/, "the old, sidebar-unaware breakout must be gone");
  assert.match(classLine, /translate-x-\[calc\(-50%-var\(--sidenav-w\)\/2\)\]/);
  // The foreground content column (H1/search/trending chips) needs its OWN
  // reservation — it re-centres on the full viewport via container-app's
  // mx-auto same as the breakout background, so without this it would render
  // partly behind the fixed panel, not just visually below it.
  const foregroundIdx = src.indexOf("Foreground content");
  const nearby = src.slice(foregroundIdx, foregroundIdx + 2000);
  assert.match(nearby, /pl-\[var\(--sidenav-w\)\]/);
  // REGRESSION PIN: shipped once WITHOUT `w-full` on this exact wrapper and
  // the hero rendered visibly off-center on any screen wide enough for
  // container-app to hit its own 1400px cap (confirmed with pixel
  // measurements: search box centered ~300px left of the correct
  // S/2 + viewportWidth/2). ROOT CAUSE: ParallaxRoot (this wrapper's parent)
  // is `flex items-center`, and the decorative background layer is
  // `position: absolute` (out of flow) — so this wrapper is the row's ONLY
  // normal-flow flex item. A flex item with no explicit width sizes to its
  // OWN CONTENT (shrink-to-fit) and sits at the row's flex-start, not the
  // full row width `container-app`'s own `mx-auto` needs to center within.
  assert.match(nearby, /className="w-full pl-\[var\(--sidenav-w\)\]"/);
});

// ─────────────────────────────────────────────────────────────────────────────
// TEXT-ONLY + COLLAPSIBLE (2026-09-10) — reported directly: the per-link
// emoji made the one nav surface that's on screen permanently read as
// AI-generated decoration, and rendering all ~9 groups flat and always-open
// meant scrolling past Games and Guides to reach Your Collection on every
// page. SideNav was the FIRST NAV_GROUPS renderer to drop the emoji and the
// one that lets a visitor collapse a group and has it stay collapsed.
//
// 2026-09-16: the emoji left every renderer. `emoji` came off NavGroupLink
// itself (nav-groups.ts) in the P1 icon pass, so the ⌘K launcher and the
// phone Explore overlay — which used to be the deliberate exception, shown
// only for the moment they're open rather than sitting on screen — now carry
// the same drawn-icon language SideNav pioneered (a NavIcon per section
// header instead of a per-link glyph). FooterNav was already text-only
// before any of this and stays out of the assertion below either way.
// ─────────────────────────────────────────────────────────────────────────────

test("no NAV_GROUPS renderer reads link.emoji any more — the field itself is gone", () => {
  for (const renderer of ["SideNav.tsx", "CommandLauncher.tsx", "CinematicNavMenu.tsx"]) {
    const src = read(`src/components/${renderer}`);
    assert.doesNotMatch(src, /link\.emoji|l\.emoji/, `${renderer} must not read a per-link emoji — text only, by design`);
  }
  // The field itself must be gone from the data, not just unread.
  assert.doesNotMatch(read("src/components/nav-groups.ts"), /emoji:\s*string|emoji:\s*"/, "NavGroupLink must not carry an emoji field any more");
});

test("SideNav's groups are collapsible and remember a visitor's choice", () => {
  const src = read("src/components/SideNav.tsx");
  assert.match(src, /"use client"/);
  // A real disclosure control per group, not a static heading.
  assert.match(src, /aria-expanded=\{open\}/);
  assert.match(src, /onClick=\{\(\) => toggleGroup\(group\.title\)\}/);
  // Persisted, so a collapsed group stays collapsed across a reload — and
  // ONLY deviations are stored, so a group added to NAV_GROUPS tomorrow
  // starts open for every existing visitor rather than defaulting to
  // whatever an empty/missing key would imply.
  assert.match(src, /localStorage\.(get|set)Item\(STORAGE_KEY/);
  assert.match(src, /localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(\[\.\.\.next\]\)\)/);
});

test("SideNav forces the active page's group open even if it was previously collapsed", () => {
  const src = read("src/components/SideNav.tsx");
  // Computed from the SAME isActiveLink check used to highlight the link, so
  // the two can't drift (one flagging a page active while the other leaves
  // its group collapsed would hide the very page a visitor is on).
  assert.match(src, /activeGroupTitle/);
  assert.match(src, /g\.links\.some\(\(l\) => isActiveLink\(pathname, l\)\)/);
  assert.match(src, /if \(!hydrated \|\| !activeGroupTitle \|\| !collapsed\.has\(activeGroupTitle\)\) return;/);
});

test("Prices and Guides & News are open on a first visit, and the default is identical on the server and the client", () => {
  // 2026-09-21, owner: "lets have the default on the left prices is expanded
  // whilst everything else is rolled up." Every group used to start open,
  // which made the rail ~60 links long and mostly a scrollbar. 2026-09-28,
  // owner: the blog and guides must be prominent for AdSense's crawlers, and a
  // collapsed group renders no links, so Guides & News opens too.
  const code = codeOnly(read("src/components/SideNav.tsx"));
  assert.match(code, /const DEFAULT_OPEN_GROUPS: readonly string\[\] = \["Prices", "Guides & News"\];/, "the open groups are named, not indexes");
  for (const t of ["Prices", "Guides & News"]) {
    assert.ok(NAV_GROUPS.some((g) => g.title === t), `"${t}" must name a real group — a typo would roll it up`);
  }
  const guides = NAV_GROUPS.find((g) => g.title === "Guides & News")!;
  assert.deepEqual(guides.links.slice(0, 2).map((l) => l.href), ["/guides", "/blog"], "its first two links are the guides and the blog");
  assert.equal(NAV_GROUPS[1].title, "Guides & News", "second in the rail, right under Prices");
  // Derived from NAV_GROUPS rather than written out, so it cannot drift when a
  // group is added.
  assert.match(code, /NAV_GROUPS\.map\(\(g\) => g\.title\)\.filter\(\(t\) => !DEFAULT_OPEN_GROUPS\.includes\(t\)\)/);
  // A collapsed group renders no links, which is why the default matters to a crawler.
  assert.match(code, /\{open && \(/);
  // And it must be the INITIAL React state, not applied in an effect:
  // localStorage is unreadable on the server, so anything else would make the
  // client's first render disagree and React would log a hydration mismatch.
  assert.match(code, /useState<Set<string>>\(\(\) => new Set\(DEFAULT_COLLAPSED\)\)/);
});

test("the rail owns the brand, the search and the whole index; the header owns the session", () => {
  const rail = codeOnly(read("src/components/SideNav.tsx"));
  const nav = codeOnly(read("src/components/Navbar.tsx"));

  // Rail-only.
  assert.match(rail, /aria-label="OP Compare home"/, "the rail carries the brand");
  assert.match(nav, /className="tap-link min-w-11 shrink-0 gap-2 lg:hidden"/, "…and the header hides its copy from lg");
  // TWO SEARCHES, ONE EACH, and the split is the point (2026-09-21): the rail
  // searches FEATURES ("where is the thing that does X"), the header searches
  // CARDS. Each says which it is in its own placeholder, so neither can be
  // mistaken for the other — which is exactly what went wrong when the rail's
  // box opened the navigation launcher while being labelled just "Search".
  assert.match(rail, /placeholder="Search features"/, "the rail searches features");
  assert.match(rail, /searchNav\(/, "…over the same index the ⌘K launcher uses");
  assert.doesNotMatch(rail, /<CardSearch/, "…and never mounts the card search");
  assert.match(nav, /<HeaderSearchSlot>/, "the header carries the desktop card search");
  assert.match(nav, /<HeaderSearchSlot mobile>/, "…and the phone search row");
  assert.match(codeOnly(read("src/components/CardSearch.tsx")), /"Search for cards"/, "…labelled for cards");

  // Header-only. The rail must never grow a second session control.
  assert.match(nav, /<NavUser/, "the header carries the account control");
  assert.doesNotMatch(rail, /"\/login"|"\/profile"/, "the rail must not duplicate it");

  // Deliberately BOTH: Premium, asked for on each surface separately.
  // OP Compare: the header's Pricing goes through HeaderPricingLink (a
  // PremiumNavLink hidden for members).
  assert.match(nav, /<HeaderPricingLink className="[^"]*\blg:block\b/);
  assert.match(rail, /href="\/premium"/);
});

test("the header's desktop row is the curated shortlist the owner named, and nothing else", () => {
  const nav = codeOnly(read("src/components/Navbar.tsx"));
  // Kept: "I still want the sealed, the blog, premium, Discord, the watch
  // list, the light and dark mode, the country and the accounts."
  //
  // PLUS TOOLS, FROM xl (2026-09-26, "Blog and tools, joined up" in
  // DECISIONS.md). The owner's AdSense brief names Tools as a header link,
  // which overrides the 09-21 shortlist for that one item. It is gated at xl,
  // never lg: the 1024-1279 row has ~5px of slack on touch, and an lg Tools
  // link would clip the sign-in control. Everything else here is unchanged.
  const tools = /<Link href="\/tools" className="([^"]*)"/.exec(nav)?.[1] ?? "";
  assert.ok(tools, "the header must carry Tools");
  assert.match(tools, /\bhidden\b/, "Tools is hidden below xl");
  assert.match(tools, /\bxl:block\b/, "…and shown from xl");
  assert.doesNotMatch(tools, /\blg:(block|inline|flex|grid)\b/, "never at lg, where the row has no room for it");
  for (const [what, pattern] of [
    ["Sealed", /<Link href="\/sealed"[^>]*lg:block/],
    ["Blog", /<Link href="\/blog"[^>]*lg:block/],
    ["Premium", /<HeaderPricingLink className="[^"]*\blg:block\b/],
    ["Discord", /aria-label="Join our Discord"[\s\S]{0,300}?\blg:grid\b/],
    ["the watchlist", /<HeaderWatchButton className="hidden sm:inline-flex" \/>/],
    ["the theme toggle", /<ThemeToggle className="hidden lg:grid" \/>/],
    ["the account control", /<NavUser/],
  ] as const) {
    assert.match(nav, pattern, `the header must keep ${what}`);
  }
  // Dropped by name: "you can just get rid of the explore ... deck builder
  // ... auctions".
  for (const gone of ["/deck", "/auctions"]) {
    assert.doesNotMatch(nav, new RegExp(`<Link href="${gone}"`), `${gone} is rail-only now`);
  }
  assert.doesNotMatch(nav, /<CommandLauncherButton \/>/, "Explore (the ⌘K button) is rail-only now");
});

test("the header's inline card search waits for xl, because the rail leaves it no room at lg", () => {
  // 2026-09-23. From 1024 the 17rem rail takes the header's left edge and the
  // shrink-0 nav (559px mouse / 595px touch) left the inline slot 13-78px: the
  // input covered "Sealed" and its "/" hint sat on "Database". Below xl the
  // full-width second row carries the search instead.
  const nav = codeOnly(read("src/components/Navbar.tsx"));
  assert.match(nav, /className="hidden min-w-0 flex-1 xl:block xl:w-\[36rem\]"/, "inline from xl, with a definite width to grow into");
  assert.match(nav, /className="pb-3 xl:hidden"/, "the full-width row covers everything below xl, including 1024-1279");
});

test("every group in the rail is reachable and nothing in NAV_GROUPS was lost to the rework", () => {
  // The rail is the site's full index. Two shapes were removed from it in one
  // day (a flat primary list, then the icon mode); neither may have taken a
  // destination with it.
  const rail = read("src/components/SideNav.tsx");
  assert.match(rail, /NAV_GROUPS\.map/);
  assert.match(rail, /group\.links\.map/, "…down to the leaves, not just the group headers");
  // OP Compare drops RiftCompare's Games, For stores and Miscellaneous groups.
  assert.ok(NAV_GROUPS.length >= 7, `expected the full grouped index, found ${NAV_GROUPS.length} groups`);
  // External links still branch — the contract every NAV_GROUPS renderer follows.
  assert.match(rail, /link\.external \?/, "external links must open in a new tab, never through next/link");
});

test("the rail's feature search filters the tree in place, and shares the launcher's index", () => {
  // "Lets make the search bar on the left a search for features." It filters
  // the list BELOW it rather than opening a panel over it: the rail IS the
  // navigation tree, so narrowing the tree you are already looking at needs
  // no explaining.
  const code = codeOnly(read("src/components/SideNav.tsx"));
  assert.match(code, /import \{ searchNav \} from "\.\/nav-search"/, "one shared index, not a second matcher");
  assert.match(code, /featureResults \? \(/, "a query replaces the grouped tree with flat results");
  assert.match(code, /No features match/, "…and an empty result says so rather than rendering nothing");
  // Each result names its group: "Movers" alone is ambiguous, "Movers · Prices"
  // is not.
  assert.match(code, /\{link\.group\}/, "results must carry the group they came from");
  // External links still branch, the contract every NAV_GROUPS renderer follows.
  assert.match(code, /link\.external \?/);
});
