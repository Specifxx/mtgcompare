import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { NAV_GROUPS } from "../src/components/nav-groups";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const readCode = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ─────────────────────────────────────────────────────────────────────────────
// "MAKE SURE IT ALL FITS ON A MOBILE PHONE" — the second half of the request
// that deleted the bottom tab bar, and the half that needed measuring rather
// than reasoning about.
//
// Moving the bar's Menu tab into the header as HeaderMenuButton cost 46px in a
// row that had ONE pixel of slack at 375px. Measured in Chromium against a real
// dev server, before any compensating change:
//
//   width   header row needed / had     page scrollWidth / viewport
//   320px   390 / 288                   406 / 320   ← sideways scroll
//   360px   390 / 328                   406 / 360   ← sideways scroll
//   375px   390 / 343                   406 / 375   ← sideways scroll
//   390px   390 / 358                   406 / 390   ← sideways scroll
//   640px   700 / 592                   724 / 640   ← already broken before this
//
// Two changes fixed it, and both are pinned below because either one reverting
// quietly reinstates a horizontally scrolling site on every phone:
//
//   1. The left group lost `shrink-0`. A non-shrinkable group cannot absorb
//      anything, so the overflow had nowhere to go but the document. With
//      `min-w-0` the worst case is a truncated label, not a scrolling page.
//   2. The below-lg "Database" text link was removed — ~76px, and the most
//      redundant thing in the header: the full-width search box on the next row
//      submits to /browse, which is also in the overlay.
//
// After: 288/288, 328/328, 343/343, 358/358, 592/592, 672/672 — no page-level
// horizontal scroll at ANY of 320/360/375/390/414/640/720, including the two
// widths that were broken beforehand. No tap target under 44x44 and no clipped
// text at 320/375/414, and the overlay opens full-width with 59 links.
//
// scripts/mobile-check.ts --url <dev> is the full audit to re-run after
// touching this row; it needs a database, so it runs in CI, not here.
// ─────────────────────────────────────────────────────────────────────────────

const NAVBAR = "src/components/Navbar.tsx";

test("the header's left group can shrink, so the row can never push the page sideways", () => {
  const code = readCode(NAVBAR);
  const row = code.slice(code.indexOf("h-16 w-full items-center"), code.indexOf("<HeaderSearchSlot>"));
  assert.match(row, /className="flex min-w-0 items-center gap-[\d.]+ sm:gap-3"/, "left group must be shrinkable with min-w-0");
  assert.doesNotMatch(
    row,
    /className="flex shrink-0 items-center gap-[\d.]+ sm:gap-3"/,
    "shrink-0 here is what made the overflow escape to the document",
  );
});

