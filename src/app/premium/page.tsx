import type { Metadata } from "next";
import Link from "next/link";
import { PremiumProofLine } from "@/components/PremiumProofLine";
import { TierComparisonTable } from "@/components/TierComparisonTable";
import { Breadcrumbs, JsonLd } from "@/components/ui";
import { PLAN_CENTS, PLAN_FEATURES, PLAN_PITCH, TIER_NAMES, TIERS, paidToolRows, planPrice } from "@/lib/plans";
import type { Feature } from "@/lib/premium-gates";
import { FREE_DEAL_ROWS, FREE_DEMAND_ROWS, FREE_RISING_ROWS, PREMIUM_DEMAND_ROWS } from "@/lib/tier-limits";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { stripeEnabled } from "@/lib/stripe";
import { pageOg } from "@/lib/og/meta";
import { PremiumPlans } from "./PremiumPlans";

export const metadata: Metadata = {
  title: "Plus & Premium: Every Deal, Rising Cards and Demand Finder, a Store Plan for Your List",
  description: `Comparing Magic card prices on ${SITE_NAME} is free. Plus (${planPrice("plus", "month")}/mo) shows every Deal Finder deal with no ads; Premium (${planPrice("premium", "month")}/mo) adds the full Rising Cards and Demand Finder lists and plans which stores to buy your list from.`,
  alternates: { canonical: "/premium" },
  openGraph: pageOg("/premium"),
};

const FAQ = [
  {
    q: `Is ${SITE_NAME} still free?`,
    a: "Yes. Every card price, every store, the price guide, sets, sealed, movers and the watchlist stay free with no account. Plus and Premium add tools on top.",
  },
  {
    q: "What does the Deal Finder show without a plan?",
    a: `Signed out, a preview of how it works. With a free account, the top ${FREE_DEAL_ROWS} deals in your market. Plus and Premium show every deal at every price level.`,
  },
  {
    q: "What do Rising Cards and Demand Finder show without a plan?",
    a: `Rising Cards: signed out, a preview of how it works; a free account or Plus shows the top ${FREE_RISING_ROWS} picks with the reason for each; Premium shows every pick, in every market. Demand Finder: everyone sees the top ${FREE_DEMAND_ROWS} most searched cards of the last 7 days; Premium shows the top ${PREMIUM_DEMAND_ROWS} by searches and by card views over 7 or 30 days. Prices, the card database and price movers stay free for everyone.`,
  },
  {
    q: "What is Best Basket?",
    a: "Paste a deck or send your watchlist, and it works out the cheapest delivered way to buy it across the stores in your market, each store's measured postage included. Any signed-in account sees its own delivered total; Premium shows which store to buy each card from, beside the best one-store and two-store orders, at the minimum condition you set.",
  },
  {
    q: "How do I cancel?",
    a: "From your account page: Manage subscription opens Stripe's billing portal, where you can cancel, switch between Plus and Premium or monthly and yearly, and see invoices. You keep access to the end of the period you paid for.",
  },
  {
    q: "Who handles the payment?",
    a: "Stripe. We never see or store your card details.",
  },
];

// What the three paid tools show each viewer, in words (lib/plans.ts paidToolRows,
// written from the gate's own gateMatrix: the table that decides how many rows a
// loader returns), so this section and the gate cannot disagree. A line about each
// tool's use is the only copy typed here.
const TOOL_BLURB: Record<Feature, string> = {
  "deal-finder": "Every card a real store sells under TCGplayer's market price, in your market, at every price level.",
  rising: "The cards demand and price timing say are about to move, with the reason for each pick.",
  demand: "The most searched and most viewed cards, over 7 or 30 days, with the movement against the window before.",
};
const TOOL_COLUMNS = ["Signed out", "Free account", "Plus", "Premium"] as const;

