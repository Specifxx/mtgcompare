import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SEASON_BOOT_SCRIPT, seasonAt, seasonMarkupLive } from "../src/lib/season";

// Halloween (owner, 2026-10-24, ported from RiftCompare): lib/season.ts decides it in the visitor's local time. These pin the
// window, the boot script that stamps it before paint, and that the landing page wires it without reading the request.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);

test("Halloween runs 16-31 October, and is gone on 1 November", () => {
  assert.equal(seasonAt(at(2026, 10, 15)), null);
  assert.equal(seasonAt(at(2026, 10, 16)), "halloween");
  assert.equal(seasonAt(at(2026, 10, 31)), "halloween");
  assert.equal(seasonAt(at(2026, 11, 1)), "christmas", "Christmas takes over");
  assert.equal(seasonAt(at(2026, 3, 3)), null);
  assert.equal(seasonAt(at(2027, 10, 20)), "halloween", "it comes back every year");
  assert.equal(seasonMarkupLive("halloween", at(2026, 10, 15)), true);
  assert.equal(seasonMarkupLive("halloween", at(2026, 11, 1)), true);
  assert.equal(seasonMarkupLive("halloween", at(2026, 11, 2)), false);
  assert.equal(seasonMarkupLive("halloween", at(2026, 10, 14)), false);
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
    document: { documentElement: { setAttribute: (k: string, v: string) => k === "data-season" && (stamped = v) } },
  });
  vm.runInContext(SEASON_BOOT_SCRIPT, ctx);
  return stamped;
}

test("the boot script agrees with seasonAt(), takes a ?season= override, and never throws", () => {
  for (const d of [at(2026, 10, 15), at(2026, 10, 16), at(2026, 10, 31), at(2026, 11, 1), at(2026, 3, 3)]) {
    assert.equal(boot(d), seasonAt(d), d.toDateString());
  }
  assert.equal(boot(at(2026, 3, 3), "?season=halloween"), "halloween");
  assert.equal(boot(at(2026, 10, 20), "?a=1&season=off"), null);
  assert.doesNotThrow(() => vm.runInContext(SEASON_BOOT_SCRIPT, vm.createContext({})));
});

test("the layout runs the boot script and the decor is CSS-gated, motion-safe and never reads the request", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /SEASON_BOOT_SCRIPT/);
  assert.match(layout, /suppressHydrationWarning/);
  for (const f of ["src/lib/season.ts", "src/components/home/HalloweenDecor.tsx", "src/components/home/InnistradComing.tsx"]) {
    assert.doesNotMatch(read(f), /next\/headers|cookies\(|headers\(/, f);
  }
  const css = read("src/app/globals.css");
  assert.match(css, /\.mc-decor,\s*\.mc-moon\s*\{\s*display: none;/);
  assert.match(css, /prefers-reduced-motion: reduce\)\s*\{\s*\.mc-bat \{ display: none; \}/);
  assert.match(css, /\.mc-decor \{[^}]*pointer-events: none;/);
});
