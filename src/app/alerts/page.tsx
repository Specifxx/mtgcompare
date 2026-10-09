import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, JsonLd } from "@/components/ui";
import { AlertsSignupCta } from "@/components/AlertsSignupCta";
import { faqLd } from "@/lib/jsonld";
import { pageOg } from "@/lib/og/meta";
import { getEmailStatus } from "@/lib/data";
import { alertsAnswer, alertsFaqs, alertsPlusCopy } from "@/lib/alerts-copy";
import { FREE_WATCHLIST_LIMIT } from "@/lib/free-limits";

// RiftCompare's /alerts — the explainer for watchlists and price alerts, and
// the landing page for "magic card price alert" style queries — ported in
// wave 2 (2026-10-03).
//
// EVERY SENTENCE HERE DESCRIBES CODE THAT RUNS (lib/price-alerts.ts,
// lib/alerts-copy.ts holds the words). EMAIL IS OFF UNTIL CONFIGURED: the page
// reads getEmailStatus() (the EMAIL_STATUS switch) and, while it is "off", explains
// the in-app flags and the watchlist chips honestly and promises no email; when
// the alert run has recorded "on", it switches to RiftCompare's email copy.
// Reaches the data barrel (getEmailStatus), so it is rendered per request: an ISR page would bake the switch in at build time.
export const dynamic = "force-dynamic";

const CANONICAL = "/alerts";

export const metadata: Metadata = {
  title: { absolute: "Magic: The Gathering Price Alerts & Watchlists | MTG Compare" },
  description:
    "Track any Magic card and get alerted when its price hits a new low, with the cheapest store named. How MTG Compare watchlists and price alerts work, what they cost, and how to set one up.",
  alternates: { canonical: CANONICAL },
  keywords: ["magic card price alert", "magic tcg watchlist", "track magic card prices", "magic card price drop"],
  openGraph: pageOg(CANONICAL, {
    title: "Magic: The Gathering Price Alerts & Watchlists",
    description: "Track any Magic card and get alerted when its price hits a new low — free, across every store we track.",
  }),
};

function steps(emailOn: boolean): { title: string; body: React.ReactNode }[] {
  return [
    {
      title: "Find the exact printing",
      body: (
        <>
          Search <Link href="/browse" className="text-brand-400 underline">the card database</Link> by card number, not
          just name — a Parallel and a standard print of the same card are different cards at very different prices.
        </>
      ),
    },
    {
      title: "Add it to your watchlist",
      body: <>Tap the watch button on the card tile or card page. The card joins your list with its current lowest price.</>,
    },
    {
      title: "No number to set",
      body: (
        <>
          We check the lowest live price every day, so there&apos;s nothing to set. Check{" "}
          <Link href="/movers" className="text-brand-400 underline">
            the weekly movers
          </Link>{" "}
          if you want to know whether now is a spike before you start. (Plus members can also set a price of their own —
          see below.)
        </>
      ),
    },
    {
      title: "Let it come to you",
      body: emailOn ? (
        <>
          You&apos;ll be emailed when it hits a new low — at least 5% below the price we last told you — the item price of the
          cheapest Near Mint copy, with up to three stores, each linked. Sold out and back again? You hear about that too. One
          tap in the email stops watching a card or snoozes it for 30 days. At most one email a week, only when a card hits a
          new low. No refreshing, no five tabs.
        </>
      ) : (
        <>
          When it hits a new low — at least 5% below where it stood — it&apos;s flagged on your watchlist and in Recent
          alerts on your dashboard, with the cheapest Near Mint copy and the store that has it. Sold out and back again? That&apos;s
          flagged too. At most one alert a week, only when a card hits a new low. No refreshing, no five tabs.
        </>
      ),
    },
  ];
}