// Pricing first (the owner's "pricing at the very top"): a one-line heading,
// then the two plans side by side at every width, so both buttons sit in the
// first screen of a phone. Members see their subscription there instead
// (PremiumPlans, client-side). Then the proof line, what each tier gets, the
// shared comparison table and the FAQ. While Stripe is not configured every
// button reads "Opening soon", as before.
export default function Premium() {
  const open = stripeEnabled();
  return (
    <div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: `${SITE_NAME} Plus and Premium`,
          description: "Every Magic: The Gathering deal with no ads (Plus), and the full Rising Cards and Demand Finder lists and the cheapest store plan for your list (Premium).",
          url: `${SITE_URL}/premium`,
          brand: { "@type": "Brand", name: SITE_NAME },
          offers: TIERS.map((t) => ({
            "@type": "Offer",
            name: TIER_NAMES[t],
            price: (PLAN_CENTS[t].month / 100).toFixed(2),
            priceCurrency: "USD",
            url: `${SITE_URL}/premium`,
            availability: open ? "https://schema.org/InStock" : "https://schema.org/PreOrder",
          })),
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
        }}
      />
      <Breadcrumbs trail={[{ name: "Plus & Premium" }]} />
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="font-display text-2xl font-extrabold leading-tight text-white sm:text-4xl">Find the deals. Buy them for less.</h1>
        <p className="mt-1.5 text-sm text-slate-300 sm:text-[15px]">Comparing prices is free. Plus shows every deal with no ads; Premium adds Rising Cards and Demand Finder and plans your list.</p>
      </div>
      <div className="mt-4 sm:mt-6" id="top-pricing">
        <PremiumPlans checkoutOpen={open} />
      </div>
      <PremiumProofLine />

      <section className="mx-auto mt-12 max-w-4xl" aria-labelledby="what-you-get">
        <h2 id="what-you-get" className="text-2xl text-white">
          What you get
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {TIERS.map((t) => (
            <div key={t} className="card-surface p-5">
              <p className="flex items-baseline justify-between gap-2">
                <span className="text-lg font-bold text-white">{TIER_NAMES[t]}</span>
                <span className="num text-sm text-slate-400">{planPrice(t, "month")}/mo</span>
              </p>
              <p className="mt-0.5 text-sm text-gold">{PLAN_PITCH[t]}</p>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] text-slate-300">
                {PLAN_FEATURES[t].map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-10 max-w-4xl" aria-labelledby="paid-tools">
        <h2 id="paid-tools" className="text-2xl text-white">
          The three paid tools
        </h2>
        <p className="mt-1 text-sm text-slate-400">Our own analysis is what the plans unlock. Card names, images, prices, charts and search stay free for everyone.</p>
        <div className="mt-3 overflow-x-auto rounded-lg border border-ink-800 bg-ink-900">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-left">
                <th scope="col" className="px-3 py-2.5 font-semibold text-slate-400">
                  Tool
                </th>
                {TOOL_COLUMNS.map((c) => (
                  <th key={c} scope="col" className="px-2 py-2.5 text-center text-xs font-bold text-slate-300 sm:text-sm">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paidToolRows().map((r) => (
                <tr key={r.feature} className="border-b border-ink-800 last:border-0 align-top">
                  <th scope="row" className="px-3 py-2.5 text-left font-normal text-slate-200">
                    <Link href={r.path} className="font-semibold text-white hover:underline">
                      {r.label}
                    </Link>
                    <span className="mt-0.5 block text-xs text-slate-400">{TOOL_BLURB[r.feature]}</span>
                    <span className="mt-0.5 block text-[11px] text-gold">From {r.from}</span>
                  </th>
                  {[r.signedOut, r.free, r.plus, r.premium].map((text, i) => (
                    <td key={TOOL_COLUMNS[i]} className="px-2 py-2.5 text-center text-xs font-semibold text-slate-300">
                      {text}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mx-auto mt-10 max-w-3xl" aria-labelledby="compare">
        <h2 id="compare" className="text-2xl text-white">
          Free, Plus and Premium
        </h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-ink-800 bg-ink-900">
          <TierComparisonTable tinted />
        </div>
      </section>

      <section className="mx-auto mt-10 max-w-3xl" aria-labelledby="faq">
        <h2 id="faq" className="mb-3 text-2xl text-white">
          Questions
        </h2>
        <dl className="divide-y divide-ink-800 rounded-lg border border-ink-800 bg-ink-900">
          {FAQ.map((f) => (
            <div key={f.q} className="px-5 py-4">
              <dt className="font-semibold text-slate-100">{f.q}</dt>
              <dd className="mt-1.5 text-[15px] leading-relaxed text-slate-300">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
