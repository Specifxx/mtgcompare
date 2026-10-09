// THE /alerts PAGE'S COPY — RiftCompare's /alerts FAQ and steps, ported for OP
// Compare in wave 2 (2026-10-03), in two honest versions:
//
//   • email OFF (the default until the owner configures a mailer — lib/data.ts
//     getEmailStatus): alerts are delivered IN-APP — a notification on the
//     dashboard and a chip on the watchlist — and no sentence promises an email;
//   • email ON: RiftCompare's email copy, rebranded, minus what MTG Compare does
//     not do (no CardTrader, no measured postage in the alert: the stores are
//     named and linked, postage is added at their checkout).
//
// EVERY SENTENCE DESCRIBES CODE THAT RUNS (lib/price-alerts.ts,
// lib/alert-price.ts, scripts/alerts.ts) and every number is the enforced
// constant, quoted, never typed (tests/alerts-page.test.ts). Pure: no React.
import { DROP_MIN_CENTS, DROP_MIN_PCT } from "./alert-thresholds";
import { BELOW_MARKET_MIN_PCT, OUTLIER_DROP_PCT, TARGET_REFIRE_STEP_PCT } from "./price-alerts";
import { PLUS_TARGET_ALERT_LIMIT, PRICES_REFRESH_PHRASE } from "./alert-limits";
import { FREE_WATCHLIST_LIMIT } from "./free-limits";

export interface AlertsFaq {
  q: string;
  a: string;
}

// e.g. "at least 5% (and at least 50 cents or pence)", built below from the constants
const MATERIAL = `at least ${DROP_MIN_PCT}% (and at least ${DROP_MIN_CENTS} cents or pence)`;

const TRIGGER =
  "The cheapest Near Mint copy — or one whose store states no condition — in stock at a store we track for your market, or TCGplayer's cheapest listing in the US, seen by our last price update. eBay listings never trigger an alert, and neither do played copies or a store whose feed has gone quiet (while a cheaper store's feed is down, we wait rather than guess).";

