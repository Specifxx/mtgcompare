// The one line /login shows above the buttons when the visitor came from a
// gated page (RiftCompare's CONTEXT_LINES / contextLineFor, OP Compare's
// paths). Pure, so tests/site-chrome.test.ts pins it.
import { FREE_PORTFOLIO_LIMIT } from "./free-limits";

export const CONTEXT_LINES: Record<string, string> = {
  "/watching": "Sign in to see and manage every card you're watching in one place.",
  "/portfolio": "Sign in to track what your collection is worth, live.",
  "/profile": "Sign in to get back to your account.",
  "/dashboard": "Sign in to open your dashboard.",
  "/tools/deal-finder": "Create a free account to see today's top 3 Deal Finder deals.",
  "/tools/rising": "Create a free account to see the top 3 rising cards and why each one ranks.",
  "/tools/best-basket": "Best Basket is a Premium tool: the cheapest delivered order for your list, store by store. Sign in to continue.",
  "/tools/demand": "Sign in to open Demand Finder. The top 10 most searched this week are free; the full most-searched and most-viewed lists are part of Premium.",
};

export const SET_TRACKER_LINE = `Create a free account to tick the cards you own and see what a set is missing, with the cheapest listing for each. Free for your first ${FREE_PORTFOLIO_LIMIT} cards.`;

export function contextLineFor(next: string): string | undefined {
  const path = next.split(/[?#]/)[0];
  if (CONTEXT_LINES[path]) return CONTEXT_LINES[path];
  if (path === "/portfolio/sets" || path.startsWith("/portfolio/sets/")) return SET_TRACKER_LINE;
  if (path.startsWith("/premium")) return "Sign in so your plan is tied to your account. New here? This creates your free account.";
  return undefined;
}
