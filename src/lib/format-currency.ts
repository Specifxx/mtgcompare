// Money in an ISO currency rather than a market — RiftCompare's formatMoney
// (lib/format.ts there), for the modules ported from it that price in a
// store's own currency (postage, Best Basket, the selling-fee calculator).
// OP Compare's own lib/format.ts money() formats by MARKET; both use the same
// symbols (US$, A$, £, S$, C$, €), so a figure reads the same either way.

export const SYMBOL: Record<string, string> = { AUD: "A$", USD: "US$", GBP: "£", SGD: "S$", CAD: "C$", EUR: "€" };

// A negative amount takes a LEADING U+2212 minus before the symbol
// ("−US$190.00"); neither -0 nor an amount that rounds to 0.00 gets a sign.
export function formatMoney(cents: number, currency: string = "USD"): string {
  const abs = Math.abs(cents);
  const n = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(abs / 100);
  return `${cents < 0 && abs >= 0.5 ? "−" : ""}${SYMBOL[currency] ?? "$"}${n}`;
}
