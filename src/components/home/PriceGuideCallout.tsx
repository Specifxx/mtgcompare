import Link from "next/link";

// RiftCompare's PriceGuideCallout: one wide card linking the price guide, under
// Today's Top Deals.
export function PriceGuideCallout({ totalCards }: { totalCards?: number }) {
  return (
    <section className="container-app" aria-labelledby="price-guide-callout-h">
      <Link
        href="/price-guide"
        prefetch={false}
        className="card-surface group flex flex-col gap-4 p-5 transition-colors hover:border-brand-500 sm:flex-row sm:items-center sm:justify-between sm:p-6"
      >
        <div className="min-w-0">
          <h2 id="price-guide-callout-h" className="text-lg font-extrabold text-white sm:text-xl">
            Magic price guide
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-400">
            {totalCards ? `All ${totalCards.toLocaleString("en-US")} cards` : "Every card"} in one table, with the cheapest in-stock price in your market,
            the 7-day change and how many stores have it. Filter by set, rarity, colour and treatment.
          </p>
        </div>
        <span className="btn-ghost shrink-0 self-start group-hover:border-brand-500 sm:self-center">Open the price guide →</span>
      </Link>
    </section>
  );
}
