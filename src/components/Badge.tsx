import type { CSSProperties } from "react";
import Link from "next/link";
import { COLORS, rarityLabel } from "@/lib/constants";

// RiftCompare's Badge.tsx pattern: a `chip` tinted with the data colour at
// ~16–18% alpha, its text in that colour through `.data-ink` (globals.css
// darkens it in the light theme so it stays readable), and solid uppercase
// chips for the printings a collector hunts. One Piece's colours stand in for
// Riftbound's domains, its rarities for Riftbound's.
function hexWithAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

// RiftCompare's rarity hexes where a tier matches (Common, Uncommon, Rare,
// Epic → Super Rare, Showcase → Secret Rare), One Piece's own for the rest.
export const RARITY_COLORS: Record<string, string> = {
  L: "#ef4444",
  C: "#9aa0aa",
  UC: "#30a46c",
  R: "#3b82f6",
  SR: "#a855f7",
  SEC: "#f5a524",
  TR: "#f0b429",
  PR: "#0891b2",
  "DON!!": "#f59e0b",
};
export function rarityColor(rarity: string | null | undefined): string {
  return (rarity && RARITY_COLORS[rarity]) || RARITY_COLORS.C;
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

// The solid printing chips on a tile's art (RiftCompare's VariantBadge,
// OvernumberedBadge, SignatureBadge, UltimateBadge, CrystalRoseBadge and
// PromoBadge). Each One Piece printing takes the RiftCompare chip whose role
// it plays: the alt art keeps "Alt"'s amber, Manga the Ultimate red, SP the
// Overnumbered violet, Treasure Rare the Signature bronze, DON!! the Crystal
// Rose magenta, promos the Promo cyan, special foils the Foil rainbow.
const PRINTING_CHIP: Record<string, { bg: string; ink: string; mark: string } | undefined> = {
  alt: { bg: "#f5a524", ink: "#1a1206", mark: "" },
  manga: { bg: "#dc2626", ink: "#fff", mark: "◆ " },
  sp: { bg: "#7c3aed", ink: "#fff", mark: "★ " },
  treasure: { bg: "#b45309", ink: "#fff", mark: "✦ " },
  don: { bg: "#c026d3", ink: "#fff", mark: "" },
  promo: { bg: "#0891b2", ink: "#04222a", mark: "✦ " },
};

/** The chip text: the variant's first part ("Alternate Art", "Pirate Foil", "Release Event"), else the printing's name. */
export function printingChipLabel(printing: string, variant: string | null): string | null {
  if (printing === "standard" || printing === "reprint") return null;
  const first = variant?.split(" · ")[0]?.trim();
  if (printing === "don") return "DON!!";
  if (first) return first;
  return printing === "promo" ? "Promo" : printing === "sp" ? "SP" : printing === "manga" ? "Manga" : printing === "treasure" ? "Treasure Rare" : null;
}

export function PrintingBadge({ printing, variant }: { printing: string; variant: string | null }) {
  const label = printingChipLabel(printing, variant);
  if (!label) return null;
  if (printing === "foil") {
    return (
      <span
        className="chip font-semibold uppercase"
        style={{ background: "linear-gradient(90deg,#ff0080,#ffea00,#00ffd5,#7a5cff,#ff0080)", color: "#0a0d13" }}
        title={`Special foil (${label})`}
      >
        <span className="truncate">✦ {label}</span>
      </span>
    );
  }
  const c = PRINTING_CHIP[printing];
  if (!c) return null;
  return (
    <span className="chip font-semibold uppercase" style={{ backgroundColor: c.bg, color: c.ink }} title={label}>
      <span className="truncate">
        {c.mark}
        {label}
      </span>
    </span>
  );
}
