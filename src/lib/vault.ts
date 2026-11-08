// MY COLLECTION (competitor scan, 2026-11-08: Collectr and PriceCharting keep visitors coming back with "what is my
// collection worth today"). The same file in every Compare Empire site that has a /prices.json; port fixes by hand.
//
// A visitor marks products they own; the list lives in THIS BROWSER ONLY (localStorage `ce_vault_v1`): no account,
// no server, no database, nothing stored about anyone. /collection values it from the site's static /prices.json
// (lib/price-api.ts: the cheapest in-stock store price per market, never eBay, never converted), so no function of
// ours runs. Each item keeps the market it was added in, and the price there when added, so the page can say what
// the collection is worth today, the change since the items were added, and the change since the visitor last looked
// (one total per market and day, `ce_vault_days_v1`).
//
// Pure apart from the guarded localStorage/window helpers at the bottom.

export const VAULT_KEY = "ce_vault_v1";
export const VAULT_DAYS_KEY = "ce_vault_days_v1";
export const VAULT_EVENT = "ce-vault-change";
export const VAULT_MAX_ITEMS = 300;
export const VAULT_MAX_QTY = 99;
const MAX_DAYS = 60;

export interface VaultItem {
  /** the product's id in /prices.json */
  id: string;
  name: string;
  /** our page for it, e.g. /us/p/<slug> */
  href: string;
  image?: string | null;
  /** the market it was added in (US, AU…): the one it is valued in */
  market: string;
  currency: string;
  /** the market price when added, in the smallest unit of `currency` (0 = unknown) */
  addedCents: number;
  qty: number;
  addedAt: string;
}

export type PriceFile = { currency?: Record<string, string>; products?: { id: string; prices?: Record<string, { cents: number; url?: string }> }[] };

export interface ValuedItem extends VaultItem {
  /** today's price per unit in its market, or null when no store has it in stock */
  nowCents: number | null;
}

export interface MarketTotal {
  market: string;
  currency: string;
  /** items with a price today, times qty */
  nowCents: number;
  /** the same items' prices when added, times qty (items added with no price are left out of both) */
  addedCents: number;
  units: number;
  unpriced: number;
}

export interface DayTotal {
  d: string; // YYYY-MM-DD (UTC)
  m: string;
  c: number;
}

const clampQty = (n: number) => Math.max(0, Math.min(VAULT_MAX_QTY, Math.floor(Number.isFinite(n) ? n : 0)));

function isItem(x: unknown): x is VaultItem {
  const v = x as VaultItem;
  return !!v && typeof v.id === "string" && typeof v.name === "string" && typeof v.href === "string" && typeof v.market === "string" && typeof v.currency === "string" && typeof v.qty === "number";
}

/** A stored list, with anything malformed dropped (it came from storage, so it is untrusted). */
export function parseVault(raw: string | null): VaultItem[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter(isItem).map((i) => ({ ...i, qty: clampQty(i.qty) || 1, addedCents: Number.isFinite(i.addedCents) && i.addedCents > 0 ? Math.round(i.addedCents) : 0 })).slice(0, VAULT_MAX_ITEMS);
  } catch {
    return [];
  }
}

export const itemKey = (i: Pick<VaultItem, "id" | "market">) => `${i.market}:${i.id}`;

export function addItem(items: VaultItem[], item: Omit<VaultItem, "qty" | "addedAt"> & { qty?: number; addedAt?: string }): VaultItem[] {
  const key = itemKey(item);
  const found = items.find((i) => itemKey(i) === key);
  if (found) return items.map((i) => (itemKey(i) === key ? { ...i, qty: clampQty(i.qty + (item.qty ?? 1)) || 1 } : i));
  const next: VaultItem = { ...item, qty: clampQty(item.qty ?? 1) || 1, addedAt: item.addedAt ?? new Date().toISOString(), addedCents: item.addedCents > 0 ? Math.round(item.addedCents) : 0 };
  return [next, ...items].slice(0, VAULT_MAX_ITEMS);
}

/** qty 0 removes the item. */
export function setItemQty(items: VaultItem[], key: string, qty: number): VaultItem[] {
  const q = clampQty(qty);
  return q ? items.map((i) => (itemKey(i) === key ? { ...i, qty: q } : i)) : items.filter((i) => itemKey(i) !== key);
}

/** Today's price for each item, from the site's /prices.json. */
export function valueItems(items: VaultItem[], file: PriceFile | null): ValuedItem[] {
  const by = new Map((file?.products ?? []).map((p) => [p.id, p.prices ?? {}]));
  return items.map((i) => {
    const c = by.get(i.id)?.[i.market]?.cents;
    return { ...i, nowCents: typeof c === "number" && c > 0 ? c : null };
  });
}

