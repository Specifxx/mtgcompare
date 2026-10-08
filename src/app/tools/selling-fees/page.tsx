import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import { pageOg } from "@/lib/og/meta";
import { FeeCalculator } from "@/components/FeeCalculator";
import { HubIntro } from "@/components/HubIntro";
import { RelatedGuides } from "@/components/RelatedGuides";
import { guidesForTool } from "@/lib/content/tool-guides";

// /tools/selling-fees — net proceeds after marketplace fees (RiftCompare's
// selling fee calculator, verbatim, for Magic).
//
// It replaces MTG Compare's wave-1 per-market fee schedules (wave-2 plan, Track 3
// item 4). RiftCompare's rule stands: the tool never prints a "current"
// commission percentage that can go stale — the seller types their own rate
// from their dashboard, and we do the stacked-fee math. Pure: no data reads.
export const revalidate = 86400;

const TITLE = "Magic: The Gathering Selling Fee Calculator — Net Proceeds | MTG Compare";
const DESCRIPTION =
  "Calculate your real net payout after TCGplayer or eBay fees on a Magic: The Gathering card sale — commission, payment processing and shipping, all stacked correctly.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    "TCGplayer fee calculator",
    "Magic: The Gathering selling fees",
    "TCGplayer net proceeds",
    "eBay trading card fees",
    "how much does TCGplayer take",
  ],
  alternates: { canonical: "/tools/selling-fees" },
  openGraph: pageOg("/tools/selling-fees", {
    title: "Magic: The Gathering Selling Fee Calculator",
    description: "Real net payout after marketplace fees — commission, processing and shipping, stacked correctly.",
  }),
};

const FAQS = [
  {
    q: "How much does TCGplayer take from a sale?",
    a: "Two stacked fees: a marketplace commission (a percentage of the item price, tiered by your seller plan) and payment processing (a percentage plus a small fixed fee, applied to the item price plus shipping). The exact percentages depend on your plan and change over time — check your Seller Portal for your current rate, then use the calculator above with your real numbers.",
  },
  {
    q: "Why isn't there a default commission percentage filled in?",
    a: "TCGplayer's commission is tiered by seller plan and both marketplaces adjust their fee schedules periodically. Printing a specific number here that later goes stale would be worse than asking for your real, current rate — so commission is the one field this tool never pre-fills.",
  },
  {
    q: "Does this work for eBay too?",
    a: "Yes — switch the marketplace tab. eBay's final value fee is commonly cited around 13.25% for trading cards, applied to the total including shipping, plus a small per-order fee — but confirm your current rate, since eBay's schedule also changes.",
  },
  {
    q: "Does the calculator include my own shipping cost?",
    a: "Yes — enter what you actually pay for the mailer and postage separately from what you charge the buyer. Marketplace processing fees apply to what you charge the buyer, not what shipping costs you, so the two numbers affect your net differently.",
  },
];

export default function SellingFeesPage() {
  const appLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Magic: The Gathering Selling Fee Calculator",
    url: `${SITE_URL}/tools/selling-fees`,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    description:
      "Free calculator for a seller's real net proceeds after TCGplayer or eBay marketplace commission, payment processing and shipping.",
  };
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: `${SITE_URL}/tools/selling-fees`,
    mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };

  return (
    <div className="mx-auto max-w-4xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([appLd, faqLd]) }} />

      <Breadcrumbs trail={[{ href: "/tools", name: "Tools" }, { name: "Selling Fee Calculator" }]} />
      <div className="mb-5">
        <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">Magic: The Gathering Selling Fee Calculator</h1>
        <HubIntro path="/tools/selling-fees" />
      </div>

      <FeeCalculator />

      {/* The guides behind the numbers, after the calculator. */}
      <RelatedGuides guides={guidesForTool("/tools/selling-fees")} className="card-surface mt-6 p-5" />

      <section className="card-surface mt-6 p-5">
        <h2 className="font-bold text-white">How the math works</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          TCGplayer&apos;s marketplace commission is charged on the item price. eBay&apos;s final value fee is
          charged on the <strong className="text-slate-200">whole order, shipping included</strong>, so the eBay tab
          applies your commission to the item price plus the shipping you charge. Payment processing is a separate
          charge — a percentage plus a small fixed fee — applied to the item price{" "}
          <strong className="text-slate-200">plus</strong> the shipping you charge the buyer, which is why a cheap
          card with expensive shipping still loses a real share of that shipping revenue to fees. Until you enter
          your commission the calculator shows no payout, because the figure would be missing the biggest fee. Your own actual shipping cost (the mailer and postage you pay) comes
          out separately at the end. See{" "}
          <a
            href="https://help.tcgplayer.com/hc/en-us/articles/201357836-Fees"
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-brand-400 hover:underline"
          >
            TCGplayer&apos;s own fee page
          </a>{" "}
          for its current schedule.
        </p>
      </section>

      <section className="card-surface mt-6 divide-y divide-ink-800 overflow-hidden">
        <h2 className="px-6 py-4 text-lg font-extrabold text-white">Frequently asked questions</h2>
        {FAQS.map((f) => (
          <details key={f.q} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 text-sm font-semibold text-slate-200 hover:text-white [&::-webkit-details-marker]:hidden">
              {f.q}
              <span className="shrink-0 text-slate-500 transition-transform group-open:rotate-180" aria-hidden>▾</span>
            </summary>
            <p className="px-6 pb-4 text-sm leading-relaxed text-slate-400">{f.a}</p>
          </details>
        ))}
      </section>

      <p className="mt-6 text-center text-sm text-slate-500">
        Buying instead of selling? <Link href="/tools/box-ev" className="text-brand-400 hover:underline">Try the Booster Box EV Calculator</Link>{" "}
        or <Link href="/browse" className="text-brand-400 hover:underline">browse live prices</Link>.
      </p>
    </div>
  );
}
