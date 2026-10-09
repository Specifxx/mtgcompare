// scripts/db-audit.ts (owner WP19, parity P03). The audit of the ONE Neon database, which holds PRIVATE state only (contract 12.12): accounts, billing, watches, alerts, collection, notifications, inbox, counters, the eBay tables, click
// events and a courtesy ImportRun row. RiftCompare's db-audit.ts audited the catalogue inside Postgres (identity, duplicates, taxonomy, prices, freshness); here that catalogue is files and scripts/audit-catalogue.ts,
// check-card-consistency.ts and audit-history.ts read it. What this script reads is what is LEFT in Postgres:
//
//   FOOTPRINT   pg_database_size and the biggest tables against the budget (under 100 MB at 10,000 users; Neon Free is 1 GB), the Meta row db.footprint.<week> the admin panel reads
//   RETENTION   click events older than 90 days, eBay rows older than 72 hours (licence, C21), demand days older than 90, an eBay ledger window that overspent its cap, the launch-promo counter above its 50
//   ENTITLEMENT users whose tier is not plus|premium, a premium end date with no tier (Premium is written only by the webhook, the reconcile, an audited admin grant and the promo)
//   ORPHANS     (C2/C4, with --dir) every productId a user row points at (alerts, binder, sealed watches, published decks, eBay rows, view counters) exists in the PUBLISHED catalogue: rows are never deleted, so a missing id
//               is a typo, a foreign id or a rebuilt catalogue that reused numbers. The tables carry no foreign key on purpose (2.3), so this sweep is the only thing that notices.
//   RUNS        the newest courtesy ImportRun is under 36 hours old
//
//   npx tsx scripts/db-audit.ts [--dir .data] [--json]       read-only; exit 1 on any `error`; without DATABASE_URL a green no-op
// Run by .github/workflows/db-audit.yml (Monday 03:30 UTC, and by hand). Reads are bounded: sizes, counts, and DISTINCT product ids (integers), never a row's text.
import fs from "node:fs";
import path from "node:path";
import type { CatRow, SealedListFile } from "../src/lib/data/plane/formats";
import { fsTree, type TreeView } from "../src/lib/data/plane/tree";
import type { Finding, Level } from "./audit-publication";

