// Colour theme (owner, 2026-10-24): dark by default for a visitor who has not chosen, light or dark by their own saved choice
// (localStorage `mc-theme`, set by components/ThemeToggle.tsx). Decided in the visitor's browser before first paint by
// THEME_BOOT_SCRIPT, never on the server: every page is one CDN copy for everyone, so no page reads a cookie or header.
// globals.css keys the dark palette on `:root:not([data-theme="light"])`, so a page without JavaScript is dark too.

export type Theme = "light" | "dark";
export const THEME_KEY = "mc-theme";
export const DEFAULT_THEME: Theme = "dark";

/** The theme a saved value means: "light" or "dark" as saved, anything else (nothing saved, junk) the default. */
export function themeFrom(saved: string | null | undefined): Theme {
  return saved === "light" || saved === "dark" ? saved : DEFAULT_THEME;
}

// Inline, dependency-free, never throws (storage can be blocked). Kept in step with themeFrom() by tests/theme.test.ts.
export const THEME_BOOT_SCRIPT = `(function(){var t="${DEFAULT_THEME}";try{var s=localStorage.getItem("${THEME_KEY}");if(s==="light"||s==="dark")t=s}catch(e){}document.documentElement.setAttribute("data-theme",t)})();`;
