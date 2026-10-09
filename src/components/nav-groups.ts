import { FEATURE_RULES, type GateTier } from "@/lib/premium-gates";
import { DISCORD_URL } from "@/lib/site";
import type { NavIconName } from "./NavIcon";

// The grouped site navigation — RiftCompare's nav-groups.ts in shape, group
// titles and order, with MTG Compare's routes. ONE list feeds the desktop rail
// (SideNav), the phone menu (CinematicNavMenu), the ⌘K launcher
// (CommandLauncher), the rail's feature search (nav-search.ts) and the footer
// site map (FOOTER_GROUPS below), so a link is edited here once.
//
// Dropped from RiftCompare's list (wave-2 plan §3 track 1): Games (the owner:
// "drop the games"), For stores, and every Riftbound-only page (champions, the
// ban list, domains, Riftle, the Pokémon section, the Radiance hub).
//
// Some routes are built by other packages (commanders, widgets, creators).
// tests/nav-routes.test.ts checks every internal href against src/app, and that
// none of them is a page that only redirects.
export interface NavGroupLink {
  href: string;
  label: string;
  /**
   * An off-site link (Discord). Every renderer branches on it (FooterNav,
   * CinematicNavMenu, CommandLauncher, SideNav): next/link is for routes, and
   * the launcher's router.push would break on an https:// URL.
   */
  external?: boolean;
  keywords?: string[];
  hideInFooter?: boolean;
  /**
   * The cheapest plan with full access to a paid tool, read from premium-gates.ts (the one source of who gets what): every renderer prints it as a
   * small chip after the label, so the rail, the phone menu, the launcher and the footer say Plus where it is Plus and Premium where it is Premium.
   */
  plan?: GateTier;
}