export const FOOTPRINT_WARN_BYTES = 100 * 1024 ** 2, FOOTPRINT_ERROR_BYTES = 800 * 1024 ** 2;     // the contract's lightness target, and 80% of Neon Free's 1 GB
export const CLICK_RETENTION_DAYS = 90, EBAY_ROW_HOURS = 72, DEMAND_RETENTION_DAYS = 90, LAUNCH_PROMO_CAP = 50, RUN_STALE_HOURS = 36;
export const TIERS: readonly string[] = ["plus", "premium"];
/** The tables whose rows carry a productId or sealed id with no foreign key, and which id space each belongs to. */
export const ORPHAN_COLUMNS: { table: string; column: string; space: "card" | "sealed" | "either" }[] = [
  { table: "PriceAlert", column: "cardId", space: "card" }, { table: "CollectionCard", column: "cardId", space: "card" }, { table: "SealedWatch", column: "sealedId", space: "sealed" },
  { table: "PublishedDeck", column: "commanderCardId", space: "card" }, { table: "PublishedDeck", column: "cardIds", space: "card" },
  { table: "EbayBest", column: "productId", space: "either" }, { table: "EbayPanel", column: "productId", space: "either" }, { table: "CardStat", column: "cardId", space: "card" },
  { table: "PriceReport", column: "productId", space: "either" },
];
export interface DbFacts {
  sizeBytes: number | null; tables: { name: string; rows: number; bytes: number }[];
  clickOld: number; clickOldestDays: number | null; ebayOld: { best: number; panel: number }; demandOld: number;
  ledger: { windowKey: string; cap: number; claimed: number; spent: number }[]; launchPromo: number | null;
  badTier: { tier: string; n: number }[]; premiumNoTier: number; lastRunAt: string | null;
  orphans: { table: string; column: string; checked: number; missing: number[] }[] | null;
}
const mb = (b: number): string => `${(b / 1024 ** 2).toFixed(1)} MB`;
/** Judges the facts. Pure. */
export function evaluateDb(f: DbFacts, now: Date): Finding[] {
  const out: Finding[] = []; const add = (level: Level, code: string, message: string) => out.push({ level, code, message });
  if (f.sizeBytes != null) {
    if (f.sizeBytes >= FOOTPRINT_ERROR_BYTES) add("error", "FOOTPRINT", `the database is ${mb(f.sizeBytes)}, past 80% of Neon Free's 1 GB (the contract's target is ${mb(FOOTPRINT_WARN_BYTES)}): ${f.tables.slice(0, 3).map((t) => `${t.name} ${mb(t.bytes)}`).join(", ")}`);
    else if (f.sizeBytes >= FOOTPRINT_WARN_BYTES) add("warn", "FOOTPRINT", `the database is ${mb(f.sizeBytes)}, over the ${mb(FOOTPRINT_WARN_BYTES)} the design budgets for 10,000 members: ${f.tables.slice(0, 3).map((t) => `${t.name} ${mb(t.bytes)}`).join(", ")}`);
  }
  if (f.clickOld > 0) add(f.clickOldestDays != null && f.clickOldestDays > CLICK_RETENTION_DAYS + 10 ? "error" : "warn", "CLICK_RETENTION", `${f.clickOld} click event(s) older than ${CLICK_RETENTION_DAYS} days remain${f.clickOldestDays != null ? ` (the oldest is ${f.clickOldestDays} days old)` : ""}: the daily sweep did not run`);
  if (f.ebayOld.best + f.ebayOld.panel > 0) add("error", "EBAY_RETENTION", `eBay listing rows older than ${EBAY_ROW_HOURS + 24} hours remain (EbayBest ${f.ebayOld.best}, EbayPanel ${f.ebayOld.panel}): the licence allows 72 hours, and the page shows an age label on every tile (C21)`);
  if (f.demandOld > 0) add("warn", "DEMAND_RETENTION", `${f.demandOld} DemandDay row(s) older than ${DEMAND_RETENTION_DAYS} days remain`);
  for (const w of f.ledger) if (w.spent > w.cap) add("error", "EBAY_OVERSPEND", `eBay ledger window ${w.windowKey}: ${w.spent} calls spent over a cap of ${w.cap}`);
  if (f.launchPromo != null && f.launchPromo > LAUNCH_PROMO_CAP) add("error", "LAUNCH_PROMO", `the launch-promo counter is ${f.launchPromo}, over its cap of ${LAUNCH_PROMO_CAP}: the claim is one atomic capped upsert`);
  for (const b of f.badTier) add("error", "TIER_VALUE", `${b.n} user(s) have premiumTier "${b.tier}", which is neither plus nor premium`);
  if (f.premiumNoTier > 0) add("error", "PREMIUM_NO_TIER", `${f.premiumNoTier} user(s) have a premium end date and no tier`);
  if (f.lastRunAt) { const h = (now.getTime() - Date.parse(f.lastRunAt)) / 3_600_000; if (h >= RUN_STALE_HOURS) add("warn", "RUN_STALE", `the newest ImportRun row is ${h.toFixed(0)} hours old (it is a courtesy record; status.json in the data repository is the source of truth)`); }
  else add("warn", "RUN_NONE", "no ImportRun row yet");
  if (f.orphans) for (const o of f.orphans) if (o.missing.length) add("error", "ORPHAN", `${o.table}.${o.column}: ${o.missing.length} of ${o.checked} distinct product ids are not in the published catalogue (e.g. ${o.missing.slice(0, 5).join(", ")})`);
  return out;
}
/** The id spaces of a published tree: card productIds (cat/) and sealed productIds (sl/list-*). */
export function idSpaces(t: TreeView): { cards: Set<number>; sealed: Set<number> } {
  const cards = new Set<number>(), sealed = new Set<number>();
  for (const f of t.files()) {
    if (f.startsWith("cat/")) for (const r of (JSON.parse(t.read(f)) as { c: CatRow[] }).c) cards.add(r[0]);
    else if (/^sl\/list-\d+\.json$/.test(f)) for (const r of (JSON.parse(t.read(f)) as SealedListFile).s) sealed.add(r[0]);
  }
  return { cards, sealed };
}
/** Which of `ids` are in no space the column may point into. Pure. */
export function missingIds(ids: readonly number[], space: "card" | "sealed" | "either", s: { cards: Set<number>; sealed: Set<number> }): number[] {
  return ids.filter((id) => !(space === "card" ? s.cards.has(id) : space === "sealed" ? s.sealed.has(id) : s.cards.has(id) || s.sealed.has(id)));
}

