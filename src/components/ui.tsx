// Small shared presentational pieces: breadcrumbs, stat tiles, badges,
// section headers, the "in short" box and FAQ — RiftCompare's page furniture.
import Link from "next/link";
import { ColorBadge as ChipColorBadge, RarityBadge as ChipRarityBadge } from "./Badge";
import { COLORS, PRINTINGS, RARITIES, isColor } from "@/lib/constants";

// RiftCompare's Breadcrumbs (components/Breadcrumbs.tsx): `trail` of { name, href },
// BreadcrumbList JSON-LD included. Re-exported here for the pages that import it from ui.
export { Breadcrumbs } from "./Breadcrumbs";

export function StatTile({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string }) {
  return (
    <div className="card-surface p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`num mt-1 text-2xl font-bold ${tone ?? "text-accent"}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-slate-400">{sub}</p> : null}
    </div>
  );
}

export function ColorDots({ colors, size = "h-2.5 w-2.5" }: { colors: string[]; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={colors.join(" / ")}>
      {colors.map((c) => (
        <span key={c} className={`${size} rounded-full ring-1 ring-black/30`} style={{ background: isColor(c) ? COLORS[c].hex : "#888" }} />
      ))}
    </span>
  );
}

// RiftCompare's Badge.tsx chip + data-ink pattern (components/Badge.tsx).
export function ColorBadge({ color }: { color: string }) {
  return <ChipColorBadge color={color} href={`/colors/${color.toLowerCase()}`} />;
}

export function RarityBadge({ rarity }: { rarity: string | null }) {
  if (!rarity) return null;
  return <ChipRarityBadge rarity={rarity} />;
}

export function PrintingBadge({ printing, variant }: { printing: string; variant?: string | null }) {
  if (printing === "standard") return null;
  const p = PRINTINGS[printing];
  return (
    <span className="chip border border-ink-700 bg-ink-850 text-slate-200">
      <span className="h-2 w-2 rounded-full" style={{ background: p?.dot ?? "#888" }} />
      {variant || p?.label || printing}
    </span>
  );
}

export function SectionHeader({ title, sub, action }: { title: string; sub?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-2xl text-white">{title}</h2>
        {sub ? <p className="mt-1 text-[15px] text-slate-400">{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function InShort({ children }: { children: React.ReactNode }) {
  return (
    <div className="card-surface border-l-2 border-l-brand-500 p-5">
      <p className="rb-eyebrow text-slate-500 mb-2">In short</p>
      <div className="max-w-3xl text-[15px] leading-relaxed text-slate-200">{children}</div>
    </div>
  );
}

export function Faq({ items }: { items: { q: string; a: React.ReactNode }[] }) {
  return (
    <div className="divide-y divide-ink-800 rounded-lg border border-ink-800 bg-ink-900">
      {items.map((it) => (
        <details key={it.q} className="group px-5 py-4">
          <summary className="cursor-pointer list-none font-semibold text-slate-100 marker:hidden">
            <span className="flex items-center justify-between gap-4">
              {it.q}
              <span className="text-slate-500 transition-transform group-open:rotate-45">+</span>
            </span>
          </summary>
          <div className="mt-2 text-[15px] leading-relaxed text-slate-300">{it.a}</div>
        </details>
      ))}
    </div>
  );
}

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export function Delta({ v, className = "" }: { v: number | null | undefined; className?: string }) {
  if (v == null || !Number.isFinite(v)) return <span className={`num text-slate-500 ${className}`}>—</span>;
  const up = v > 0;
  return (
    <span className={`num font-semibold ${v === 0 ? "text-slate-400" : up ? "text-up" : "text-down"} ${className}`}>
      {up ? "+" : ""}
      {v.toFixed(1)}%
    </span>
  );
}

