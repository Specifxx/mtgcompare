import { SITE } from "@/site.config";

const rgb = (hex: string) => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(" ");
};

/** The dark-theme variables, from SITE.theme. */
export function themeCss(): string {
  const t = SITE.theme;
  const [i950, i900, i850, i800, i700, i600] = t.inkDark;
  return `:root{--page-bg:${t.pageDark};--wordmark:${t.wordmarkGradient};--c-brand:${rgb(t.brand)};--c-brand-light:${rgb(t.brandLight)};--c-brand-dark:${rgb(t.brandDark)};--c-accent:${rgb(t.accent)};--c-ink-950:${rgb(i950)};--c-ink-900:${rgb(i900)};--c-ink-850:${rgb(i850)};--c-ink-800:${rgb(i800)};--c-ink-700:${rgb(i700)};--c-ink-600:${rgb(i600)};--c-fg:236 238 245;--c-muted:150 158 182;--font-sans:Inter,ui-sans-serif,system-ui;--font-display:"${t.displayFont}",Georgia,serif}`;
}
