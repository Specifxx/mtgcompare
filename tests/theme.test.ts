import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LEGACY_THEME_KEY, THEME_BOOT_SCRIPT, THEME_COLOR, readThemeCookie, resolveThemeMode } from "../src/lib/theme-shared";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// Ported from RiftCompare's tests/theme.test.ts (wave 2, 2026-10-03). The
// palette is RiftCompare's byte for byte except the brand ramp: OP Compare's
// Straw Hat red, which takes WHITE ink where RiftCompare's green takes dark.
// ─────────────────────────────────────────────────────────────────────────────
// Light/dark theme. The site's components hard-code dark classes everywhere,
// so the theme is implemented as a switchable PALETTE: tailwind.config.ts
// defines the neutrals as rgb(var(--c-…)) and globals.css supplies a dark set on
// :root and a light set on :root[data-theme="light"]. What this file pins:
//   • the two palettes define exactly the same variables (a token defined in
//     one and not the other would silently render transparent in that theme);
//   • the dark palette is the exact hexes the config used to hard-code, so
//     the default theme is pixel-identical to before;
//   • the light palette clears WCAG AA where the dark one does — the
//     accessibility audit that lifted slate-500/600 must not be undone by the
//     new theme;
//   • the boot script agrees with the resolver and defaults to LIGHT (OP
//     Compare's default, DECISIONS "Light theme is the default").
// ─────────────────────────────────────────────────────────────────────────────

const CSS = read("src/app/globals.css");
const CFG = read("tailwind.config.ts");

