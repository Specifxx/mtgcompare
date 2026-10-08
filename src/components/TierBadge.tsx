import { TIER_NAMES, type Tier } from "@/lib/plans";

// The plan an account is on, as one small chip (RiftCompare's TierBadge, which
// colours a deck's tier; here the tier is the account's plan). Flat, low-
// saturation colours with a ring, the same three the comparison table uses:
// brass marks Premium (so the Free chip never wears it), slate marks Plus, ink
// marks a free account. Server-renderable; `children` replaces the label when a
// surface names the plan's headline benefit ("Plus · ad-free").
const STYLE: Record<Tier | "free", string> = {
  free: "bg-ink-700 text-slate-300",
  plus: "bg-slate-500/15 text-slate-200",
  premium: "bg-gold/15 text-gold",
};

export function TierBadge({ tier, className = "", children }: { tier: Tier | null; className?: string; children?: React.ReactNode }) {
  const key = tier ?? "free";
  const name = tier ? TIER_NAMES[tier] : "Free";
  return (
    <span className={`chip text-[10px] font-bold uppercase tracking-wider ${STYLE[key]} ${className}`} data-tier={key} title={`${name} plan`}>
      {children ?? name}
    </span>
  );
}
