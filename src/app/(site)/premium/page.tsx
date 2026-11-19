import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PremiumPanel } from "@/components/premium/PremiumPanel";
import { CONTACT_EMAIL, SITE_NAME, SITE_URL } from "@/lib/site";
import { PREMIUM_PRICE_LINE } from "@/lib/premium-member";

// MTG Compare Premium (owner, 2026-11-10: a RiftCompare Premium account works here; 2026-11-19: collector-first, "very easy to get",
// as attractive as RiftCompare's). Static; the browser asks RiftCompare. Freemium: every price, the cheapest row, the collection
// and the rising cards stay free. Premium never hides a price row or a buy button. Only what really ships is listed here.
const DESCRIPTION = `Premium for ${SITE_NAME}: a year of collection value history and a spreadsheet export, up to 200 price alerts, a watch list and no banner ads. ${PREMIUM_PRICE_LINE}. Prices, your collection and rising cards stay free.`;
export const metadata: Metadata = {
  title: `${SITE_NAME} Premium: 14 days free`,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/premium` },
};

const TILES: { icon: string; title: string; body: string; free?: boolean }[] = [
  { icon: "▦", title: "Your collection, valued daily", body: "Tap I own this on any card (normal, foil or etched) or sealed product. Premium keeps a year of value history and exports it to a spreadsheet.", free: false },
  { icon: "🔔", title: "200 price alerts", body: "An email when a box drops to your price or a sold-out product is back. Free accounts get 25; Premium gets 200 and sets each with one tap." },
  { icon: "👁", title: "A watch list", body: "Every alert you've set in one place, with today's lowest in-stock price beside it and a button to stop each." },
  { icon: "✦", title: "A calmer site", body: "No sponsored banners or phone ad dock while you're signed in. Price tables, the stores in them and their order never change." },
  { icon: "⇄", title: "One account, all our sites", body: "The same sign-in and membership work across all our price comparison sites." },
  { icon: "↗", title: "Rising and falling cards", body: "The cards whose TCGplayer price moved most today and this week. Free for everyone, members included.", free: true },
];

const ROWS: [string, string, string][] = [
  ["Every store price and the cheapest row", "✓", "✓"],
  ["Card prices for every Magic card", "✓", "✓"],
  ["My collection, valued today", "✓", "✓"],
  ["Rising and falling cards", "✓", "✓"],
  ["Back-in-stock emails", "✓", "✓ one tap"],
  ["Price alerts", "25", "200"],
  ["Collection value history", "Since your last look", "A year, with a chart"],
  ["Collection spreadsheet export", "—", "✓"],
  ["Watch list", "—", "✓"],
  ["Banner ads", "Shown below content", "None"],
];

const FAQ: [string, string][] = [
  ["Do I pay anything during the trial?", "No. Start the 14-day trial with a card through Stripe's checkout; nothing is charged until day 15, and cancelling before then costs nothing."],
  ["How do I cancel?", "Sign in, open this page and tap Manage billing. It opens Stripe's own portal, where one tap cancels. Your free alerts and your collection keep working."],
  ["Does Premium change which store is cheapest?", "Never. Every visitor sees the same stores, prices and order. Premium adds tools around them; it never hides a price row or a buy button."],
  ["Where is my collection kept?", "In this browser, so it works without an account. Premium keeps up to a year of daily values there and lets you export it."],
];

export default function PremiumPage() {
  return (
    <div className="page max-w-4xl py-10">
      <Breadcrumbs items={[{ href: "/", label: SITE_NAME }, { label: "Premium" }]} />
      <section className="mt-4 overflow-hidden rounded-2xl bg-gradient-to-br from-[#7a2ec4] to-[#3b0f6b] px-6 py-10 text-white sm:px-10">
        <p className="text-xs font-bold uppercase tracking-widest text-white/80">14 days free · cancel any time</p>
        <h1 className="page-title mt-2 text-white">
          {SITE_NAME} <span className="text-amber-300">Premium</span>
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-white/90">
          For collectors: watch what your Magic collection is worth, get told the moment a price drops or a box is back, and browse without banners.
          Comparing prices stays free for everyone.
        </p>
        <a href="#plans" className="mt-6 inline-flex min-h-12 items-center rounded-full bg-white px-6 font-bold text-[#4c1d95] shadow-lg hover:bg-white/90">
          Start your free trial
        </a>
      </section>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TILES.map((t) => (
          <li key={t.title} className="card p-5">
            <span aria-hidden className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-lg text-brand-strong">
              {t.icon}
            </span>
            <h2 className="mt-3 font-display text-lg font-bold">
              {t.title}
              {t.free && <span className="ml-2 rounded-full border border-line px-2 py-0.5 align-middle text-[11px] font-semibold text-muted">Free</span>}
            </h2>
            <p className="mt-1 text-sm text-muted">{t.body}</p>
          </li>
        ))}
      </ul>

      <div id="plans" className="mt-10 grid scroll-mt-24 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <PremiumPanel />
        <div>
          <h2 className="font-display text-xl font-bold">Free and Premium</h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 font-semibold"> </th>
                <th className="py-2 font-semibold">Free</th>
                <th className="py-2 font-semibold text-brand-strong">Premium</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([what, free, prem]) => (
                <tr key={what} className="border-b border-line">
                  <th scope="row" className="py-2 pr-2 text-left font-medium">{what}</th>
                  <td className="py-2 pr-2 text-muted">{free}</td>
                  <td className="py-2 font-semibold">{prem}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="prose-dex mt-10">
        <h2>How it works</h2>
        <p>
          Sign in on {SITE_NAME} with an emailed link (no password), pick monthly or yearly, and start the 14-day trial through Stripe&rsquo;s secure
          checkout. You are not charged until day 15. {PREMIUM_PRICE_LINE}.
        </p>
        <h2>Questions</h2>
        {FAQ.map(([q, a]) => (
          <div key={q}>
            <h3>{q}</h3>
            <p>{a}</p>
          </div>
        ))}
        <p className="text-sm text-muted">
          Prices are the lowest in-stock store price before postage, and card prices are TCGplayer&rsquo;s market price. Alerts use the same store feeds as the
          site, so a product that sells out within hours can be gone by the time you click. Questions?{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </div>
    </div>
  );
}
