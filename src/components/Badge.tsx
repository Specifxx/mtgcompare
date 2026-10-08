import type { CSSProperties } from "react";
import Link from "next/link";
import { COLORS, PRINTINGS, rarityLabel } from "@/lib/constants";

// A `chip` tinted with the data colour at ~16-18% alpha, its text in that colour
// through `.data-ink` (globals.css darkens it in the light theme so it stays
// readable), and solid uppercase chips for the printings a collector hunts.
function hexWithAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

export const RARITY_COLORS: Record<string, string> = {
  M: "#f97316",
  R: "#e9b73a",
  U: "#9aa7b8",
  C: "#7d8794",
  S: "#d946ef",
  P: "#84cc16",
  L: "#22a06b",
  T: "#38bdf8",
};
export function rarityColor(rarity: string | null | undefined): string {
  return (rarity && RARITY_COLORS[rarity]) || RARITY_COLORS.C!;
}

export function ColorBadge({ color, href }: { color: string; href?: string }) {
  const hex = COLORS[color as keyof typeof COLORS]?.hex ?? "#9aa0aa";
  const style = { backgroundColor: hexWithAlpha(hex, 0.18), "--data-ink": hex } as CSSProperties;
  const inner = (
    <>
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: hex }} />
      {color}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="chip data-ink transition-opacity hover:opacity-80" style={style}>
        {inner}
      </Link>
    );
  }
  return (
    <span className="chip data-ink" style={style}>
      {inner}
    </span>
  );
}

export function RarityBadge({ rarity }: { rarity: string }) {
  const hex = rarityColor(rarity);
  return (
    <span className="chip data-ink" style={{ backgroundColor: hexWithAlpha(hex, 0.16), "--data-ink": hex } as CSSProperties}>
      {rarityLabel(rarity)}
    </span>
  );
}

// The solid printing chips on a tile's art, keyed by treatment (constants.ts
// TREATMENTS). Chase treatments get a solid chip; a plain foil gets none (the
// finish tabs say it); anything else shows its label as a quiet chip.
const PRINTING_CHIP: Record<string, { bg: string; ink: string; mark: string } | undefined> = {
  showcase: { bg: "#a259e6", ink: "#fff", mark: "◆ " },
  borderless: { bg: "#f5a524", ink: "#1a1206", mark: "" },
  extended: { bg: "#0891b2", ink: "#04222a", mark: "" },
  serial: { bg: "#e11d48", ink: "#fff", mark: "★ " },
  retro: { bg: "#b45309", ink: "#fff", mark: "" },
  prerelease: { bg: "#0891b2", ink: "#04222a", mark: "✦ " },
};

/** The chip text: the label's first part ("Borderless", "Showcase"), else the treatment's name. */
export function printingChipLabel(printing: string, variant: string | null): string | null {
  if (printing === "standard") return null;
  const first = variant?.split(" · ")[0]?.trim();
  if (first) return first;
  return PRINTINGS[printing]?.label ?? null;
}

export function PrintingBadge({ printing, variant }: { printing: string; variant: string | null }) {
  const label = printingChipLabel(printing, variant);
  if (!label) return null;
  const c = PRINTING_CHIP[printing];
  if (!c) {
    return (
      <span className="chip border border-ink-700 bg-ink-850 text-slate-200" title={label}>
        <span className="truncate">{label}</span>
      </span>
    );
  }
  return (
    <span className="chip font-semibold uppercase" style={{ backgroundColor: c.bg, color: c.ink }} title={label}>
      <span className="truncate">
        {c.mark}
        {label}
      </span>
    </span>
  );
}
