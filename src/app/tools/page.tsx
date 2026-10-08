import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import { pageOg } from "@/lib/og/meta";
import { faqLd, itemListLd } from "@/lib/jsonld";
import { Breadcrumbs } from "@/components/ui";
import { HubFaq } from "@/components/HubFaq";
import { HubIntro } from "@/components/HubIntro";
import { RelatedGuides } from "@/components/RelatedGuides";
import { guidesForTool } from "@/lib/content/tool-guides";
import { DECK_WATCH_LIMIT, FREE_DEMAND_ROWS, FREE_PORTFOLIO_LIMIT, FREE_RISING_ROWS, FREE_WATCHLIST_LIMIT, SEALED_CHECK_CADENCE, SEALED_WATCH_LIMIT_PLUS } from "@/lib/tier-limits";
import { FREE_DEAL_ROWS } from "@/lib/plans";

// /tools — every MTG Compare tool in one place (RiftCompare's /tools hub, its
// groups, names and FAQ, for Magic). The badges state who can use each
// tool, the same gating its own page applies. MTG Compare has Plus configured,
// so RiftCompare's LIST_BADGE is "Plus" here: Deal Finder's full list is Plus;
// Rising Cards' full list, Best Basket and the full Demand Finder are Premium
// (owner, 2026-10-07).
//
// Email is OFF until it is configured (wave-2 plan §1): alerts land in the
// account's notifications, so nothing here promises an email.
const LIST_BADGE = "Plus";

export const revalidate = 86400;

const TITLE = "Free Magic: The Gathering Tools & Calculators | MTG Compare";
const DESCRIPTION =
  "Every MTG Compare tool in one place: box EV, deck and list pricing and trade calculators free for everyone, plus Deal Finder, Rising Cards, Best Basket for buying a whole list for less, and Demand Finder for what players are searching for.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/tools" },
  keywords: ["magic the gathering tools", "magic the gathering card calculator", "magic card value calculator", "magic booster box ev"],
  openGraph: pageOg("/tools", {
    title: "Free Magic: The Gathering Tools & Calculators",
    description: "Box EV, deck and list pricing and trade calculators free for everyone, plus Deal Finder, Rising Cards, Best Basket and Demand Finder.",
  }),
};

// The questions this hub should own in an answer engine. Kept next to the tool
// list so a new tool and its answer move together. THE REAL ACCESS, stated per
// level: emitted as FAQPage JSON-LD too, so a wrong answer here is a wrong
// rich result.
const FAQS = [
  {
    q: "Are the MTG Compare tools free?",
    a: `Most of them. The box EV calculator, deck builder and list pricer, trade calculator, selling fee calculator and sealed prices need no account at all. Deal Finder and Rising Cards show nothing when you're signed out, the top ${FREE_DEAL_ROWS} deals and top ${FREE_RISING_ROWS} rising cards with a free account; every Deal Finder row comes with ${LIST_BADGE}, which is also ad-free, and every Rising Cards pick with Premium. Best Basket is a Premium tool. Demand Finder shows everyone the top ${FREE_DEMAND_ROWS} most searched cards of the week; its full most-searched and most-viewed lists are part of Premium.`,
  },
  {
    q: "What does the Deal Finder do?",
    a: `It lists every Magic card a real store sells for less than TCGplayer's US market price, converted into your currency and ranked by how far below it is, and you can filter it by store and, with ${LIST_BADGE}, narrow it to only the cards on your watchlist. Signed out it shows nothing, a free account sees the top ${FREE_DEAL_ROWS}, and ${LIST_BADGE} shows every row.`,
  },
  {
    q: "Do I need an account to use MTG Compare tools?",
    a: `Not for most of them. Browsing, comparing prices and running the calculators need no account. A free account adds a watchlist of up to ${FREE_WATCHLIST_LIMIT} cards with new-low alerts, a portfolio of up to ${FREE_PORTFOLIO_LIMIT} cards with a set checklist of what each set is missing, and the top rows of Deal Finder and Rising Cards. Plus adds an unlimited watchlist and portfolio (a whole set fits), every Deal Finder row, target-price alerts, sealed watches on up to ${SEALED_WATCH_LIMIT_PLUS} products (an alert when a box is back in stock or at RRP) and an ad-free site; Premium adds Best Basket (the store-by-store plan, at the minimum condition you set), every Rising Cards pick, the full Demand Finder and a deck price watch (a saved list re-priced delivered after every update, up to ${DECK_WATCH_LIMIT} lists).`,
  },
  {
    q: "Which Magic tool should I use to buy a whole decklist?",
    a: "Best Basket. It searches store combinations for the lowest total including postage, and shows the best one-store and two-store orders beside it, with which store to buy each card from. It is a Premium tool.",
  },
  {
    q: "Is a Magic booster box worth opening?",
    a: "Use the box EV calculator: it compares a sealed box's live price against the expected value of its pulls at current singles prices. Bandai publishes no pull rates, so its rates are community estimates set low on purpose, and you can change every one. As a rule, buying the singles you actually want is cheaper than opening product for them.",
  },
];

