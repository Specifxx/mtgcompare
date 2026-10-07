import { COUNTRIES, type Country } from "./country";

/** "US$12.34" — integer cents in the market's own currency. */
export function money(cents: number | null | undefined, country: Country): string {
  if (cents == null) return "—";
  const c = COUNTRIES[country];
  const v = cents / 100;
  const digits = v >= 1000 ? 0 : 2;
  return `${c.symbol}${v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** USD cents formatted as US dollars. */
export function usd(cents: number | null | undefined): string {
  return money(cents, "US");
}

export function pct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const s = v.toFixed(digits);
  return `${v > 0 ? "+" : ""}${s}%`;
}

export function int(n: number): string {
  return n.toLocaleString("en-US");
}

/** "7h ago", "3d ago" — for "prices updated" lines. */
export function ago(d: Date | string | null | undefined, now: number = Date.now()): string {
  if (!d) return "never";
  const t = typeof d === "string" ? Date.parse(d) : d.getTime();
  const mins = Math.max(0, Math.round((now - t) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function longDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function shortDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** "$12.34", "A$12.34" — minor units in any ISO currency (Stripe amounts, report snapshots). */
export function moneyCode(cents: number | null | undefined, currency: string | null | undefined): string {
  if (cents == null) return "—";
  if (!currency) return (cents / 100).toFixed(2);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}
