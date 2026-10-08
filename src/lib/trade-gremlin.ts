// The trade gremlin — a funny, protective verdict on a trade's fairness. Computed
// from the two sides' adjusted values; reacts live as the user tweaks the trade.
// Shared by the calculator (instant, free) and /api/trade-roast.
//
// RiftCompare's lib/trade-gremlin.ts, for One Piece. One difference, on
// purpose: MTG Compare has NO language-model key, so "Roast this trade" is
// RULES-ONLY (wave-2 plan, Track 3 item 4). tradeRoast() below picks a spicier
// canned line for the same verdict, and the calculator discloses that the
// commentary is canned, not written by a model.
import { formatMoney } from "./format-currency";

// Every currency the trade calculator can show, i.e. what /api/trade-roast must
// accept: one per MTG Compare market (lib/country.ts). An arbitrary string must
// never be formatted into a reply.
export const TRADE_CURRENCIES = ["AUD", "USD", "GBP", "CAD", "EUR", "SGD"] as const;

export type TradeTone = "donation" | "fair" | "robbed" | "winning";
export type TradeVerdict = { tone: TradeTone; line: string };

/** How far apart the two sides are: the verdict band and the gap as money. */
function gapOf(giveCents: number, getCents: number) {
  const give = Math.max(0, Math.round(giveCents));
  const get = Math.max(0, Math.round(getCents));
  const gap = get - give; // positive = you're up
  const base = Math.max(give, get);
  const gapPct = base > 0 ? (Math.abs(gap) / base) * 100 : 0;
  return { give, get, gap, gapPct };
}

// `giveCents` = value you're handing over; `getCents` = value you're receiving.
export function tradeGremlin(giveCents: number, getCents: number, currency: string): TradeVerdict | null {
  const { give, get, gap, gapPct } = gapOf(giveCents, getCents);
  if (give <= 0 && get <= 0) return null;

  // One side empty = not really a trade.
  if (give <= 0 || get <= 0) {
    return {
      tone: "donation",
      line: "One side's empty — that's not a trade, that's a charity donation. Load up the other column, champ.",
    };
  }

  const amt = formatMoney(Math.abs(gap), currency);

  if (gapPct < 7) {
    return {
      tone: "fair",
      line: `Basically even — only ${amt} apart. The gremlin smells no blood here. Fair trade, shake on it. 🤝`,
    };
  }

  if (gap < 0) {
    // You're giving more than you get — defend "my boy".
    return gapPct >= 20
      ? { tone: "robbed", line: `WHOA. Are they trying to scam my boy?? You're ${amt} in the hole on this one. Walk away, or make 'em sweeten the pot. 🚨` }
      : { tone: "robbed", line: `Hold up — you're handing over ${amt} more than you're getting back. Not quite a robbery, but the gremlin's raising an eyebrow. Push for a little extra.` };
  }

  // You're getting more than you give — gleeful.
  return gapPct >= 20
    ? { tone: "winning", line: `Highway robbery and the gremlin is THRIVING — you're ${amt} up. Shake hands before they find a calculator. 💰` }
    : { tone: "winning", line: `You're coming out ${amt} ahead. Tidy little edge — nod, smile, and don't make it weird.` };
}

// The roast lines: a spicier take on each verdict, picked by the trade's own
// numbers so the same trade always gets the same line. Every line names the
// gap and ends with a clear lean (take it / push for more / walk away).
const ROASTS: Record<TradeTone, ((amt: string) => string)[]> = {
  donation: [
    () => "One column's empty. That's not a trade, that's a birthday present. Put something on the other side before you hand anything over.",
    () => "Nothing coming back? Even a Mox charges admission. Add their cards first, then we talk.",
  ],
  fair: [
    (amt) => `${amt} apart. The gremlin came here for drama and found a perfectly fair trade. Disappointing. Take it. 🤝`,
    (amt) => `Within ${amt} — that's a rounding error with a handshake. Nobody's getting robbed today. Take it.`,
    (amt) => `Only ${amt} between you. Dead even, like a mirror match. Shake on it.`,
  ],
  robbed: [
    (amt) => `You're ${amt} down and they're smiling like they've found a Black Lotus. Push for more or walk away. 🚨`,
    (amt) => `${amt} out of your pocket? The gremlin has seen fairer deals from a Goblin Welder. Make them sweeten it.`,
    (amt) => `This trade costs you ${amt}. Protect your binder — ask for another card or walk.`,
  ],
  winning: [
    (amt) => `You're ${amt} up. Sign it before they check the prices — the gremlin saw nothing. Take it. 💰`,
    (amt) => `${amt} in your favour. That's a Mythic Rare of a deal. Take it, and maybe buy them a drink.`,
    (amt) => `Up ${amt}. Karn would be proud. Take it before anyone opens a price guide.`,
  ],
};

/**
 * A spicier, still rules-only line for the trade (/api/trade-roast). Null when
 * both sides are empty. Deterministic: the same values give the same line.
 */
export function tradeRoast(giveCents: number, getCents: number, currency: string): TradeVerdict | null {
  const v = tradeGremlin(giveCents, getCents, currency);
  if (!v) return null;
  const { give, get, gap } = gapOf(giveCents, getCents);
  const lines = ROASTS[v.tone];
  const pick = lines[(give + get * 7) % lines.length]!;
  return { tone: v.tone, line: pick(formatMoney(Math.abs(gap), currency)) };
}

// ── /api/trade-roast's body (a route file may only export its handlers) ──
const MAX_CENTS = 100_000_00;
const cents = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_CENTS ? v : null);
type TradeCurrency = (typeof TRADE_CURRENCIES)[number];

/** The body, strictly: two whole-cent amounts and a currency from TRADE_CURRENCIES (an arbitrary string is never formatted into a reply). */
export function parseRoastBody(body: unknown): { giveCents: number; getCents: number; currency: TradeCurrency } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const giveCents = cents(b.giveCents);
  const getCents = cents(b.getCents);
  const currency = b.currency === undefined ? "USD" : b.currency;
  if (giveCents == null || getCents == null || !(TRADE_CURRENCIES as readonly unknown[]).includes(currency)) return null;
  return { giveCents, getCents, currency: currency as TradeCurrency };
}
