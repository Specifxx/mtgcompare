import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { DEFAULT_THEME, THEME_BOOT_SCRIPT, themeFrom } from "../src/lib/theme";

function boot(storage: Record<string, string> | "blocked"): string | null {
  let attr: string | null = null;
  const localStorage =
    storage === "blocked"
      ? { getItem: () => { throw new Error("blocked"); } }
      : { getItem: (k: string) => storage[k] ?? null };
  const ctx = vm.createContext({ localStorage, document: { documentElement: { setAttribute: (_: string, v: string) => (attr = v) } } });
  vm.runInContext(THEME_BOOT_SCRIPT, ctx);
  return attr;
}

test("a new visitor gets the dark theme; a saved choice wins", () => {
  assert.equal(DEFAULT_THEME, "dark");
  assert.equal(boot({}), "dark");
  assert.equal(boot({ "mc-theme": "light" }), "light");
  assert.equal(boot({ "mc-theme": "dark" }), "dark");
  assert.equal(boot({ "mc-theme": "junk" }), "dark");
  assert.equal(boot("blocked"), "dark");
  for (const v of [null, "light", "dark", "junk"]) assert.equal(boot(v == null ? {} : { "mc-theme": v }), themeFrom(v));
});

test("dark is keyed on the attribute, never the OS media query, so the boot script decides", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  assert.doesNotMatch(css, /prefers-color-scheme/);
  assert.match(css, /:root:not\(\[data-theme="light"\]\) \{/);
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  assert.match(layout, /THEME_BOOT_SCRIPT/);
});