export function totalsByMarket(items: ValuedItem[]): MarketTotal[] {
  const out = new Map<string, MarketTotal>();
  for (const i of items) {
    const t = out.get(i.market) ?? { market: i.market, currency: i.currency, nowCents: 0, addedCents: 0, units: 0, unpriced: 0 };
    t.units += i.qty;
    if (i.nowCents == null) t.unpriced += 1;
    else {
      t.nowCents += i.nowCents * i.qty;
      if (i.addedCents > 0) t.addedCents += i.addedCents * i.qty;
    }
    out.set(i.market, t);
  }
  return [...out.values()].sort((a, b) => b.nowCents - a.nowCents);
}

/** The change from `from` to `to` as a whole percentage, or null when there is nothing to compare. */
export function pctChange(from: number, to: number): number | null {
  if (!(from > 0)) return null;
  return Math.round(((to - from) / from) * 100);
}

/** The added-price total counts only items that were priced when added; compare like with like. */
export function sinceAdded(items: ValuedItem[], market: string): { from: number; to: number } | null {
  let from = 0;
  let to = 0;
  for (const i of items) {
    if (i.market !== market || i.nowCents == null || !(i.addedCents > 0)) continue;
    from += i.addedCents * i.qty;
    to += i.nowCents * i.qty;
  }
  return from > 0 ? { from, to } : null;
}

export const dayOf = (d: Date) => d.toISOString().slice(0, 10);

/** Record today's total for a market (one entry per market and day, the newest kept). */
export function recordDay(days: DayTotal[], market: string, cents: number, now = new Date()): DayTotal[] {
  const d = dayOf(now);
  const rest = days.filter((x) => !(x.m === market && x.d === d));
  return [...rest, { d, m: market, c: cents }].sort((a, b) => a.d.localeCompare(b.d)).slice(-MAX_DAYS * 7);
}

/** The newest total before today for this market: "since you last looked". */
export function lastLook(days: DayTotal[], market: string, now = new Date()): DayTotal | null {
  const today = dayOf(now);
  const prev = days.filter((x) => x.m === market && x.d < today).sort((a, b) => b.d.localeCompare(a.d));
  return prev[0] ?? null;
}

export function parseDays(raw: string | null): DayTotal[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => x && typeof x.d === "string" && typeof x.m === "string" && typeof x.c === "number") : [];
  } catch {
    return [];
  }
}

export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: cents >= 100000 ? 0 : 2 }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** The brag line the share button sends: real totals only, never a guess. */
export function shareText(site: string, what: string, t: MarketTotal, since: { from: number; to: number } | null): string {
  const n = t.units === 1 ? "1 item" : `${t.units} items`;
  const pct = since ? pctChange(since.from, since.to) : null;
  const move = pct == null || pct === 0 ? "" : ` (${pct > 0 ? "up" : "down"} ${Math.abs(pct)}% since I added them)`;
  return `My ${what} collection on ${site}: ${n} worth ${formatMoney(t.nowCents, t.currency)} at today's store prices${move}. Track yours free:`;
}

// ── Browser storage (guarded: blocked storage just means nothing persists) ─────────────────────────────────────────

function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readVault(): VaultItem[] {
  try {
    return parseVault(store()?.getItem(VAULT_KEY) ?? null);
  } catch {
    return [];
  }
}

export function writeVault(items: VaultItem[]): void {
  try {
    store()?.setItem(VAULT_KEY, JSON.stringify(items.slice(0, VAULT_MAX_ITEMS)));
  } catch {
    /* full or blocked */
  }
  try {
    window.dispatchEvent(new CustomEvent(VAULT_EVENT));
  } catch {
    /* no window */
  }
}

export function readDays(): DayTotal[] {
  try {
    return parseDays(store()?.getItem(VAULT_DAYS_KEY) ?? null);
  } catch {
    return [];
  }
}

export function writeDays(days: DayTotal[]): void {
  try {
    store()?.setItem(VAULT_DAYS_KEY, JSON.stringify(days));
  } catch {
    /* full or blocked */
  }
}

/** Run `fn` whenever the list changes, here or in another tab. Returns the unsubscribe. */
export function onVaultChange(fn: () => void): () => void {
  const storage = (e: StorageEvent) => {
    if (e.key === null || e.key === VAULT_KEY) fn();
  };
  window.addEventListener(VAULT_EVENT, fn);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(VAULT_EVENT, fn);
    window.removeEventListener("storage", storage);
  };
}

export function track(event: string, params: Record<string, unknown> = {}): void {
  try {
    (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.("event", event, params);
  } catch {
    /* analytics is best-effort */
  }
}
