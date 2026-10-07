// The properties of a Vercel Web Analytics `buy_click` custom event. Pure and
// client-safe (tests/buy-click.test.ts). Sent to Vercel's own analytics, never
// to our database: outbound clicks stopped being written to Postgres on
// 2026-10-05 because every row cost network credits.
//
// A link opts in with the attributes every buy link already carries:
// data-retailer ("store:<key>", "tcgplayer", "ebay_search" …), data-page,
// data-card (the product's slug) and data-surface (the block on the page).
export type BuyClickProps = { retailer: string; network: "store" | "tcgplayer" | "ebay" | "other"; page: string; surface?: string; card?: string };

const clip = (v: string | null | undefined, max = 120): string | undefined => {
  const s = (v ?? "").trim().toLowerCase().slice(0, max);
  return s ? s : undefined;
};

/** Which kind of seller a data-retailer key is, so Vercel can break clicks down without a per-store list. */
export function networkOf(retailer: string): BuyClickProps["network"] {
  if (retailer.startsWith("ebay")) return "ebay";
  if (retailer.startsWith("tcgplayer")) return "tcgplayer";
  return retailer.startsWith("store:") || /^[a-z0-9][a-z0-9_.-]*$/.test(retailer) ? "store" : "other";
}

/** First path segment, or "home": the page type when a link carries no data-page. */
export function pageFromPath(pathname: string): string {
  return pathname.split("/")[1] || "home";
}

/** The event's properties for one clicked link, or null when it carries no retailer. */
export function buyClickProps(attrs: { retailer: string | null; page: string | null; card: string | null; surface: string | null }, pathname: string): BuyClickProps | null {
  const retailer = clip(attrs.retailer, 60);
  if (!retailer) return null;
  const out: BuyClickProps = { retailer, network: networkOf(retailer), page: clip(attrs.page, 40) ?? pageFromPath(pathname) };
  const surface = clip(attrs.surface, 60);
  const card = clip(attrs.card, 160);
  if (surface) out.surface = surface;
  if (card) out.card = card;
  return out;
}
