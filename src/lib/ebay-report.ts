// The importer's reports: the capacity model (a plan against the product data) and a run's summary. Pure
// text, no listing titles or prices: only counts and ages. scripts/ebay-import.ts prints them and appends them to
// $GITHUB_STEP_SUMMARY; the numbers in DEPLOY.md's capacity model come from `--dry-run`.
import { MARKETPLACE_IDS, type MarketplaceId } from "./ebay-context";
import { ITEM_CORE_USD, ITEM_FLOOR_USD } from "./ebay-eligibility";
import { BUCKETS, type Plan, type RunSummary } from "./ebay-import";
import { TYPE_BY_KEY, PRODUCT_TYPES, type TypeKey } from "./sealed-title";
import { MARKETPLACE_ORDER } from "./ebay-import";
import { SETS } from "./sets";

const n = (x: number) => x.toLocaleString("en");
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "n/a");

function age(ms: number | null): string {
  if (ms == null) return "no rows";
  const h = ms / 3600_000;
  return h < 1 ? `${Math.round(ms / 60_000)} min` : `${h.toFixed(1)} h`;
}

/** The plan as a table: calls per bucket, and eligible vs covered item keys per type × marketplace. */
export function capacityReport(plan: Plan): string[] {
  const out: string[] = [];
  out.push(`| Bucket | Feeds wanted | Calls wanted | Feeds planned | Calls planned |`, `| --- | ---: | ---: | ---: | ---: |`);
  for (const b of BUCKETS) {
    const r = plan.byBucket[b];
    out.push(`| ${b} | ${n(r.wanted)} | ${n(r.wantedCalls)} | ${n(r.feeds)} | ${n(r.calls)} |`);
  }
  const wantedCalls = BUCKETS.reduce((a, b) => a + plan.byBucket[b].wantedCalls, 0);
  out.push(``, `Run cap ${n(plan.cap)} calls; the plan makes ${n(plan.calls)} of the ${n(wantedCalls)} it would like (${pct(plan.calls, wantedCalls)}).`);
  const total = plan.items.core + plan.items.extension;
  out.push(
    `Item keys eligible: ${n(plan.items.core)} core (US$${ITEM_CORE_USD}+, or an always-eligible type from US$${ITEM_FLOOR_USD}) + ${n(plan.items.extension)} extension (US$${ITEM_FLOOR_USD}-${ITEM_CORE_USD}) = ${n(total)}.`,
    `Covered by this plan: ${n(plan.items.coreCovered)} of ${n(plan.items.core)} core${plan.items.coreCovered === plan.items.core ? " (ALL core keys fit)" : " (NOT all core keys fit)"}, ${n(plan.items.extensionCovered)} of ${n(plan.items.extension)} extension.`,
  );

  // eligible / covered per type × marketplace
  const covered = new Set(plan.feeds.filter((f) => f.item).map((f) => f.feed));
  const cells = new Map<string, { elig: number; cov: number }>();
  const mpOf = (id: MarketplaceId) => id;
  for (const k of plan.keys) {
    const key = `${k.type}|${mpOf(k.marketplace)}`;
    const c = cells.get(key) ?? { elig: 0, cov: 0 };
    c.elig++;
    if (covered.has(`${k.marketplace}|item:${k.productId}`)) c.cov++;
    cells.set(key, c);
  }
  out.push(``, `| Type | ${MARKETPLACE_ORDER.join(" | ")} | All |`, `| --- | ${MARKETPLACE_ORDER.map(() => "---:").join(" | ")} | ---: |`);
  const types = PRODUCT_TYPES.map((t) => t.key).filter((t) => plan.keys.some((k) => k.type === t));
  for (const t of types as TypeKey[]) {
    let e = 0;
    let c = 0;
    const cols = MARKETPLACE_ORDER.map((m) => {
      const cell = cells.get(`${t}|${m}`);
      e += cell?.elig ?? 0;
      c += cell?.cov ?? 0;
      return cell ? `${cell.cov}/${cell.elig}` : "-";
    });
    out.push(`| ${TYPE_BY_KEY.get(t)!.label} | ${cols.join(" | ")} | ${c}/${e} |`);
  }
  out.push(`(covered/eligible item keys; the extension keys are listed only where the budget reached them)`);
  // value-weighted coverage
  const mass = plan.keys.reduce((a, k) => a + k.value, 0);
  const got = plan.keys.filter((k) => covered.has(`${k.marketplace}|item:${k.productId}`)).reduce((a, k) => a + k.value, 0);
  out.push(`Value-weighted coverage (reference price x market weight, sold-out x1.5): ${pct(got, mass)} of the eligible keys' weight.`);
  return out;
}

const STOP_WORDS: Record<string, string> = {
  cap: "the run cap or today's daily cap was reached, retries included; the least valuable feeds of the plan wait for the next run",
  retries: "the retry allowance ran out",
  "rate-limited": "eBay answered 429; the previous rows were kept",
  forbidden: "eBay refused the search: the keyset has no Buy API access",
  failing: "searches kept failing in a row; stopped to protect the day's budget",
  empty: "searches kept coming back with no listings in a row; stopped to protect the day's budget",
  token: "the token request failed",
};