async function collect(spaces: { cards: Set<number>; sealed: Set<number> } | null): Promise<DbFacts> {
  const { prisma: db } = await import("../src/lib/db");
  for (let i = 1; ; i++) { try { await db.$queryRaw`SELECT 1`; break; } catch (e) { if (i >= 6) throw e; console.log(`  ...database cold (attempt ${i}/6), retrying in 10s`); await new Promise((r) => setTimeout(r, 10_000)); } }
  const now = Date.now(), ago = (ms: number): Date => new Date(now - ms);
  // the PRIVATE footprint: the published plane (table "PlaneFile", DECISIONS.md 2026-10-09) is measured by audit-publication.ts against its own limit, not against the 100 MB the design budgets for 10,000 members
  const size = await db.$queryRaw<{ s: bigint }[]>`SELECT pg_database_size(current_database()) - COALESCE(pg_total_relation_size(to_regclass('public."PlaneFile"')), 0) AS s`;
  const tabs = await db.$queryRaw<{ name: string; rows: bigint; bytes: bigint }[]>`SELECT relname AS name, n_live_tup AS rows, pg_total_relation_size(relid) AS bytes FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 12`;
  const oldestClick = await db.clickEvent.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } });
  const orphans: NonNullable<DbFacts["orphans"]> = [];
  if (spaces) {
    for (const o of ORPHAN_COLUMNS) {
      let ids: number[] = [];
      if (o.table === "PriceAlert") ids = (await db.priceAlert.findMany({ distinct: ["cardId"], select: { cardId: true } })).map((r) => r.cardId);
      else if (o.table === "CollectionCard") ids = (await db.collectionCard.findMany({ distinct: ["cardId"], select: { cardId: true } })).map((r) => r.cardId);
      else if (o.table === "SealedWatch") ids = (await db.sealedWatch.findMany({ distinct: ["sealedId"], select: { sealedId: true } })).map((r) => r.sealedId);
      else if (o.table === "PublishedDeck" && o.column === "commanderCardId") ids = (await db.publishedDeck.findMany({ distinct: ["commanderCardId"], select: { commanderCardId: true } })).map((r) => r.commanderCardId);
      else if (o.table === "PublishedDeck") ids = [...new Set((await db.publishedDeck.findMany({ select: { cardIds: true } })).flatMap((r) => r.cardIds))];
      else if (o.table === "EbayBest") ids = (await db.ebayBest.findMany({ distinct: ["productId"], select: { productId: true } })).map((r) => r.productId);
      else if (o.table === "EbayPanel") ids = (await db.ebayPanel.findMany({ distinct: ["productId"], select: { productId: true } })).map((r) => r.productId);
      else if (o.table === "CardStat") ids = (await db.cardStat.findMany({ select: { cardId: true } })).map((r) => r.cardId);
      else if (o.table === "PriceReport") ids = (await db.priceReport.findMany({ distinct: ["productId"], select: { productId: true } })).map((r) => r.productId);
      orphans.push({ table: o.table, column: o.column, checked: ids.length, missing: missingIds(ids, o.space, spaces) });
    }
  }
  const badTierRows = await db.user.groupBy({ by: ["premiumTier"], _count: { _all: true }, where: { premiumTier: { notIn: [...TIERS] } } });
  const lastRun = await db.importRun.findFirst({ orderBy: { startedAt: "desc" }, select: { startedAt: true } });
  const promo = await db.counter.findUnique({ where: { key: "launch-promo" }, select: { value: true } });
  const demandCutoff = new Date(now - DEMAND_RETENTION_DAYS * 86_400_000).toISOString().slice(0, 10);
  const facts: DbFacts = {
    sizeBytes: size[0] ? Number(size[0].s) : null, tables: tabs.map((t) => ({ name: t.name, rows: Number(t.rows), bytes: Number(t.bytes) })),
    clickOld: await db.clickEvent.count({ where: { createdAt: { lt: ago(CLICK_RETENTION_DAYS * 86_400_000) } } }),
    clickOldestDays: oldestClick ? Math.floor((now - oldestClick.createdAt.getTime()) / 86_400_000) : null,
    ebayOld: { best: await db.ebayBest.count({ where: { checkedAt: { lt: ago((EBAY_ROW_HOURS + 24) * 3_600_000) } } }), panel: await db.ebayPanel.count({ where: { checkedAt: { lt: ago((EBAY_ROW_HOURS + 24) * 3_600_000) } } }) },
    demandOld: await db.demandDay.count({ where: { day: { lt: demandCutoff } } }),
    ledger: (await db.ebayLedger.findMany({ orderBy: { windowKey: "desc" }, take: 14, select: { windowKey: true, cap: true, claimed: true, spent: true } })),
    launchPromo: promo?.value ?? null,
    badTier: badTierRows.map((r) => ({ tier: r.premiumTier, n: r._count._all })),
    premiumNoTier: await db.user.count({ where: { premiumUntil: { not: null }, premiumTier: "" } }),
    lastRunAt: lastRun ? lastRun.startedAt.toISOString() : null,
    orphans: spaces ? orphans : null,
  };
  await db.$disconnect().catch(() => undefined);
  return facts;
}

