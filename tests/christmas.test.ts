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

test("the Christmas decoration is gated, aria-hidden, never takes a tap, and stops for reduced motion", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /\.xmas-only \{\s*display: none !important;/);
  assert.match(css, /:root\[data-season="christmas"\] \.xmas-only \{\s*display: block !important;/);
  for (const sel of [".xmas-snow {", ".xmas-lights {", ".xmas-art {", ".xmas-hero {"]) {
    const i = css.indexOf(sel);
    assert.ok(i >= 0, sel);
    assert.match(css.slice(i, css.indexOf("}", i)), /pointer-events: none;/, `${sel} must not take taps`);
  }
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.xmas-snow::before,/);
  const decor = read("src/components/home/ChristmasDecor.tsx");
  assert.match(decor, /seasonMarkupLive\("christmas"\)/);
  assert.match(decor, /className="xmas-only xmas-hero" aria-hidden="true"/);
  for (const f of ["lights", "santa-hat", "xmas-tree", "stocking", "candy-cane", "gift", "snowflake", "holly"]) {
    const svg = read(`public/xmas/${f}.svg`);
    assert.ok(svg.startsWith("<svg") && svg.length < 4000, `${f}.svg stays a small vector file`);
  }
});
