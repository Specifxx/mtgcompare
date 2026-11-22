import { GIVEAWAY as G, giveawayState } from "@/lib/giveaway";

// The home page's giveaway banner (owner, 2026-11-22: "feature it on our homepage"). Shown only while entries are open; the page's
// CDN copy lasts a day, so it can outlive the close by a day at most, and /giveaway then says entries have closed.
export function GiveawayHomeBanner() {
  if (giveawayState() !== "open") return null;
  return (
    <a
      href="/giveaway?utm_source=home&utm_medium=banner&utm_campaign=giveaway"
      className="gw-hero group mt-4 flex items-center gap-4 rounded-2xl border border-line p-3 transition hover:shadow-lift sm:p-4"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={G.imageUrl} alt={G.prize} width={56} height={56} className="h-14 w-14 shrink-0 rounded-lg bg-white object-contain p-1" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold uppercase tracking-wide text-brand-strong">Free giveaway · worldwide · closes 14 Dec</span>
        <span className="block font-semibold">{G.title}</span>
        <span className="mt-0.5 block text-sm text-muted">Free with an account. 50 points free, +5 every day you check in, +25 for each friend.</span>
      </span>
      <span className="btn-primary hidden shrink-0 sm:inline-flex">Enter free</span>
    </a>
  );
}
