import type { OfferStock } from "@/lib/sealed-offers";

const STYLE: Record<OfferStock | "pre", string> = {
  open: "bg-open-soft text-open",
  pre: "bg-pre-soft text-pre",
  soldout: "bg-sold-soft text-sold",
  unknown: "bg-stale-soft text-stale",
};

const SIZE = {
  md: "gap-1.5 px-2.5 py-1 text-xs",
  // A product card's: one 20px line that fits a 2-up phone card ("In stock · 12 stores").
  sm: "gap-1 px-2 py-0.5 text-[11px] leading-4",
};

export function StockPill({ state, preorder = false, size = "md", className = "", children }: { state: OfferStock; preorder?: boolean; size?: keyof typeof SIZE; className?: string; children: React.ReactNode }) {
  const key = state === "open" && preorder ? "pre" : state;
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full font-semibold ${SIZE[size]} ${STYLE[key]} ${className}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full bg-current ${state === "open" ? "animate-pulse" : ""}`} aria-hidden="true" />
      {children}
    </span>
  );
}