function block(selector: string): string {
  const i = CSS.indexOf(`${selector} {`);
  assert.ok(i >= 0, `expected a "${selector} {" block in globals.css`);
  return CSS.slice(i, CSS.indexOf("\n}", i));
}
function vars(blockSrc: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of blockSrc.matchAll(/--(c-[a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const DARK = vars(block(":root"));
const LIGHT = vars(block(':root[data-theme="light"]'));

test("tailwind's themed tokens are all CSS variables, and both palettes define every one of them", () => {
  const names = [...new Set([...CFG.matchAll(/v\("([a-z0-9-]+)"\)/g)].map((m) => `c-${m[1]}`))];
  assert.ok(names.length >= 20, `expected the neutrals to be variable-backed, found ${names.length}`);
  for (const n of names) {
    assert.ok(DARK[n], `${n} has no dark value in globals.css :root`);
    assert.ok(LIGHT[n], `${n} has no light value in globals.css :root[data-theme="light"]`);
  }
  // …and nothing defined in one palette is missing from the other.
  assert.deepEqual(Object.keys(LIGHT).sort(), Object.keys(DARK).sort(), "the two palettes must define the same variable set");
  // The wrapper itself must keep <alpha-value> so bg-ink-900/95-style modifiers work.
  assert.match(CFG, /rgb\(var\(--c-\$\{name\}\) \/ <alpha-value>\)/);
  // brand-300 stays undefined on purpose, as on RiftCompare (copying that keeps the same look).
  assert.doesNotMatch(CFG, /\b300: v\("brand-300"\)/);
});

test("the dark palette is the exact palette the config used to hard-code (dark mode is pixel-identical)", () => {
  const rgb = (hex: string) => hex.match(/[0-9a-f]{2}/gi)!.map((h) => parseInt(h, 16)).join(" ");
  const expected: Record<string, string> = {
    "c-ink-950": "#0a0c10", "c-ink-900": "#0e1116", "c-ink-850": "#13171f", "c-ink-800": "#191e28", "c-ink-700": "#252b38", "c-ink-600": "#333b4d",
    "c-brand-400": "#ff6b6b", "c-slate-500": "#8593a6", "c-slate-600": "#76828f",
    "c-slate-400": "#94a3b8", "c-slate-300": "#cbd5e1", "c-slate-200": "#e2e8f0", // Tailwind stock
    "c-accent": "#eef1f5", "c-gold": "#caa85a", "c-up": "#3fb950", "c-down": "#f0506e", "c-white": "#ffffff",
    // Tailwind stock: the chromatic text shades
    "c-rose-200": "#fecdd3", "c-rose-300": "#fda4af", "c-rose-400": "#fb7185", "c-red-300": "#fca5a5", "c-red-400": "#f87171",
    "c-emerald-300": "#6ee7b7", "c-emerald-400": "#34d399", "c-amber-100": "#fef3c7", "c-amber-200": "#fde68a", "c-amber-300": "#fcd34d",
    "c-sky-200": "#bae6fd", "c-sky-300": "#7dd3fc", "c-sky-400": "#38bdf8", "c-lime-200": "#d9f99d", "c-lime-300": "#bef264",
    "c-purple-300": "#d8b4fe", "c-blue-300": "#93c5fd",
  };
  for (const [k, hex] of Object.entries(expected)) assert.equal(DARK[k], rgb(hex), `${k} dark`);
  assert.match(block(":root"), /--page-bg:\s*#0b0e14;/);
  assert.match(block(":root"), /--page-fg:\s*#e8eaee;/);
  assert.match(CSS, /background-color: var\(--page-bg\);\s*\n\s*color: var\(--page-fg\);/);
});

// WCAG relative luminance + contrast ratio, on RGB triplets as stored.
function lum(triplet: string): number {
  const [r, g, b] = triplet.split(/\s+/).map((n) => {
    const c = Number(n) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

test("the light palette keeps the accessibility guarantees the dark one makes (4.5:1 body text on both surfaces)", () => {
  for (const [name, pal] of [["dark", DARK], ["light", LIGHT]] as const) {
    for (const surface of ["c-ink-950", "c-ink-900", "c-ink-850"]) {
      for (const text of ["c-white", "c-slate-300", "c-slate-400", "c-slate-500", "c-slate-600", "c-accent", "c-brand-400"]) {
        const ratio = contrast(pal[text], pal[surface]);
        assert.ok(ratio >= 4.5, `${name}: ${text} on ${surface} is ${ratio.toFixed(2)}:1, below 4.5:1`);
      }
      // Gain/loss colours are read as numbers next to prices — same floor. So are
      // the error, loss and status text shades (role=alert rose-300/400, loss
      // prices, "Sold out", "At MSRP", "NN% over MSRP", sky/amber status text),
      // which went through the palette on 2026-09-23 because Tailwind's stock
      // pastels read 1.4-2.7:1 on the light theme's white cards.
      for (const t of ["c-up", "c-down", "c-gold", "c-rose-300", "c-rose-400", "c-red-400", "c-emerald-400", "c-amber-300", "c-sky-300", "c-sky-400"]) {
        const ratio = contrast(pal[t], pal[surface]);
        assert.ok(ratio >= 4.5, `${name}: ${t} on ${surface} is ${ratio.toFixed(2)}:1, below 4.5:1`);
      }
    }
  }
  // Dark ink on bright GOLD fills stays dark in the light theme (text-ink-950
  // would otherwise invert to near-white on gold badges) and the fills stay
  // bright. The red brand fill is the opposite: it takes white ink in both
  // themes — .btn-primary sets it, and RiftCompare markup that writes
  // `bg-brand-500 text-ink-950` is overridden to white.
  assert.match(CSS, /:root\[data-theme="light"\] \.bg-gold\.text-ink-950,[\s\S]*?\{\s*color: #0a0c10;/);
  assert.doesNotMatch(CSS, /:root\[data-theme="light"\] \.btn-primary/, "no light-mode dark-ink or hover override on the red button");
  assert.match(CSS, /\n\.bg-brand-500\.text-ink-950,\s*\n\.bg-brand-500\.text-white \{\s*color: #ffffff;/);
  assert.match(CSS, /:root\[data-theme="light"\] \.bg-gold \{\s*background-color: #caa85a;/);
  assert.match(CSS, /:root\[data-theme="light"\] \.bg-brand-400 \{\s*background-color: #ff6b6b;/);
  assert.match(CSS, /\.btn-primary \{\s*@apply btn bg-brand-500 text-\[#ffffff\] hover:bg-brand-600;/);
  // White on the red fills clears 4.5:1 (#d92b33 and its hover #b11f27).
  const white = "255 255 255";
  assert.ok(contrast(white, "217 43 51") >= 4.5, `white on brand-500 is ${contrast(white, "217 43 51").toFixed(2)}:1`);
  assert.ok(contrast(white, "177 31 39") >= 4.5, "white on brand-600");
});

test("the light palette is actually light and the dark one actually dark", () => {
  assert.ok(lum(LIGHT["c-ink-950"]) > 0.85 && lum(LIGHT["c-ink-900"]) > 0.95, "light surfaces must be near-white");
  assert.ok(lum(DARK["c-ink-950"]) < 0.01 && lum(DARK["c-ink-900"]) < 0.01, "dark surfaces must be near-black");
  assert.ok(lum(LIGHT["c-white"]) < 0.01, "text-white must become ink in the light theme");
  assert.match(block(':root[data-theme="light"]'), /color-scheme: light;/);
  assert.match(block(":root"), /color-scheme: dark;/);
});

test("the boot script agrees with the resolver for every cookie shape, defaults to light, and never throws", () => {
  const run = (cookie: string) => {
    let stamped: string | null = null;
    const ctx = vm.createContext({ document: { cookie, documentElement: { setAttribute: (_k: string, v: string) => (stamped = v) } } });
    vm.runInContext(THEME_BOOT_SCRIPT, ctx);
    return stamped;
  };
  for (const c of ["", "theme=light", "theme=dark", "a=1; theme=light; b=2", "theme=blue", "notheme=light", "sidenav=expanded"]) {
    assert.equal(run(c), resolveThemeMode(readThemeCookie(c)), `cookie "${c}"`);
  }
  assert.equal(run(""), "light");
  assert.equal(run("theme=dark"), "dark", "dark only when the visitor chose it");
  assert.doesNotThrow(() => vm.runInContext(THEME_BOOT_SCRIPT, vm.createContext({})));
  assert.equal(readThemeCookie("theme=light"), "light");
  assert.equal(resolveThemeMode("sideways"), "light");
});

test("the boot script migrates OP Compare's old localStorage theme into the cookie once", () => {
  const run = (cookie: string, stored: string | null) => {
    let stamped: string | null = null;
    const store = new Map<string, string>();
    if (stored !== null) store.set(LEGACY_THEME_KEY, stored);
    const doc = { cookie, documentElement: { setAttribute: (_k: string, v: string) => (stamped = v) } };
    const localStorage = { getItem: (k: string) => store.get(k) ?? null, removeItem: (k: string) => store.delete(k) };
    vm.runInContext(THEME_BOOT_SCRIPT, vm.createContext({ document: doc, window: { localStorage } }));
    return { stamped, cookie: doc.cookie, left: store.has(LEGACY_THEME_KEY) };
  };
  // A visitor who chose dark under the old key keeps dark.
  const dark = run("", "dark");
  assert.equal(dark.stamped, "dark");
  assert.match(dark.cookie, /^theme=dark; path=\/; max-age=31536000; SameSite=Lax$/);
  assert.equal(dark.left, false, "the legacy key is removed after the migration");
  assert.equal(run("", "light").stamped, "light");
  // A cookie already set wins and the legacy key is left alone (it is gone by then anyway).
  assert.equal(run("theme=light", "dark").stamped, "light");
  // Junk in the old key is removed and the default stays light.
  const junk = run("", "sepia");
  assert.equal(junk.stamped, "light");
  assert.equal(junk.left, false);
  // localStorage throwing (Safari private mode) still stamps the cookie's value.
  let stamped: string | null = null;
  const ctx = vm.createContext({
    document: { cookie: "", documentElement: { setAttribute: (_k: string, v: string) => (stamped = v) } },
    window: { get localStorage(): never { throw new Error("denied"); } },
  });
  vm.runInContext(THEME_BOOT_SCRIPT, ctx);
  assert.equal(stamped, "light");
});

test("the layout inlines the boot script in <head> and the meta theme-colour matches the light palette (the default)", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /import \{ THEME_BOOT_SCRIPT \} from "@\/lib\/theme-shared"/);
  const head = layout.slice(layout.indexOf("<head>"), layout.indexOf("</head>"));
  assert.match(head, /<script dangerouslySetInnerHTML=\{\{ __html: THEME_BOOT_SCRIPT \}\} \/>/);
  assert.match(layout, new RegExp(`themeColor: "${THEME_COLOR.light}"`), "viewport.themeColor must be the light palette's page colour");
  assert.match(layout, /<html lang="en" data-theme="light"/, "the server renders the light default");
  assert.doesNotMatch(layout, /from "next\/headers"/, "the caching rule still holds — no cookies() in the root layout");
});

test("the toggle writes the attribute, the cookie and the browser-chrome colour, and hydrates as light", () => {
  // RiftCompare's version of this test also pins where the header and the
  // phone menu mount the toggle; those files arrive with the wave-2 design
  // track, which ports that half.
  const toggle = read("src/components/ThemeToggle.tsx");
  assert.match(toggle, /setAttribute\("data-theme", mode\)/);
  assert.match(toggle, /document\.cookie = `\$\{THEME_COOKIE\}=\$\{next\}; path=\/; max-age=\$\{THEME_COOKIE_MAX_AGE\}; SameSite=Lax`/);
  assert.match(toggle, /meta\[name="theme-color"\]/, "the browser-chrome colour must follow the page");
  assert.match(toggle, /new MutationObserver/);
  assert.match(toggle, /observe\(document\.head/);
  assert.match(toggle, /useState<ThemeMode>\("light"\)/, "initial state must match the server render (no hydration mismatch)");
  assert.match(toggle, /const EVENT = "oc:theme";/);
  assert.ok(!existsSync(join(ROOT, "src/lib/theme.ts")), "the old localStorage theme module is gone");
});

test("nothing that must stay white in both themes uses the themed `white` token", () => {
  // "Shop on eBay" sits on eBay blue, a fixed fill in both themes. With the
  // themed `text-white` it went dark-ink on #0064d2 in light (RiftCompare UI audit B2-08).
  assert.match(read("src/components/EbayBuyCta.tsx"), /bg-\[#0064d2\][^"`]*text-\[#ffffff\]/);
  assert.match(CSS, /\.btn-ebay \{\s*@apply btn bg-\[#0064d2\] text-\[#ffffff\]/);
});