export default async function AlertsPage() {
  const emailOn = (await getEmailStatus()) === "on";
  const faqs = alertsFaqs(emailOn);
  const delivery = emailOn ? "Being emailed when one hits a new low" : "Being flagged when one hits a new low";
  const target = emailOn ? "Being emailed when a card reaches the price you set" : "Being flagged when a card reaches the price you set";

  return (
    <div className="mx-auto max-w-3xl">
      <JsonLd data={faqLd(faqs)} />
      <Breadcrumbs trail={[{ name: "Price alerts" }]} />

      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Magic: The Gathering price alerts &amp; watchlists</h1>

      <div className="card-surface mt-4 border-l-2 border-l-brand-500 p-5">
        <p className="text-[15px] leading-relaxed text-slate-200">{alertsAnswer(emailOn)}</p>
      </div>

      <h2 className="mt-8 text-xl font-extrabold text-white">How to set one up</h2>
      <ol className="mt-3 space-y-4">
        {steps(emailOn).map((s, i) => (
          <li key={s.title} className="card-surface flex gap-3 p-4">
            <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-sm font-bold text-brand-300">
              {i + 1}
            </span>
            <div>
              <div className="font-semibold text-white">{s.title}</div>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <h2 className="mt-10 text-xl font-extrabold text-white">Your own target price, with Plus</h2>
      <div className="card-surface mt-3 p-4 text-sm leading-relaxed text-slate-300">
        <p>{alertsPlusCopy(emailOn)}</p>
        <p className="mt-2">
          Members also hear when a watched card drops below TCGplayer market at a store we track — the same list{" "}
          <Link href="/tools/deal-finder" className="text-brand-400 underline">
            Deal Finder
          </Link>{" "}
          ranks — at a new low, at least 15% under market, with no target to set.
        </p>
        <p className="mt-2">
          Plus is ad-free, too.{" "}
          <Link href="/premium" className="text-brand-400 underline">
            See Plus
          </Link>
          .
        </p>
      </div>

      <h2 className="mt-10 text-xl font-extrabold text-white">Watchlist, binder or alert?</h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-ink-700">
        <table className="w-full min-w-[30rem] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-ink-850">
              <th scope="col" className="border-b border-ink-700 px-3 py-2 font-semibold text-white">Feature</th>
              <th scope="col" className="border-b border-ink-700 px-3 py-2 font-semibold text-white">What it&apos;s for</th>
              <th scope="col" className="border-b border-ink-700 px-3 py-2 font-semibold text-white">Where</th>
            </tr>
          </thead>
          <tbody>
            <tr className="odd:bg-ink-900/40">
              <td className="border-b border-ink-800 px-3 py-2 font-semibold text-white">Watchlist</td>
              <td className="border-b border-ink-800 px-3 py-2 text-slate-300">Cards you want to buy</td>
              <td className="border-b border-ink-800 px-3 py-2">
                <Link href="/browse" className="text-brand-400 underline">Any card tile</Link>
              </td>
            </tr>
            <tr className="odd:bg-ink-900/40">
              <td className="border-b border-ink-800 px-3 py-2 font-semibold text-white">Price alert</td>
              <td className="border-b border-ink-800 px-3 py-2 text-slate-300">{delivery}</td>
              <td className="border-b border-ink-800 px-3 py-2 text-slate-300">The watch button — no price to set</td>
            </tr>
            <tr className="odd:bg-ink-900/40">
              <td className="border-b border-ink-800 px-3 py-2 font-semibold text-white">Target price (Plus)</td>
              <td className="border-b border-ink-800 px-3 py-2 text-slate-300">{target}</td>
              <td className="border-b border-ink-800 px-3 py-2 text-slate-300">&ldquo;Notify me at&rdquo; on your watchlist</td>
            </tr>
            <tr className="odd:bg-ink-900/40">
              <td className="border-b border-ink-800 px-3 py-2 font-semibold text-white">Binder</td>
              <td className="border-b border-ink-800 px-3 py-2 text-slate-300">Valuing the cards you already own</td>
              <td className="border-b border-ink-800 px-3 py-2">
                <Link href="/portfolio" className="text-brand-400 underline">My binder</Link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-xl font-extrabold text-white">Frequently asked questions</h2>
      <div className="mt-3 divide-y divide-ink-800 rounded-xl border border-ink-700">
        {faqs.map((f) => (
          <details key={f.q} className="group">
            <summary className="flex cursor-pointer list-none gap-2 p-4 font-semibold text-white marker:content-none [&::-webkit-details-marker]:hidden">
              <span className="flex-none self-start text-brand-400 transition-transform group-open:rotate-90" aria-hidden>
                ›
              </span>
              {f.q}
            </summary>
            <p className="px-4 pb-4 pl-9 text-sm leading-relaxed text-slate-300">{f.a}</p>
          </details>
        ))}
      </div>

      <section className="card-surface mt-10 flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="font-bold text-white">Start watching a card</h2>
          <p className="mt-1 text-sm text-slate-400">
            Search the database, tap watch — no price to set, free on up to {FREE_WATCHLIST_LIMIT} cards. Or see{" "}
            <Link href="/movers" className="text-brand-400 underline">what&apos;s moving this week</Link> first.
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <AlertsSignupCta />
          <Link href="/browse" className="btn-ghost">Card database →</Link>
        </div>
      </section>
    </div>
  );
}
