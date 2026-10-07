// Indicative FX, USD-based — for REFERENCE conversions only (TCGplayer's market
// price shown in a non-US market is marked "≈"). Real checkout is always in the
// store's own currency. Env-overridable without a code change, read by literal
// name so Next inlines them for the browser.
import { currencyOf, type Country } from "./country";

const rate = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const USD_TO: Record<string, number> = {
  USD: 1,
  AUD: rate(process.env.NEXT_PUBLIC_USD_TO_AUD, 1.5),
  GBP: rate(process.env.NEXT_PUBLIC_USD_TO_GBP, 0.79),
  SGD: rate(process.env.NEXT_PUBLIC_USD_TO_SGD, 1.35),
  CAD: rate(process.env.NEXT_PUBLIC_USD_TO_CAD, 1.37),
  EUR: rate(process.env.NEXT_PUBLIC_USD_TO_EUR, 0.92),
};

export function convertUsdCents(usdCents: number, currency: string): number {
  return Math.round(usdCents * (USD_TO[currency] ?? 1));
}

export function usdCentsToCountry(usdCents: number, country: Country): number {
  return convertUsdCents(usdCents, currencyOf(country));
}

export function toUsdCents(cents: number, currency: string): number {
  return Math.round(cents / (USD_TO[currency] ?? 1));
}
