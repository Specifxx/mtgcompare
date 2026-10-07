import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NAV_GROUPS } from "../src/components/nav-groups";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
// Comments here DISCUSS the markup they forbid (e.g. why there is no <title>),
// so the "must not contain" checks below read code only.
const readCode = (p: string) =>
  read(p).replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");
const SRC = "src/components/NavIcon.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// The collapsed desktop rail used to render each group's EMOJI. Emoji are what
// made the nav read as "AI generated" — a different visual language from the
// rest of the chrome, a different glyph on every OS, untintable, and unable to
// dim when inactive. Replaced 2026-09-11 with drawn line icons in the idiom
// already used everywhere else here: 24px box, no fill, currentColor stroke.
// ─────────────────────────────────────────────────────────────────────────────

test("every nav group names an icon, and no two share one", () => {
  for (const g of NAV_GROUPS) assert.ok(g.icon, `${g.title} needs an icon`);
  assert.equal(
    new Set(NAV_GROUPS.map((g) => g.icon)).size,
    NAV_GROUPS.length,
    "icons must be distinct — at 4rem the silhouette is the ONLY thing identifying a group",
  );
});

test("every icon a group names is actually drawn", () => {
  // A key with no entry renders an empty 20px box: the group becomes a blank
  // square in the rail, clickable but unidentifiable. The Record type in
  // NavIcon.tsx catches the reverse (a name with no drawing); this catches a
  // group pointing at a name that was renamed or removed.
  const src = read(SRC);
  const drawn = new Set([...src.matchAll(/^  (\w+): \(/gm)].map((m) => m[1]));
  for (const g of NAV_GROUPS) {
    assert.ok(drawn.has(g.icon as string), `nav group "${g.title}" names icon "${g.icon}", which NavIcon.tsx does not draw`);
  }
});

test("the rail renders the drawn icon, not an emoji", () => {
  const src = read("src/components/SideNav.tsx");
  assert.match(src, /<NavIcon name=\{group\.icon\}/, "the collapsed rail must render NavIcon");
  assert.doesNotMatch(
    src,
    /<span aria-hidden="true">\{group\.icon\}\}?<\/span>/,
    "the raw-emoji span must be gone, not just bypassed",
  );
  // No emoji may sneak back into the group data either.
  const groups = read("src/components/nav-groups.ts");
  const groupIconLines = [...groups.matchAll(/^\s*icon: (.+),$/gm)].map((m) => m[1]);
  for (const v of groupIconLines) {
    assert.match(v, /^"[a-z]+"$/, `group icon ${v} must be a plain NavIcon key, not an emoji or expression`);
  }
});

test("icons inherit colour and size from the button, so active/hover states reach them", () => {
  // The emoji could not be tinted at all, which left the active group's only
  // cue its background tint. These take currentColor, so the rail sets the
  // colour and this must not hard-code one.
  const src = read(SRC);
  assert.match(src, /stroke="currentColor"/, "must stroke with currentColor");
  assert.doesNotMatch(src, /stroke="#|fill="#/, "no hard-coded colours — the rail owns the colour");
  // Sized by className, never by a baked-in width/height attribute.
  assert.doesNotMatch(src, /<svg[^>]*\swidth=/, "size comes from className, so one icon can't render at a different size");
  const rail = read("src/components/SideNav.tsx");
  assert.match(rail, /<NavIcon name=\{group\.icon\} className="h-4 w-4 shrink-0" \/>/, "the rail sizes the icon");
  // The active group tints its HEADER (and therefore, via currentColor, its
  // icon). It used to also carry a background; with the rail always expanded
  // the tint alone is the cue, and the background moved to the active LINK
  // inside the group — which is the thing you actually navigated to.
  assert.match(rail, /groupActive \? "text-brand-300"/, "the active group must tint its icon, not only its background");
  assert.match(rail, /border-brand-400 bg-brand-500\/10 font-semibold text-brand-300/, "the active LINK carries the border + tint");
});

test("the icons are decorative — the button carries the accessible name", () => {
  // The rail's button already has aria-label + title with the group name. A
  // <title> inside the svg would make a screen reader announce it twice.
  const src = readCode(SRC);
  assert.match(src, /aria-hidden="true"/);
  assert.match(src, /focusable="false"/, "IE/Edge legacy: an svg without this can take tab focus");
  assert.doesNotMatch(src, /<title>/, "the button labels the control; a title here double-announces");
});

test("no icon dependency was added for nine glyphs", () => {
  // Also the licensing point: these are drawn here, so nothing in the rail
  // carries an attribution requirement. A Flaticon free-tier icon would need a
  // visible credit link on every page it appears on — and the rail is on every
  // page.
  const pkg = JSON.parse(read("package.json")) as { dependencies?: Record<string, string> };
  const deps = Object.keys(pkg.dependencies ?? {});
  for (const lib of ["lucide-react", "react-icons", "@heroicons/react", "feather-icons", "@phosphor-icons/react"]) {
    assert.ok(!deps.includes(lib), `${lib} was added — the rail's nine icons are drawn in NavIcon.tsx on purpose`);
  }
});