export function alertsFaqs(emailOn: boolean): AlertsFaq[] {
  const tell = emailOn ? "email you" : "flag it on your watchlist and dashboard";
  const told = emailOn ? "the price we last emailed you" : "where it stood before it started falling";
  return [
    {
      q: "How do I set a price alert for a Magic card?",
      a: `Open the card's page or its quick view and tap the watch button — a free alert needs no price. We check the cheapest Near Mint (or unstated-condition) copy at the stores we track ${PRICES_REFRESH_PHRASE}, straight after the price update. We ${tell} when it falls by ${MATERIAL} from ${told}${emailOn ? " — or, if we haven't emailed you about that card in the last 30 days, from where it stood before it started falling" : ""}, so a slow slide in small steps still adds up to an alert. If no store has the card yet, we ${tell} when it's first listed instead, and if it sells out we ${tell} when it's back. Plus members can also set their own price on up to ${PLUS_TARGET_ALERT_LIMIT} watched cards (every card on Premium).`,
    },
    {
      q: "Can I watch a card with no price yet?",
      a: `Yes — useful for newly revealed cards no store has listed. Watch it as normal and we'll ${tell} when it's first listed in your market, with the lowest price it listed at. Before the set's release date it says it's open for pre-order — never 'in stock'. From then on it works like any other alert: you hear about real drops below that price.`,
    },
    {
      q: "Do price alerts cost anything?",
      a: `No. Watchlists and new-low alerts are free on up to ${FREE_WATCHLIST_LIMIT} cards and need only a free account. Plus and Premium watch unlimited cards; if you already watch more than ${FREE_WATCHLIST_LIMIT}, you keep them all and only a new card needs Plus. Setting your own target price on a card is part of Plus, which is also ad-free.`,
    },
    {
      q: "Which price triggers the alert?",
      a: `${TRIGGER} A drop has to be ${MATERIAL} below ${told}, so a few cents of drift never sends an alert. A new low more than ${OUTLIER_DROP_PCT}% under the day before is checked again at the next price update and sent only if it is still there, because a price that far off is usually a listing error. That is the item price — postage is added at each store's checkout — so every alert names the stores and links each listing. There are no reminders: a price that just sits still doesn't alert you again.`,
    },
    {
      q: emailOn ? "How often will I actually get emailed?" : "How often will I be alerted?",
      a: emailOn
        ? `At most one email a week, only when a card hits a new low, is first listed or is back in stock. Every card you watch is still checked daily, but if you'd already had an alert email in the last 7 days, the next one waits for the following week — and if the price has recovered by then, nothing goes. Plus has two exceptions, emailed as soon as they happen: your own target price being met, and a watched card dropping below TCGplayer market at a new low (at least ${BELOW_MARKET_MIN_PCT}% under).`
        : `At most one alert a week for the free new-low, first-listed and back-in-stock alerts. Every card you watch is still checked daily, but if you'd already had an alert in the last 7 days, the next one waits for the following week — and if the price has recovered by then, there's nothing to tell you. Plus has two exceptions, flagged as soon as they happen: your own target price being met, and a watched card dropping below TCGplayer market at a new low (at least ${BELOW_MARKET_MIN_PCT}% under).`,
    },
    {
      q: "How often are prices checked?",
      a: `Prices are imported ${PRICES_REFRESH_PHRASE}, and every alert is checked straight after the import. A drop is picked up on the next check rather than instantly — Magic: The Gathering prices move over days, not seconds, so that is the right resolution for buying decisions.`,
    },
    emailOn
      ? {
          q: "What's in an alert email?",
          a: "For each card: what changed, in money and as a percentage, measured from the price we last emailed you (or where it stood before it started falling); the price when you started watching; the condition (Near Mint, or not stated by the store); up to three stores, each with its price and a Buy link; and when we checked. A card that's back in stock says since when it was sold out; a below-market alert shows the TCGplayer market price (converted from US dollars outside the US) and the gap. The biggest news comes first.",
        }
      : {
          q: "Where do alerts show up?",
          a: "On your dashboard, under Recent alerts, and on your watchlist, where the card carries a chip (a new low, or at your target) until you look. Each alert names the store with the cheapest copy and links the card page, where every store's price is listed. We don't send alert emails yet; when we do, this page will say so and you'll be able to choose.",
        },
    emailOn
      ? {
          q: "How do I stop, snooze or pause alert emails?",
          a: `Every card in an alert email has one-tap links: 'Stop watching' removes that card, and 'Snooze 30 days' stops emails about it for a month while we keep checking its price. Plus and Premium members also get a one-tap target ${TARGET_REFIRE_STEP_PCT}% under the price in the email. Each link opens a short confirmation page first, so a mail app scanning links can't change anything. The footer's 'Pause alert emails' stops every price-alert email to your address and keeps your watchlist and targets; your inbox's own Unsubscribe button does the same. Deleting all your watches is a separate, explicit button on that page.`,
        }
      : {
          q: "How do I stop alerts for a card?",
          a: "Remove it from your watchlist (the heart on its tile, or the list itself). Your other watches are unchanged.",
        },
    {
      q: "Can I track cards I already own instead?",
      a: "Yes — that's your binder (the portfolio). A watchlist is for cards you want; the binder values the cards you have.",
    },
  ];
}

/** The answer box under the H1. */
export function alertsAnswer(emailOn: boolean): string {
  return emailOn
    ? `A watchlist is a list of Magic cards you want; a price alert is an email when one drops to a new low — at most one email a week. Both are free, with no price to set, on up to ${FREE_WATCHLIST_LIMIT} cards (unlimited with Plus). The trigger is the cheapest Near Mint copy in stock at the stores we track for your market — never an eBay listing or a played copy. That is the item price, before postage, so every alert names up to three stores and links each listing.`
    : `A watchlist is a list of Magic cards you want; a price alert flags one on your watchlist and dashboard when it drops to a new low — at most one a week. Both are free, with no price to set, on up to ${FREE_WATCHLIST_LIMIT} cards (unlimited with Plus). The trigger is the cheapest Near Mint copy in stock at the stores we track for your market — never an eBay listing or a played copy — and the alert names the store with it.`;
}

/** The Plus section's first paragraph. */
export function alertsPlusCopy(emailOn: boolean): string {
  const deliver = emailOn
    ? "we email you straight away, without the weekly wait: the card, the price, the store and a link to the listing"
    : "we flag it on your watchlist and dashboard straight away, without the weekly wait: the card, the price and the store";
  return `Know what you'd pay? Plus members can set a price on any watched card — "Notify me at" — on up to ${PLUS_TARGET_ALERT_LIMIT} cards, or every card on Premium. After each price update (prices are imported ${PRICES_REFRESH_PHRASE}) we check every store we track in that card's market, and when the lowest in-stock price is at or below your number ${deliver}. It fires once, then again only if the price falls another ${TARGET_REFIRE_STEP_PCT}% — or if it goes back above your number and comes down again. Never more than one alert a day about the same card.`;
}
