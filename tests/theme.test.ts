import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LEGACY_THEME_KEY, THEME_BOOT_SCRIPT, THEME_COLOR, readThemeCookie, resolveThemeMode } from "../src/lib/theme-shared";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// Ported from RiftCompare's tests/theme.test.ts. The palette is MTG Compare's
// own ("Arcane Ink": violet-tinted ink, amethyst brand), whose brand fill takes
// WHITE ink where RiftCompare's green takes dark.
// ─────────────────────────────────────────────────────────────────────────────
// Light/dark theme. The site's components hard-code dark classes everywhere,
// so the theme is implemented as a switchable PALETTE: tailwind.config.ts
// defines the neutrals as rgb(var(--c-…)) and globals.css supplies a dark set on
// :root and a light set on :root[data-theme="light"]. What this file pins:
//   • the two palettes define exactly the same variables (a token defined in
//     one and not the other would silently render transparent in that theme);
//   • the dark palette is pinned value for value (the default theme);
//   • the light palette clears WCAG AA where the dark one does — the
//     accessibility audit that lifted slate-500/600 must not be undone by the
//     new theme;
//   • the boot script agrees with the resolver and defaults to DARK (MTG
//     Compare's default, as on RiftCompare).
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

test("the dark palette is MTG Compare's Arcane Ink palette, value for value (DECISIONS: Brand, Arcane Ink)", () => {
  const rgb = (hex: string) => hex.match(/[0-9a-f]{2}/gi)!.map((h) => parseInt(h, 16)).join(" ");
  const expected: Record<string, string> = {
    "c-ink-950": "#0a0912", "c-ink-900": "#0f0e18", "c-ink-850": "#151421", "c-ink-800": "#1c1b2b", "c-ink-700": "#2a293e", "c-ink-600": "#3b3a54",
    "c-brand-400": "#c394f4", "c-slate-100": "#f3f1fa", "c-slate-200": "#e5e2f1", "c-slate-300": "#cdc9df", "c-slate-400": "#a8a4c0", "c-slate-500": "#958fb2", "c-slate-600": "#8480a1", "c-slate-700": "#3b3a54", "c-slate-800": "#27263a", "c-slate-900": "#171625",
    "c-accent": "#efedf8", "c-gold": "#caa85a", "c-up": "#3fb950", "c-down": "#f0506e", "c-white": "#ffffff",
    // Tailwind stock: the chromatic text shades
    "c-rose-200": "#fecdd3", "c-rose-300": "#fda4af", "c-rose-400": "#fb7185", "c-red-300": "#fca5a5", "c-red-400": "#f87171",
    "c-emerald-300": "#6ee7b7", "c-emerald-400": "#34d399", "c-amber-100": "#fef3c7", "c-amber-200": "#fde68a", "c-amber-300": "#fcd34d",
    "c-sky-200": "#bae6fd", "c-sky-300": "#7dd3fc", "c-sky-400": "#38bdf8", "c-lime-200": "#d9f99d", "c-lime-300": "#bef264",
    "c-purple-300": "#d8b4fe", "c-blue-300": "#93c5fd", "c-orange-300": "#fdba74", "c-fuchsia-300": "#f0abfc",
  };
  for (const [k, hex] of Object.entries(expected)) assert.equal(DARK[k], rgb(hex), `${k} dark`);
  assert.match(block(":root"), /--page-bg:\s*#0c0b14;/);
  assert.match(block(":root"), /--page-fg:\s*#e9e7f3;/);
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
      for (const t of ["c-up", "c-down", "c-gold", "c-rose-300", "c-rose-400", "c-red-400", "c-emerald-400", "c-amber-300", "c-sky-300", "c-sky-400", "c-orange-300", "c-fuchsia-300"]) {
        const ratio = contrast(pal[t], pal[surface]);
        assert.ok(ratio >= 4.5, `${name}: ${t} on ${surface} is ${ratio.toFixed(2)}:1, below 4.5:1`);
      }
    }
  }
  // Dark ink on bright GOLD fills stays dark in the light theme (text-ink-950
  // would otherwise invert to near-white on gold badges) and the fills stay
  // bright. The amethyst brand fill is the opposite: it takes white ink in both
  // themes — .btn-primary sets it, and RiftCompare markup that writes
  // `bg-brand-500 text-ink-950` is overridden to white.
  assert.match(CSS, /:root\[data-theme="light"\] \.bg-gold\.text-ink-950,[\s\S]*?\{\s*color: #0a0912;/);
  assert.doesNotMatch(CSS, /:root\[data-theme="light"\] \.btn-primary/, "no light-mode dark-ink or hover override on the amethyst button");
  assert.match(CSS, /\n\.bg-brand-500\.text-ink-950,\s*\n\.bg-brand-500\.text-white \{\s*color: #ffffff;/);
  assert.match(CSS, /:root\[data-theme="light"\] \.bg-gold \{\s*background-color: #caa85a;/);
  assert.match(CSS, /:root\[data-theme="light"\] \.bg-brand-400 \{\s*background-color: #c394f4;/);
  assert.match(CSS, /\.btn-primary \{\s*@apply btn bg-brand-500 text-\[#ffffff\] hover:bg-brand-600;/);
  // White on the amethyst fills clears 4.5:1 (#9140da and its hover #7b2cc4).
  const white = "255 255 255";
  assert.ok(contrast(white, "145 64 218") >= 4.5, `white on brand-500 is ${contrast(white, "145 64 218").toFixed(2)}:1`);
  assert.ok(contrast(white, "123 44 196") >= 4.5, "white on brand-600");
});

test("the light palette is actually light and the dark one actually dark", () => {
  assert.ok(lum(LIGHT["c-ink-950"]) > 0.85 && lum(LIGHT["c-ink-900"]) > 0.95, "light surfaces must be near-white");
  assert.ok(lum(DARK["c-ink-950"]) < 0.01 && lum(DARK["c-ink-900"]) < 0.01, "dark surfaces must be near-black");
  assert.ok(lum(LIGHT["c-white"]) < 0.01, "text-white must become ink in the light theme");
  assert.match(block(':root[data-theme="light"]'), /color-scheme: light;/);
  assert.match(block(":root"), /color-scheme: dark;/);
});

test("the boot script agrees with the resolver for every cookie shape, defaults to dark, and never throws", () => {
  const run = (cookie: string) => {
    let stamped: string | null = null;
    const ctx = vm.createContext({ document: { cookie, documentElement: { setAttribute: (_k: string, v: string) => (stamped = v) } } });
    vm.runInContext(THEME_BOOT_SCRIPT, ctx);
    return stamped;
  };
  for (const c of ["", "theme=light", "theme=dark", "a=1; theme=light; b=2", "theme=blue", "notheme=light", "sidenav=expanded"]) {
    assert.equal(run(c), resolveThemeMode(readThemeCookie(c)), `cookie "${c}"`);
  }
  assert.equal(run(""), "dark");
  assert.equal(run("theme=light"), "light", "light only when the visitor chose it");
  assert.doesNotThrow(() => vm.runInContext(THEME_BOOT_SCRIPT, vm.createContext({})));
  assert.equal(readThemeCookie("theme=light"), "light");
  assert.equal(resolveThemeMode("sideways"), "dark");
});

test("the boot script migrates a legacy localStorage theme into the cookie once", () => {
  const run = (cookie: string, stored: string | null) => {
    let stamped: string | null = null;
    const store = new Map<string, string>();
    if (stored !== null) store.set(LEGACY_THEME_KEY, stored);
    const doc = { cookie, documentElement: { setAttribute: (_k: string, v: string) => (stamped = v) } };
    const localStorage = { getItem: (k: string) => store.get(k) ?? null, removeItem: (k: string) => store.delete(k) };
    vm.runInContext(THEME_BOOT_SCRIPT, vm.createContext({ document: doc, window: { localStorage } }));
    return { stamped, cookie: doc.cookie, left: store.has(LEGACY_THEME_KEY) };
  };
  // A visitor who chose light under the old key keeps light.
  const light = run("", "light");
  assert.equal(light.stamped, "light");
  assert.match(light.cookie, /^theme=light; path=\/; max-age=31536000; SameSite=Lax$/);
  assert.equal(light.left, false, "the legacy key is removed after the migration");
  assert.equal(run("", "dark").stamped, "dark");
  // A cookie already set wins and the legacy key is left alone (it is gone by then anyway).
  assert.equal(run("theme=dark", "light").stamped, "dark");
  // Junk in the old key is removed and the default stays dark.
  const junk = run("", "sepia");
  assert.equal(junk.stamped, "dark");
  assert.equal(junk.left, false);
  // localStorage throwing (Safari private mode) still stamps the cookie's value.
  let stamped: string | null = null;
  const ctx = vm.createContext({
    document: { cookie: "", documentElement: { setAttribute: (_k: string, v: string) => (stamped = v) } },
    window: { get localStorage(): never { throw new Error("denied"); } },
  });
  vm.runInContext(THEME_BOOT_SCRIPT, ctx);
  assert.equal(stamped, "dark");
});

test("the layout inlines the boot script in <head> and the meta theme-colour matches the dark palette (the default)", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /import \{ THEME_BOOT_SCRIPT \} from "@\/lib\/theme-shared"/);
  const head = layout.slice(layout.indexOf("<head>"), layout.indexOf("</head>"));
  assert.match(head, /<script dangerouslySetInnerHTML=\{\{ __html: THEME_BOOT_SCRIPT \}\} \/>/);
  assert.match(layout, new RegExp(`themeColor: "${THEME_COLOR.dark}"`), "viewport.themeColor must be the dark palette's page colour");
  assert.match(layout, /<html lang="en" data-theme="dark"/, "the server renders the dark default");
  assert.doesNotMatch(layout, /from "next\/headers"/, "the caching rule still holds — no cookies() in the root layout");
});

test("the toggle writes the attribute, the cookie and the browser-chrome colour, and hydrates as dark", () => {
  // RiftCompare's version of this test also pins where the header and the
  // phone menu mount the toggle; those files arrive with the wave-2 design
  // track, which ports that half.
  const toggle = read("src/components/ThemeToggle.tsx");
  assert.match(toggle, /setAttribute\("data-theme", mode\)/);
  assert.match(toggle, /document\.cookie = `\$\{THEME_COOKIE\}=\$\{next\}; path=\/; max-age=\$\{THEME_COOKIE_MAX_AGE\}; SameSite=Lax`/);
  assert.match(toggle, /meta\[name="theme-color"\]/, "the browser-chrome colour must follow the page");
  assert.match(toggle, /new MutationObserver/);
  assert.match(toggle, /observe\(document\.head/);
  assert.match(toggle, /useState<ThemeMode>\("dark"\)/, "initial state must match the server render (no hydration mismatch)");
  assert.match(toggle, /const EVENT = "mc:theme";/);
  assert.ok(!existsSync(join(ROOT, "src/lib/theme.ts")), "the old localStorage theme module is gone");
});

test("nothing that must stay white in both themes uses the themed `white` token", () => {
  // "Shop on eBay" sits on eBay blue, a fixed fill in both themes. With the
  // themed `text-white` it went dark-ink on #0064d2 in light (RiftCompare UI audit B2-08).
  assert.match(read("src/components/EbayBuyCta.tsx"), /bg-\[#0064d2\][^"`]*text-\[#ffffff\]/);
  assert.match(CSS, /\.btn-ebay \{\s*@apply btn bg-\[#0064d2\] text-\[#ffffff\]/);
});