/** A run's summary: counts and ages only. */
export function runReport(s: RunSummary): string[] {
  const out: string[] = [];
  out.push(
    `${s.dryRun ? "DRY RUN: " : ""}Budget day ${s.day} (Pacific). Calls today: ${n(s.usedAfter)} (${n(s.usedBefore)} before this run) of a ${n(s.caps.daily)} daily cap; this run's cap ${n(s.plan.cap)} (run cap setting ${n(s.caps.run)}).`,
    `Searches this run: ${n(s.searches)} (${n(s.retries)} retries).${s.stopped ? ` Stopped early: ${s.stopped}${s.tokenError ? ` (${s.tokenError})` : ""}${STOP_WORDS[s.stopped] ? ` - ${STOP_WORDS[s.stopped]}` : ""}.` : ""}`,
    ``,
    `| Bucket | Planned feeds | Refreshed | Empty (old rows kept) | Failed (old rows kept) | Skipped (cap) | Fresh (not bought) | Covered by the sweep | Searches | Items stored |`,
    `| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`,
  );
  for (const b of BUCKETS) {
    const r = s.buckets[b];
    out.push(`| ${b} | ${n(r.planned)} | ${n(r.refreshed)} | ${n(r.emptied)} | ${n(r.failed)} | ${n(r.skipped)} | ${n(r.fresh)} | ${b === "items" ? n(r.covered) : "-"} | ${n(r.calls)} | ${n(r.stored)} |`);
  }
  out.push(``, `(sweep: "planned" counts marketplaces; "refreshed" the item feeds it wrote; "empty" products it found only one listing for.)`);
  if (s.sweep.length) {
    out.push(``, `| Sweep | Products | Pages | Hot-set pages (queries) | Listings | Matched | Products found | Item feeds written | General queries (pages, why it stopped) |`, `| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |`);
    for (const m of s.sweep) {
      const q = m.queries.map((x) => `${x.key} ${x.pages}${x.stopped ? ` ${x.stopped}` : ""}`).join(", ");
      out.push(`| ${m.marketplace} | ${n(m.products)} | ${n(m.pages)} | ${n(m.hotPages)} (${n(m.hotQueries.length)}) | ${n(m.listings)} | ${n(m.matched)} | ${n(m.found)} | ${n(m.written)} (${pct(m.written, m.products)}) | ${q} |`);
    }
  }
  out.push(...hotReport(s));
  const eligible = s.plan.items.core + s.plan.items.extension;
  out.push(
    ``,
    `Feeds refreshed ${n(s.feedsRefreshed)} of ${n(s.feedsPlanned)} planned (fixed feeds and per-product searches; a hot-set product that is not an eligible key is counted only in the hot-set line). Item feeds in the database: ${n(s.itemFeedsInDb)} (${n(s.buckets.sweep.refreshed)} from the sweep and ${n(s.buckets.items.refreshed)} from per-product searches this run); ${n(eligible)} keys are eligible for a per-product search (${n(s.plan.items.core)} core).`,
    `Rows in the database: ${n(s.rowsInDb)}. Oldest row: ${age(s.oldestRowAgeMs)}. Purged: ${n(s.purged)} at the start, ${n(s.purgedAtEnd)} at the end.`,
  );
  return out;
}

/**
 * The hot sets (src/lib/popular.ts), per priority marketplace: products with an item feed in the database after the run / products of
 * the set the marketplace lists; then what the per-product searches did for them. Counts only (a set's own name from sets.ts, never a
 * listing's title or price).
 */
export function hotReport(s: RunSummary): string[] {
  if (!s.hot.length) return [];
  const sets = [...new Set(s.hot.map((h) => h.set))];
  const mps = [...new Set(s.hot.map((h) => h.marketplace))];
  const out = [``, `| Hot set | ${mps.join(" | ")} |`, `| --- | ${mps.map(() => "---:").join(" | ")} |`];
  for (const code of sets) {
    const cells = mps.map((mp) => {
      const c = s.hot.find((h) => h.set === code && h.marketplace === mp);
      return c && c.products ? `${n(c.withFeed)}/${n(c.products)} (${pct(c.withFeed, c.products)})` : "-";
    });
    const name = SETS.find((x) => x.code === code)?.name;
    out.push(`| ${code}${name ? ` (${name})` : ""} | ${cells.join(" | ")} |`);
  }
  const h = s.hotItems;
  out.push(
    ``,
    `(Hot sets: products with an item feed in the database after this run / products of the set listed in that marketplace; the hot sets and their order are src/lib/popular.ts HOT_SETS.)`,
    `Hot-set products in ${mps.join(", ")}: ${n(h.keys)}; ${n(h.covered)} covered by the sweep, ${n(h.fresh)} fresh (not bought again), ${n(h.searched)} searched one by one this run (${n(h.refreshed)} found listings).`,
  );
  return out;
}

export { MARKETPLACE_IDS };