export interface NavGroup {
  title: string;
  icon?: NavIconName;
  links: NavGroupLink[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Prices",
    icon: "prices",
    links: [
      { href: "/browse", label: "Card Database", keywords: ["cards", "search", "find", "lookup", "compare prices", "database", "singles"] },
      { href: "/price-guide", label: "Price Guide", keywords: ["price list", "price guide", "card values", "all prices", "value"] },
      { href: "/sealed", label: "Sealed Products", keywords: ["booster box", "play booster", "collector booster", "packs", "boxes", "bundle", "commander deck", "secret lair", "prerelease pack", "cases", "sealed"] },
      { href: "/market", label: "Market Index", keywords: ["index", "market", "chart", "trend", "how is the market"] },
      { href: "/market/records", label: "Price records", keywords: ["records", "all time high", "most expensive ever", "highs", "lows"] },
      { href: "/movers", label: "Weekly Movers", keywords: ["movers", "risers", "fallers", "gainers", "drops", "trending", "biggest movers"] },
      { href: "/stores", label: "Stores we track", keywords: ["stores", "shops", "retailers", "which stores"] },
    ],
  },
  {
    title: "Guides & News",
    icon: "news",
    links: [
      { href: "/guides", label: "Guides", keywords: ["guides", "how to", "tutorials", "explainers", "rarities", "where to buy"] },
      { href: "/blog", label: "Blog", keywords: ["blog", "news", "articles", "posts", "updates", "announcements", "analysis"] },
      { href: "/keywords", label: "Keywords glossary", keywords: ["keywords", "glossary", "mechanics", "rules", "flying", "trample", "deathtouch", "haste", "ward", "cascade", "what does"] },
      { href: "/creators", label: "Creators", keywords: ["creators", "youtube", "streamers", "content creators", "socials", "community"] },
      { href: "/authors", label: "Who writes this", keywords: ["authors", "team", "byline", "who writes"] },
      { href: "/editorial-policy", label: "Editorial policy", keywords: ["editorial", "policy", "standards", "corrections"] },
    ],
  },
  {
    title: "The card database",
    icon: "browse",
    links: [
      { href: "/sets", label: "Sets & card lists", keywords: ["sets", "set list", "card list", "expansion", "modern horizons", "commander precon", "secret lair", "set code", "core set"] },
      { href: "/commanders", label: "Commanders", keywords: ["commanders", "commander", "edh", "legendary creatures", "identity", "by commander"] },
      { href: "/colors", label: "Colours", keywords: ["colors", "colours", "white", "blue", "black", "red", "green", "colorless", "multicolor", "wubrg"] },
      { href: "/cards", label: "By type & rarity", keywords: ["type", "rarity", "treatment", "foil", "etched", "borderless", "showcase", "extended art", "serialized", "mythic", "rare", "creature", "instant", "planeswalker"] },
      { href: "/cards/all", label: "Every card (A-Z)", keywords: ["all cards", "every card", "full list", "complete list", "card index", "a-z", "list of all magic cards"] },
      { href: "/gallery", label: "Card gallery", keywords: ["gallery", "card gallery", "full art", "browse art", "card images"] },
      // No "Pre-order prices" entry: there is no pre-order page (/preorders only redirects here). The sets still to come are listed on /release-dates and each
      // links to its set page, where pre-order listings are priced, so the pre-order words land here.
      { href: "/release-dates", label: "Release dates", keywords: ["release date", "release dates", "countdown", "when", "next set", "upcoming", "when does the next set come out", "preorder", "pre-order", "pre order", "presale", "upcoming set", "prerelease", "release week"] },
      { href: "/singles", label: "Buy singles", keywords: ["singles", "buy singles", "cheapest single"] },
    ],
  },
  {
    title: "Decks",
    icon: "decks",
    links: [
      { href: "/deck", label: "Deck Builder & Pricer", keywords: ["build a deck", "deck price", "deck cost", "decklist", "decks", "bulk", "bulk pricer", "price a list", "paste a list", "bulk price checker"] },
      { href: "/decks", label: "Deck Library", keywords: ["decks", "decklists", "magic decks", "published decks", "budget decks", "commander decks", "edh decks"] },
    ],
  },
  {
    title: "Deals & value",
    icon: "deals",
    links: [
      { href: "/tools/deal-finder", label: "Deal Finder", plan: FEATURE_RULES["deal-finder"].minTier, keywords: ["deals", "bargains", "cheapest", "savings", "arbitrage", "underpriced", "undervalued", "best value"] },
      { href: "/tools/rising", label: "Rising Cards", plan: FEATURE_RULES.rising.minTier, keywords: ["rising", "hot", "momentum", "spiking", "going up"] },
      { href: "/tools/best-basket", label: "Best Basket", keywords: ["basket", "cart", "multi card", "cheapest combination", "one order", "shipping", "buy list"] },
      { href: "/tools/demand", label: "Demand Finder", plan: FEATURE_RULES.demand.minTier, keywords: ["demand", "most viewed", "most searched", "popular cards", "what players are searching for", "search trends"] },
      { href: "/tools/box-ev", label: "Box EV Calc", keywords: ["ev", "expected value", "is a box worth it", "booster box value", "play booster", "collector booster", "box ev", "box value"] },
      { href: "/trade", label: "Trade Calculator", keywords: ["trade", "swap", "fair trade", "is this trade fair"] },
      { href: "/tools/selling-fees", label: "Selling Fee Calc", keywords: ["tcgplayer fees", "ebay fees", "selling fees", "net proceeds", "marketplace commission", "payout"] },
      { href: "/embed", label: "Widgets & embeds", keywords: ["embed", "widget", "price badge", "badge", "iframe", "add to my site", "backlink"] },
      { href: "/tools", label: "All Tools", keywords: ["tools", "calculators", "utilities"] },
    ],
  },
  {
    title: "Your collection",
    icon: "collection",
    links: [
      { href: "/watching", label: "My Watchlist", keywords: ["watchlist", "watching", "saved", "favourites", "favorites", "tracked cards"] },
      { href: "/portfolio", label: "My Binder", keywords: ["collection", "my cards", "holdings", "portfolio", "binder", "what is mine worth"] },
      { href: "/portfolio/sets", label: "Set checklist", keywords: ["set checklist", "master set", "completion", "missing cards", "set progress"] },
      { href: "/dashboard", label: "Dashboard", keywords: ["dashboard", "my account", "overview", "plus", "premium dashboard"] },
      { href: "/alerts", label: "Price Alerts", keywords: ["alerts", "price alerts", "notify me", "notifications", "price drop"] },
      { href: "/premium", label: "Premium", keywords: ["premium", "plus", "upgrade", "subscription", "pro", "plans", "pricing", "no ads"] },
    ],
  },
  {
    title: "Help",
    icon: "help",
    links: [
      { href: "/support", label: "Support", keywords: ["support", "help", "faq", "problem", "issue", "something is broken", "billing"] },
      { href: "/contact", label: "Contact & feedback", keywords: ["contact", "email", "get in touch", "reach us"] },
      { href: "/feedback", label: "Suggest a feature", keywords: ["feedback", "suggest", "idea", "feature request"] },
      { href: "/stores/suggest", label: "Suggest a store", keywords: ["suggest a store", "add a store", "missing store", "list my store"] },
      { href: "/methodology", label: "Methodology", keywords: ["methodology", "how we compare", "condition", "fx", "currency", "ranking"] },
      { href: "/about", label: "About MTG Compare", keywords: ["about", "who we are", "mtg compare", "compare"] },
      { href: "/privacy", label: "Privacy policy", keywords: ["privacy", "privacy policy", "cookies", "personal data", "gdpr", "data protection"], hideInFooter: true },
      { href: "/terms", label: "Terms of service", keywords: ["terms", "terms of service", "terms of use", "tos", "conditions"], hideInFooter: true },
      ...(DISCORD_URL ? [{ href: DISCORD_URL, label: "Join our Discord", keywords: ["discord", "community", "chat", "server"], external: true }] : []),
    ],
  },
];

// The header's text links (RiftCompare keeps this export; its Navbar hard-codes
// the same links in its own markup).
export const PRIMARY_NAV: { href: string; label: string }[] = [
  { href: "/browse", label: "Cards" },
  { href: "/sealed", label: "Sealed" },
  { href: "/market", label: "Index" },
  { href: "/blog", label: "Blog" },
];

const byTitle = Object.fromEntries(NAV_GROUPS.map((g) => [g.title, g.links.filter((l) => !l.hideInFooter)]));

// The footer site map: RiftCompare's four columns, re-bucketed from the groups
// above (its third column drops "& games" with the games).
export const FOOTER_GROUPS: NavGroup[] = [
  {
    title: "Shop",
    links: [...(byTitle["Prices"] ?? [])],
  },
  {
    title: "Cards & collection",
    links: [...(byTitle["The card database"] ?? []), ...(byTitle["Your collection"] ?? [])],
  },
  {
    title: "Tools & decks",
    links: [...(byTitle["Deals & value"] ?? []), ...(byTitle["Decks"] ?? [])],
  },
  {
    title: "Learn & help",
    links: [...(byTitle["Guides & News"] ?? []), ...(byTitle["Help"] ?? [])],
  },
];
