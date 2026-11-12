import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SEASON_BOOT_SCRIPT, seasonAt, seasonMarkupLive } from "../src/lib/season";

// The Christmas season (owner, 2026-11-01: "make all of the sites Christmas
// themed"). These pin its window (1 November to Boxing Day, gone on 27
// December), the ?season= preview, and that every piece of it is decoration:
// gated by the attribute, aria-hidden, never taking a tap, small cached art.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

test("Christmas runs 1 November to Boxing Day, and is gone on 27 December", () => {
  assert.equal(seasonAt(at(2026, 10, 31)), "halloween");
  assert.equal(seasonAt(at(2026, 11, 1)), "christmas");
  assert.equal(seasonAt(at(2026, 12, 26)), "christmas");
  assert.equal(seasonAt(at(2026, 12, 27)), null);
  assert.equal(seasonAt(at(2027, 11, 20)), "christmas", "it comes back every year");
  assert.equal(seasonMarkupLive("christmas", at(2026, 12, 27)), true, "a day of slack for the page cache");
  assert.equal(seasonMarkupLive("christmas", at(2026, 12, 28)), false);
});

function boot(date: Date, search = ""): string | null {
  let stamped: string | null = null;
  const RealDate = Date;
  const FakeDate = function () {
    return new RealDate(date.getTime());
  } as unknown as DateConstructor;
  const ctx = vm.createContext({
    Date: FakeDate,
    location: { search },
    document: { documentElement: { setAttribute: (k: string, v: string) => k === "data-season" && (stamped = v), getAttribute: () => stamped } },
  });
  vm.runInContext(SEASON_BOOT_SCRIPT, ctx);
  return stamped;
}

test("the boot script stamps Christmas from the visitor's date and takes a ?season= preview", () => {
  for (const d of [at(2026, 11, 1), at(2026, 12, 26), at(2026, 12, 27), at(2026, 3, 3)]) {
    assert.equal(boot(d), seasonAt(d), d.toDateString());
  }
  assert.equal(boot(at(2026, 3, 3), "?season=christmas"), "christmas", "preview it out of season");
  assert.equal(boot(at(2026, 11, 20), "?season=off"), null, "switch it off in season");
  assert.equal(boot(at(2026, 11, 20), "?season=bogus"), null);
});

test("Christmas is one quiet line in the site's own colours (owner, 2026-11-08: the theme must match the domain)", () => {
  const css = read("src/app/globals.css");
  for (const gone of [".xmas-snow", ".xmas-lights", ".xmas-art", ".xmas-hero", ".xmas-logo-hat", "/xmas/", "#dc2626 0 10px"]) {
    assert.ok(!css.includes(gone), `${gone} is gone`);
  }
  assert.doesNotMatch(css, /data-season="christmas"\][^{]*\{[^}]*--(c-ink|bg|surface|brand)/, "no palette swap");
  assert.match(css, /:root\[data-season="christmas"\] \.xmas-pill-row \{\s*display: flex;/);
  assert.match(css, /\.xmas-pill \{[^}]*color: inherit;/, "drawn in the site's own colours");
  const gifts = read("src/components/home/ChristmasGifts.tsx");
  assert.match(gifts, /seasonMarkupLive\("christmas"\)/);
  assert.doesNotMatch(gifts, /xmas-pill-icon/);
});

test("the festive layer (owner, 2026-11-12) is a card, a hairline and two colour tokens, behind one off switch, and nothing more", () => {
  const css = read("src/app/globals.css");
  const block = css.slice(css.indexOf("/* xmas-common:start"), css.indexOf("/* xmas-common:end */")).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(block.length > 500, "the xmas block is there");
  // The hairline: 3px, two flat tones, keyed on the season attribute and the festive attribute.
  assert.match(block, /:root\[data-season="christmas"\]\[data-festive\] body::before \{[^}]*height: 3px;[^}]*linear-gradient\(to right, rgb\(var\(--xmas-red\)\) 50%, rgb\(var\(--xmas-pine\)\) 50%\)/);
  // The accents reach the pill and the Black Friday strip through the tokens only.
  assert.match(block, /\.xmas-pill \{[^}]*--xmas-red/);
  assert.match(block, /\[data-holiday-strip\] \{[^}]*--xmas-pine/);
  assert.match(block, /\.xmas-guide \{[^}]*border-left: 3px solid rgb\(var\(--xmas-red\)\)/);
  // What stays gone: motion, flakes, canvas, candy stripes, images.
  for (const bad of ["@keyframes", "animation", "snow", "flake", "canvas", "repeating-", "conic-gradient", "url(", "@font-face"]) {
    assert.ok(!block.toLowerCase().includes(bad), `${bad} is not in the Christmas CSS`);
  }
  assert.doesNotMatch(css, /@keyframes[^{]*(snow|flake|xmas)/i);
  // The one off switch, and the layout's attribute that the CSS keys on.
  assert.match(read("src/lib/season.ts"), /export const CHRISTMAS_FESTIVE_LAYER = true;/);
  assert.match(read("src/app/layout.tsx"), /data-festive=\{CHRISTMAS_FESTIVE_LAYER \? "on" : undefined\}/);
  // The card: server markup behind the switch, an inline SVG in currentColor, a link and not a heading.
  const card = read("src/components/home/ChristmasGifts.tsx");
  assert.match(card, /CHRISTMAS_FESTIVE_LAYER/);
  assert.match(card, /<svg[^>]*stroke="currentColor"/);
  assert.match(card, /Christmas gift guide/);
  assert.doesNotMatch(card, /<h[1-6]|"use client"|<img|canvas|useEffect|setInterval/);
});