export async function main(argv: readonly string[], env: Record<string, string | undefined>): Promise<number> {
  if (!env.DATABASE_URL) { console.log("DATABASE_URL is not set: no database to audit (a green no-op)."); return 0; }
  const i = argv.indexOf("--dir"), dirArg = (i >= 0 ? argv[i + 1] : undefined) ?? env.PLANE_DIR, v1 = dirArg ? path.join(path.resolve(dirArg), "v1") : null;
  const spaces = v1 && fs.existsSync(v1) ? idSpaces(fsTree(v1)) : null;
  const facts = await collect(spaces), findings = evaluateDb(facts, new Date());
  console.log(`Neon: ${facts.sizeBytes != null ? mb(facts.sizeBytes) : "size unknown"} (budget ${mb(FOOTPRINT_WARN_BYTES)}); biggest tables: ${facts.tables.slice(0, 6).map((t) => `${t.name} ${t.rows} rows ${mb(t.bytes)}`).join(", ") || "none"}`);
  console.log(spaces ? `orphan sweep against ${spaces.cards.size} card and ${spaces.sealed.size} sealed product ids: ${facts.orphans!.map((o) => `${o.table}.${o.column} ${o.checked}`).join(", ")}` : "orphan sweep skipped: no published tree (--dir or PLANE_DIR)");
  if (!findings.length) console.log("no finding.");
  for (const f of findings) { console.log(`  ${f.level === "error" ? "ERROR" : "warn "} [${f.code}] ${f.message}`); if (f.level === "error") console.log(`::error title=Database (${f.code})::${f.message}`); }
  if (argv.includes("--json")) console.log(JSON.stringify({ facts, findings }, null, 1));
  return findings.some((f) => f.level === "error") ? 1 : 0;
}
if (process.argv[1] && /scripts[\\/]db-audit\.ts$/.test(process.argv[1])) main(process.argv.slice(2), process.env).then((c) => { process.exitCode = c; }).catch((e) => { console.error(e); process.exitCode = 1; });
