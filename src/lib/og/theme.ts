// Share-image (Open Graph) tokens and formatters. Pure: no Next, no Prisma, so
// the compositions, the tests and scripts/render-og.tsx can all import it.
// Colours are the site's dark "night sea" palette (globals.css, tailwind.config).
import { COUNTRIES, type Country } from "../country";
import { PRINTINGS, RARITIES } from "../constants";

export const OG_SIZE = { width: 1200, height: 630 } as const;

/** 6 h — the same as TTL in lib/data.ts; the import's revalidateTag("prices") refreshes sooner. */
export const OG_REVALIDATE = 21600;

export const OG = {
  page: "#070c16",
  ink900: "#0a111e",
  ink850: "#0e1728",
  ink800: "#141f34",
  ink700: "#212f4b",
  red: "#d92b33",
  redWord: "#ff4d55",
  straw: "#f5c542",
  white: "#ffffff",
  slate100: "#f1f5f9",
  slate300: "#cbd5e1",
  slate400: "#9aa8be",
  slate500: "#8997ad",
  accent: "#eef1f5",
  up: "#3fb950",
  down: "#f06278",
} as const;

/** The site's --hero-sea, in the unsized radial-gradient form satori accepts. */
export const SEA_BG =
  "radial-gradient(circle at 50% -30%, rgba(217,43,51,0.32) 0%, rgba(217,43,51,0) 55%), radial-gradient(circle at 95% 0%, rgba(245,197,66,0.13) 0%, rgba(245,197,66,0) 40%)";

/** Dark-theme values of the rarity tone classes in RARITIES (text-rose-300 …). */
const RARITY_TONE: Record<string, string> = {
  SEC: "#fda4af",
  SR: "#d8b4fe",
  L: "#fcd34d",
  R: "#7dd3fc",
  UC: "#6ee7b7",
  C: "#cbd5e1",
  TR: "#fde68a",
  PR: "#bef264",
  "DON!!": "#fcd34d",
};

export function rarityTone(r: string | null | undefined): string {
  return (r && RARITY_TONE[r]) || OG.slate300;
}

export function rarityText(r: string | null | undefined): string | null {
  if (!r) return null;
  return RARITIES[r]?.label ?? r;
}

export function printingDot(p: string): string {
  return PRINTINGS[p]?.dot ?? "#7d8794";
}

/** The markets line, written out: flag glyphs would make satori fetch an emoji font per render. */
export const MARKETS_LINE = "US · AU · UK · SG · CA · EU";

/** When a card or product has no US listing, the market whose listing leads instead. */
export const OG_FALLBACK_ORDER: Country[] = ["US", "EU", "UK", "CA", "AU", "SG"];

/**
 * Prices for a share image: whole units from 100 upwards and cents below, so a
 * mono column lines up (69900 → "US$699", 1234 → "US$12.34", 398001 → "US$3,980").
 */
export function ogMoney(cents: number | null | undefined, country: Country = "US"): string {
  if (cents == null || !Number.isFinite(cents)) return "—";
  const v = cents / 100;
  const d = v >= 100 ? 0 : 2;
  return `${COUNTRIES[country].symbol}${v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}

/** Truncate to n characters with an ellipsis. */
export function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

/** The printing badge: the variant when it fits, else the printing's short label. */
export function badgeText(c: { variant: string | null; printing: string }): string {
  if (c.variant && c.variant.length <= 26) return c.variant;
  return PRINTINGS[c.printing]?.label ?? c.variant ?? "Standard";
}

/** "+12.4%" / "-3.1%" with its colour, or "—" for no move. No arrows, to match <Delta>. */
export function ogDelta(v: number | null | undefined): { text: string; color: string } {
  if (v == null || !Number.isFinite(v) || Math.abs(v) < 0.05) return { text: "—", color: OG.slate500 };
  return { text: `${v > 0 ? "+" : ""}${v.toFixed(1)}%`, color: v > 0 ? OG.up : OG.down };
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "30 Sep 2025": always a 3-letter month (en-GB's short month is the 4-letter "Sept"), so a date is at most 11 characters. */
export function ogDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "";
  return `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
}

/** Truncate to at most n characters at a word boundary (never inside a word, hyphenated or not), with an ellipsis. */
export function clipWords(s: string, n: number): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  const sp = cut.lastIndexOf(" ");
  const head = (sp > n / 3 ? cut.slice(0, sp) : cut).replace(/[\s:;,.\-–—(]+$/, "");
  return `${head}…`;
}

/**
 * "Starter Deck 3: The Seven Warlords of The Sea (Super Pre-Release Edition)" →
 * { title: "Starter Deck 3: The Seven Warlords of The Sea", edition: "Super Pre-Release Edition" }.
 * A trailing parenthetical is an edition note, not the name: it goes to the eyebrow.
 */
export function splitEdition(name: string): { title: string; edition: string | null } {
  const m = name.match(/^(.{6,}?)\s*\(([^()]{2,})\)\s*$/);
  return m ? { title: m[1].trim(), edition: m[2].trim() } : { title: name, edition: null };
}

/** The set title's display size: three steps so a long name keeps to about four lines in its 396px column. */
export function setTitleSize(title: string): number {
  return title.length > 40 ? 40 : title.length > 22 ? 48 : 58;
}

// The set image's stats row (values in JetBrains Mono, labels in Inter caps),
// measured the way satori lays it out, so the row is checked before it is drawn.
export const SET_STATS = { width: 396, value: 22, label: 15, gap: 18 } as const;
/** JetBrains Mono's advance is 0.6 em for every glyph. */
const MONO_EM = 0.6;
/** Inter Bold caps average ≤0.68 em (measured: "PRINTINGS" 0.63); plus the label's letter-spacing. */
const CAPS_EM = 0.68;
const LABEL_TRACK = 1.2;

export function statWidth([value, label]: [string, string]): number {
  const v = value.length * MONO_EM * SET_STATS.value;
  const l = label.length * (CAPS_EM * SET_STATS.label + LABEL_TRACK);
  return Math.ceil(Math.max(v, l));
}

/**
 * The stats that fit the set image's left column: drops "top card" first, then
 * anything after the first, until the row's measured width fits.
 */
export function fitStats(items: [string, string][], width: number = SET_STATS.width): [string, string][] {
  const total = (xs: [string, string][]) => xs.reduce((w, x, i) => w + statWidth(x) + (i ? SET_STATS.gap : 0), 0);
  let out = items;
  if (total(out) > width) out = out.filter(([, l]) => l !== "top card");
  while (out.length > 1 && total(out) > width) out = out.slice(0, -1);
  return out;
}