test("there is exactly ONE Database link and NO width can hide it", () => {
  // THIS TEST IS THE REVERSE OF WHAT IT ONCE ASSERTED, and the reversal is the
  // point. It used to pin the below-lg Database link OUT of the row, on the
  // reasoning that the search box one row down submits to /browse anyway — a
  // trade made to buy ~76px when HeaderMenuButton replaced the deleted bottom
  // bar. Reported back as "the database button is gone on mobile phone, that's
  // the most important one" and then "bring it back completely on desktop as
  // well, this is a big issue".
  //
  // The desktop half of that report was real and worse than it looked: the
  // surviving copy was gated `lg:block`, so the whole 640-1023px band — every
  // tablet and every narrow laptop window — had NO Database link either. Two
  // links with complementary gates (`lg:hidden` + `lg:block`) had left a hole
  // between them.
  //
  // One ungated link is the only arrangement with no gap and nothing to drift.
  // BACK TO UNGATED (2026-09-21, second amendment the same day). The header's
  // copy was briefly `lg:hidden`, on the reasoning that the rail carried the
  // same route. The rail's search is a FEATURE search now and its card links
  // live inside collapsed groups, so the header is again the one place a
  // visitor reaches the card database at a glance — at every width, which is
  // the arrangement with no gap and nothing to drift.
  const code = readCode(NAVBAR);
  const links = [...code.matchAll(/<Link\s+href="\/browse"([\s\S]{0,400}?)<\/Link>/g)];
  const headerLinks = links.filter((m) => /Database/.test(m[1]));
  assert.equal(headerLinks.length, 1, "exactly one Database link in the header");
  const cls = /className="([^"]*)"/.exec(headerLinks[0][1])?.[1] ?? "";
  for (const hide of ["hidden", "lg:block", "lg:hidden", "sm:hidden"]) {
    assert.ok(!cls.split(/\s+/).includes(hide), `Database must not be gated by "${hide}" (has: ${cls})`);
  }
  // It is still in NAV_GROUPS too ("Card Database", in the Prices group), so
  // the rail and the ⌘K launcher both reach it — but the header's copy is the
  // one that needs no interaction, which is what this test is about.
  const inGroups = NAV_GROUPS.flatMap((g) => g.links).some((l) => l.href === "/browse");
  assert.ok(inGroups, "/browse must also be in NAV_GROUPS");
  // It lives in the left cluster, beside the logo.
  const row = code.slice(code.indexOf("h-16 w-full items-center"), code.indexOf("<nav "));
  assert.match(row, /Database/, "and it sits in the left cluster beside the logo");
  // LABELLED "Database". Argued both ways by the same owner inside 48 hours:
  // "Database" for its whole life → "Browse" on 2026-09-19 ("it's meant to be
  // the browse button on the header") → "Database" again on 2026-09-21
  // ("reword the browse in the home page and all other areas to database").
  // /browse never moved for either rename.
  //
  // The ban is flipped rather than dropped, and it is worth MORE now than it was
  // pointing the other way: the 09-21 pass took the word out of every label
  // whose destination is this page — the hero link, the nav group heading, the
  // empty-state buttons — so the header saying "Browse" again would put the
  // site back to one destination wearing two names, which is the defect behind
  // both of the owner's complaints.
  assert.doesNotMatch(row, />\s*Browse\s*</, "the header button must not say Browse — see above, it is 'Database' sitewide");
  // The mobile search row still submits to /browse — a second route, not a
  // substitute (that substitution is exactly what got this removed once).
  assert.match(code, /<HeaderSearchSlot mobile>/);
});

test("the wordmark, not a nav control, is what pays for the tablet band", () => {
  // Restoring Database put the 640-1023px row 77px over. The logo link measures
  // 151px with "RiftCompare" beside the mark and 48px without, so deferring the
  // WORD to lg covers it with room — and it is the only thing in the row that is
  // decoration rather than a destination. The mark stays: still the home link,
  // still tappable, still the brand.
  const code = readCode(NAVBAR);
  assert.match(code, /<span className="hidden text-lg font-extrabold tracking-tight text-white lg:block">/);
  assert.doesNotMatch(code, /tracking-tight text-white sm:block/, "the wordmark must not turn back on at sm");
});

test("Pricing keeps the phone slot Premium had — plain, not gold (2026-09-28)", () => {
  // 2026-09-10: Premium was deliberately put beside Database on phones, gold
  // and shimmering. 2026-09-28: the owner moved upgrade prompts to where a
  // free account hits a limit, "not in popups and headers", so the slot is a
  // plain "Pricing" link to /premium now — still the reason the left group
  // must be able to shrink.
  const code = readCode(NAVBAR);
  const row = code.slice(code.indexOf("h-16 w-full items-center"), code.indexOf("<HeaderSearchSlot>"));
  assert.match(row, /<HeaderPricingLink/);
  assert.match(row, /lg:hidden/);
  // shrink-0 + nowrap, and BOTH are load-bearing — see the next test.
  const premClass = /<HeaderPricingLink[\s\S]*?className="([^"]*)"/.exec(row)?.[1] ?? "";
  for (const t of ["shrink-0", "whitespace-nowrap", "min-h-11", "min-w-11", "lg:hidden"]) {
    assert.ok(premClass.split(/\s+/).includes(t), `Pricing must keep "${t}" (has: ${premClass})`);
  }
  // Measured 2026-09-24: logo, Database, "✦ Premium", Log in, Sign up and the
  // menu need ~374px, so the WORD waited for 400px and only a 44px glyph fit
  // from 360px. "Pricing" is a word with no glyph form, so it shows from 400px
  // (narrower there than "✦ Premium" was) and below that the menu's Premium
  // entry (nav-groups.ts) reaches the same page.
  assert.match(premClass, /\bhidden\b/);
  assert.match(premClass, /min-\[400px\]:inline-flex/);
  assert.doesNotMatch(premClass, /text-gold/, "not gold: the header no longer sells Premium");
  assert.match(row, />\s*Pricing\s*<\/HeaderPricingLink>/);
});

