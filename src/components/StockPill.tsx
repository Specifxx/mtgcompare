import type { OfferStock } from "@/lib/sealed-offers";

// Short classes from globals.css (.sp-*, site review X1 2026-11-10): a price table draws a pill on every row, so the utility lists
// were repeated 80 times. The dot is the pill's ::before (pulsing when open), not a child span.
const STYLE: Record<OfferStock | "pre", string> = {
  open: "sp-open",
  pre: "sp-pre",
  soldout: "sp-sold",
  unknown: "sp-stale",
};

const SIZE = {
  md: "sp",
  // A product card's: one 20px line that fits a 2-up phone card ("In stock · 12 stores").
  sm: "sp sp-sm",
};

export function StockPill({ state, preorder = false, size = "md", className = "", children }: { state: OfferStock; preorder?: boolean; size?: keyof typeof SIZE; className?: string; children: React.ReactNode }) {
  const key = state === "open" && preorder ? "pre" : state;
  return <span className={className ? `${SIZE[size]} ${STYLE[key]} ${className}` : `${SIZE[size]} ${STYLE[key]}`}>{children}</span>;
}
