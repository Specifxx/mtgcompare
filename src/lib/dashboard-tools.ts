import type { Tier } from "./plans";
import { FREE_DEAL_ROWS, FREE_DEMAND_ROWS, FREE_PORTFOLIO_LIMIT, FREE_RISING_ROWS, FREE_WATCHLIST_LIMIT, DECK_WATCH_LIMIT, SEALED_WATCH_LIMIT_PLUS } from "./tier-limits";

// The member dashboard's tool list (app/dashboard/page.tsx) — RiftCompare's
// lib/dashboard-tools.ts, ported in wave 2 (2026-10-03). A lib module, not a
// const in the page, so tests/premium-tiers.test.ts can run it against
// TIER_COMPARISON (a page file may only export its route fields).
//
// `tier` is the MINIMUM tier that opens the WHOLE tool ("free" = every
// account), and it must match the tool's own gate exactly. `freeTaste` is
// what an account BELOW that tier can already use — it renders as an OPEN link
// labelled with exactly that, never a lock. A paid tool with no taste
// (sealed watches, the deck watch) renders as a lock below its tier.
//
// The numbers in the copy are the enforced constants (lib/tier-limits.ts).
export type DashTool = { title: string; desc: string; href: string; tier: Tier | "free"; freeTaste?: string };

export const DASHBOARD_TOOLS: DashTool[] = [
  {
    title: "Deal Finder",
    desc: "Every card underpriced vs TCGplayer or vs eBay at a real store — narrow it to the cards you watch.",
    href: "/tools/deal-finder",
    tier: "plus",
    freeTaste: `Top ${FREE_DEAL_ROWS} free`,
  },
  {
    title: "Rising Cards",
    desc: "Cards with high or rising demand whose price hasn't moved up yet, each with the reason it ranks.",
    href: "/tools/rising",
    tier: "premium",
    freeTaste: `Top ${FREE_RISING_ROWS} free`,
  },
  {
    title: "Best Basket",
    desc: "The cheapest delivered order for a whole list, or the rest of a set, across your country's stores, skipping cards you own, at the minimum condition you set.",
    href: "/tools/best-basket",
    tier: "premium",
  },
  {
    title: "Demand Finder",
    desc: "The cards players are searching for and opening most, over the last 7 or 30 days.",
    href: "/tools/demand",
    tier: "premium",
    freeTaste: `Top ${FREE_DEMAND_ROWS} free`,
  },
  {
    title: "Watchlist & target alerts",
    desc: `Watch up to ${FREE_WATCHLIST_LIMIT} cards free and see when one hits a new low. Plus adds your own target price; Premium watches a whole deck's delivered price.`,
    href: "/watching",
    tier: "free",
  },
  {
    title: "Sealed watches",
    desc: `Back in stock after selling out everywhere, or at your price — up to ${SEALED_WATCH_LIMIT_PLUS} products on Plus, any on Premium.`,
    href: "/watching#sealed",
    tier: "plus",
  },
  {
    title: "Deck price watch",
    desc: `Save up to ${DECK_WATCH_LIMIT} lists; each is re-priced delivered after every price update, with an alert at your price.`,
    href: "/watching#decks",
    tier: "premium",
  },
  {
    title: "Portfolio",
    desc: "Your collection's value, P&L, CSV export and delivered replacement cost.",
    href: "/portfolio",
    tier: "free",
  },
  {
    title: "Set checklist",
    desc: `What your binder is missing from a set, and the cheapest listing for each card. Free for your first ${FREE_PORTFOLIO_LIMIT} cards; Plus removes the limit.`,
    href: "/portfolio/sets",
    tier: "free",
  },
  {
    title: "Box EV",
    desc: "What a booster box is worth opened, from the cards it can pull, against its price.",
    href: "/tools/box-ev",
    tier: "free",
  },
  {
    title: "Deck pricer",
    desc: "Paste a One Piece Card Game decklist and price every card across every store.",
    href: "/deck",
    tier: "free",
  },
  {
    title: "Trade calculator",
    desc: "Two sides of a trade, priced at today's market, and how far apart they are.",
    href: "/tools/trade",
    tier: "free",
  },
];

/** Does this viewer's tier open the WHOLE tool? Pure. */
export function dashboardToolOpens(toolTier: DashTool["tier"], viewerTier: Tier | null): boolean {
  if (toolTier === "free") return true;
  if (toolTier === "plus") return viewerTier != null;
  return viewerTier === "premium";
}