test("Pricing (was Premium) cannot wrap AND cannot shrink — two screenshots' worth of bugs", () => {
  // Neither flag is cosmetic, and neither failure was visible to a measurement:
  //   • shrinkable + wrapping  → "✦" on one line and "Premium" on the next.
  //     scrollWidth === clientWidth when text WRAPS, so the overflow audit
  //     passed and only a screenshot showed it.
  //   • shrinkable + nowrap    → the label spilled its box and the theme toggle
  //     was drawn straight through it ("P☀mium") at 640px. Also invisible to a
  //     scroll check, since nothing overflowed the PAGE.
  // Fixed-width + nowrap forces the row to find the space instead, which is
  // what deferring the launcher and the theme toggle to lg pays for.
  const row = readCode(NAVBAR).slice(readCode(NAVBAR).indexOf("h-16 w-full items-center"), readCode(NAVBAR).indexOf("<HeaderSearchSlot>"));
  assert.match(row, /whitespace-nowrap/);
  assert.match(row, /shrink-0/);
});

test("the country switcher keeps a 44px target after losing its chevron below sm", () => {
  // The chevron was ~14px of what the Premium text needed. Removing it took the
  // control to 38px WIDE — the tap floor is a width rule as well as a height
  // one, and `min-h-11` only covered half of it. Caught by the harness, not by
  // reading the diff.
  const code = readCode("src/components/CountrySwitcher.tsx");
  assert.match(code, /min-h-11 min-w-11/);
  assert.match(code, /hidden h-3\.5 w-3\.5 transition-transform sm:block/, "chevron returns from sm up");
});

test("the theme toggle waits for lg, because the overlay owns it below that", () => {
  const code = readCode(NAVBAR);
  // Both this and the ⌘K launcher button were sm-gated and both duplicated
  // something the menu overlay already carries (its own search box; its own
  // "Theme" row). At 640-1023px the row's intrinsic width was ~641px inside
  // 592 with the watchlist split out, and that is what the overlap was really
  // telling us.
  //
  // THE LAUNCHER BUTTON IS GONE FROM THIS ROW ENTIRELY (2026-09-21). It was
  // `hidden lg:inline-flex` — lg and up only — which is exactly the range
  // where the full-height rail now carries its own Search row opening the
  // same launcher. Asserted as an absence so it cannot quietly come back as a
  // third way to open one overlay.
  assert.doesNotMatch(code, /<CommandLauncherButton \/>/, "the rail's Search row is the desktop launcher surface now");
  assert.match(code, /<ThemeToggle className="hidden lg:grid" \/>/);
  assert.doesNotMatch(code, /<ThemeToggle className="hidden sm:grid" \/>/);
  const menu = readCode("src/components/CinematicNavMenu.tsx");
  assert.match(menu, /<ThemeToggle variant="row" \/>/, "the overlay must still carry the theme row");
});

test("the menu button is an icon button that meets the tap-target floor", () => {
  const code = readCode("src/components/HeaderMenuButton.tsx");
  // `tap-icon` is the shared 44x44 (48 under pointer:coarse) utility — measured
  // at 44x44 in Chromium at 320/375/414 with zero targets under the floor.
  assert.match(code, /className=\{`tap-icon/);
});

test("nothing in the tree still reserves space for the deleted bar", () => {
  assert.ok(!existsSync(join(ROOT, "src/components/BottomTabBar.tsx")));
  const css = read("src/app/globals.css");
  assert.doesNotMatch(css, /var\(--bottombar-h\)/);
  // The body padding was the biggest one: 3.5rem of dead space under every page.
  assert.doesNotMatch(css, /padding-bottom:\s*calc\(var\(--bottombar-h\)/);
});