interface Tool {
  href: string;
  title: string;
  desc: string;
  badge?: string;
}
interface ToolGroup {
  label: string;
  tools: Tool[];
}

const GROUPS: ToolGroup[] = [
  {
    label: "Buying & value",
    tools: [
      {
        href: "/tools/deal-finder",
        title: "Deal Finder",
        desc: `Underpriced vs TCGplayer: the cards a real store sells for less, in your currency, biggest saving first — narrowed, with ${LIST_BADGE}, to only the cards you watch.`,
        badge: LIST_BADGE,
      },
      {
        href: "/tools/rising",
        title: "Rising Cards",
        desc: `Cards with high or rising demand whose price hasn't moved up yet, each with the reason it ranks. The top ${FREE_RISING_ROWS} are free with an account.`,
        badge: "Premium",
      },
      {
        href: "/tools/best-basket",
        title: "Best Basket",
        desc: "Buying a whole list? The cheapest delivered order across your country's stores, postage included, at the condition you'll play.",
        badge: "Premium",
      },
      {
        href: "/tools/demand",
        title: "Demand Finder",
        desc: `The cards players are searching for and opening most, over 7 or 30 days. The top ${FREE_DEMAND_ROWS} most searched this week are free.`,
        badge: "Premium",
      },
    ],
  },
  {
    label: "Your collection",
    tools: [
      {
        href: "/portfolio/sets",
        title: "Set checklist",
        desc: `Tick what's in your binder and see what a set is missing and the cheapest listing for each card, before postage. Free for your first ${FREE_PORTFOLIO_LIMIT} cards; Plus removes the limit.`,
      },
    ],
  },
  {
    label: "Sealed & boxes",
    tools: [
      {
        href: "/tools/box-ev",
        title: "Box EV calculator",
        desc: "Is ripping a booster box worth it? Compare a box's price against the expected pull value.",
      },
      {
        href: "/sealed",
        title: "Sealed prices",
        desc: `Booster boxes, packs, starter decks and premium products priced across stores — and, with Plus, a watch that alerts you on a restock or at RRP, checked ${SEALED_CHECK_CADENCE}.`,
      },
    ],
  },
  {
    label: "Decks, trading & selling",
    tools: [
      {
        href: "/deck",
        title: "Deck builder & list pricer",
        desc: "Build a deck, or paste any card list, and price every card across stores as you go.",
      },
      {
        href: "/trade",
        title: "Trade calculator",
        desc: "Value both sides of a card trade fairly before you commit.",
      },
      {
        href: "/tools/selling-fees",
        title: "Selling fee calculator",
        desc: "What you actually keep selling a card on TCGplayer or eBay, after commission, processing and postage.",
      },
    ],
  },
];

export default function ToolsHubPage() {
  const tools = GROUPS.flatMap((g) => g.tools);
  // CollectionPage ties the hub to the site graph; ItemList and FAQPage as on RiftCompare.
  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Magic: The Gathering Tools & Calculators",
    url: `${SITE_URL}/tools`,
    description: "Every MTG Compare tool and calculator for Magic: The Gathering players, buyers and collectors.",
    isPartOf: { "@type": "WebSite", name: "MTG Compare", url: SITE_URL },
  };
  const ld = [
    collectionLd,
    itemListLd("MTG Compare Tools & Calculators", "/tools", tools.map((t) => ({ name: t.title, path: t.href }))),
    faqLd(FAQS),
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <Breadcrumbs trail={[{ name: "Tools" }]} />

      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Tools &amp; calculators</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
        Every MTG Compare tool in one place. Price-check a card, work out whether a box is worth ripping, and build or
        price decks for less — most need no sign-up at all. A free account adds a watchlist of up to{" "}
        {FREE_WATCHLIST_LIMIT} cards, a portfolio of up to {FREE_PORTFOLIO_LIMIT} and the top rows of each deal list;{" "}
        Plus lifts those limits and shows every deal with no ads, and{" "}
        <span className="text-gold">Premium</span> works out the cheapest way to buy a whole want-list.
      </p>
      <HubIntro path="/tools" />

      {GROUPS.map((group) => (
        <section key={group.label} className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">{group.label}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {group.tools.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="card-surface group flex gap-3 p-4 transition-colors hover:border-ink-600"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-white group-hover:text-brand-300">{t.title}</h3>
                    {t.badge && (
                      <span
                        className={`chip text-[10px] font-semibold ${
                          t.badge === "Premium"
                            ? "bg-gold/20 text-gold"
                            : t.badge === "Plus"
                              ? "bg-slate-500/20 text-slate-300"
                              : "bg-brand-500/15 text-brand-300"
                        }`}
                      >
                        {t.badge}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{t.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}

      {/* The guides that show the tools in use, after the tool list. */}
      <RelatedGuides guides={guidesForTool("/tools")} className="card-surface mt-8 p-5" />

      <HubFaq faqs={FAQS} />
    </div>
  );
}
