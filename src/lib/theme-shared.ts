// The site's two colour themes and how a visitor's choice is remembered.
// Shared by the root layout (which inlines THEME_BOOT_SCRIPT so the first paint
// is already right), ThemeToggle.tsx (which flips and persists the choice) and
// tests/theme.test.ts. No React, no DOM at module level — importable anywhere.
//
// ── How the theme actually works ─────────────────────────────────────────────
// Every component on this site hard-codes dark classes (text-white, bg-ink-900,
// text-slate-400 — some 2,000 usages). A `dark:` variant on each of them is not
// a change anyone could review or keep consistent. Instead the PALETTE is the
// switch: tailwind.config.ts defines ink / slate / white / accent / gold / up /
// down / brand-400 as `rgb(var(--c-…) / <alpha-value>)`, globals.css gives every
// variable a dark value on `:root` and a light value on
// `:root[data-theme="light"]`, and the same className renders correctly in both.
// `text-white` in light mode is near-black ink, `bg-ink-900` is a white card,
// `text-slate-400` is a mid grey that still clears 4.5:1 — the test pins that.
//
// ── Default is DARK (as on RiftCompare) ───────────────────────────────────────
// MTG Compare is a dark-first price terminal (DECISIONS, "Brand: Arcane Ink"):
// the root layout renders <html data-theme="dark">, and light applies only when
// the visitor chose it with the toggle, remembered in the `theme` cookie for a
// year. prefers-color-scheme is deliberately NOT consulted, as on RiftCompare:
// the site's look changes only when the visitor asks. To flip the default to
// light, change DEFAULT_THEME, the boot script's fallback, the layout's
// data-theme and themeColor, ThemeToggle's initial state and the tests that pin
// them.
//
// ── Why a cookie + inline script, not server rendering ───────────────────────
// The root layout must never read cookies()/headers() (see its own comment:
// one dynamic-API read there opts every route out of static caching), so the
// server cannot know the choice. A tiny inline script in <head> — generated
// HERE so it cannot drift from the resolver — stamps `data-theme` on <html>
// before first paint, and CSS does the rest. No attribute at all (script
// blocked) never happens: the server already renders data-theme="dark", the
// same as the JS default.

export type ThemeMode = "dark" | "light";

export const THEME_COOKIE = "theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// Browser-chrome colour (<meta name="theme-color">) per theme. Dark matches
// layout.tsx's `viewport.themeColor`; ThemeToggle rewrites the meta on flip.
export const THEME_COLOR: Record<ThemeMode, string> = { dark: "#0c0b14", light: "#f5f4fa" };

export function isThemeMode(v: unknown): v is ThemeMode {
  return v === "dark" || v === "light";
}

// The visitor's saved choice wins; otherwise dark (MTG Compare's default).
export const DEFAULT_THEME: ThemeMode = "dark";

export function resolveThemeMode(saved: string | null | undefined): ThemeMode {
  return isThemeMode(saved) ? saved : DEFAULT_THEME;
}

// Parse the `theme` cookie out of a document.cookie / Cookie-header string.
export function readThemeCookie(cookieString: string): string | null {
  const m = new RegExp(`(?:^|;\\s*)${THEME_COOKIE}=(dark|light)(?:;|$)`).exec(cookieString);
  return m ? m[1] : null;
}

// A localStorage theme key from before the cookie existed. MTG Compare is a new
// origin with no such visitors, so the migration below never fires in
// production; it is kept, with its tests, because it is harmless. The boot
// script moves a stored value into the cookie ONCE and removes the key.
export const LEGACY_THEME_KEY = "mc:theme";

// Inlined in <head> by the root layout. Plain ES5, wrapped in try/catch.
// tests/theme.test.ts runs this string in a sandbox and checks it agrees with
// resolveThemeMode for every cookie value, and that the legacy key migrates.
export const THEME_BOOT_SCRIPT: string = [
  "(function(){try{",
  `var m=/(?:^|;\\s*)${THEME_COOKIE}=(dark|light)(?:;|$)/.exec(document.cookie);`,
  'var v=m?m[1]:"dark";',
  "if(!m){try{",
  `var l=window.localStorage.getItem("${LEGACY_THEME_KEY}");`,
  `if(l==="dark"||l==="light"){v=l;document.cookie="${THEME_COOKIE}="+l+"; path=/; max-age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax";}`,
  `if(l!==null)window.localStorage.removeItem("${LEGACY_THEME_KEY}")`,
  "}catch(e){}}",
  'document.documentElement.setAttribute("data-theme",v)',
  "}catch(e){}})();",
].join("");
