// Builds the contents of data/public/ from the public tables' rows. PURE: no database, no file system. scripts/export-public-data.ts
// reads Neon and writes what this returns; tests feed it fixtures and read the result back through the store and the engine.
import { modelInfo, PUBLIC_MODELS, type ModelName } from "./models";
import { DERIVED_ID, FILES, META_FILE, PUBLIC_DATA_FORMAT, SORT_KEY, serializeRows, type PublicDataMeta } from "./format";

export type Tables = Record<ModelName, Record<string, unknown>[]>;

function sortVal(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") return String(v).padStart(16, "0");
  return String(v);
}

function sorted(model: ModelName, rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const keys = SORT_KEY[model];
  return [...rows].sort((a, b) => {
    for (const k of keys) {
      const x = sortVal(a[k]);
      const y = sortVal(b[k]);
      if (x < y) return -1;
      if (x > y) return 1;
    }
    return 0;
  });
}

/** Each store's most common Offer.lastSeen (exact, to the millisecond): the one an import stamps on all its rows. */
export function seenByStore(offers: readonly Record<string, unknown>[]): Record<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const o of offers) {
    if (!o.lastSeen) continue;
    const store = String(o.store);
    const m = new Date(o.lastSeen as Date | string).toISOString();
    const c = counts.get(store) ?? new Map<string, number>();
    c.set(m, (c.get(m) ?? 0) + 1);
    counts.set(store, c);
  }
  const out: Record<string, string> = {};
  for (const [store, c] of [...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    out[store] = [...c].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0][0];
  }
  return out;
}

/** One stored row: the public scalars in schema order, minus what the reader rebuilds (a derived id, a store's common lastSeen). */
function storedRow(model: ModelName, row: Record<string, unknown>, seen: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of modelInfo(model).scalarFields) {
    if (f.name === "id" && DERIVED_ID[model]) continue;
    let v = row[f.name];
    if (v === undefined) continue;
    if (v instanceof Date) v = v.toISOString();
    if (model === "Offer" && f.name === "lastSeen" && v !== null && seen[String(row.store)] === v) continue;
    out[f.name] = v;
  }
  return out;
}

/** Every file of data/public/ (name → contents), for these tables. */
export function buildPublicFiles(tables: Tables, opts: { generatedAt: Date; source: string }): Map<string, string> {
  const seen = seenByStore(tables.Offer);
  const files = new Map<string, string>();
  const counts: PublicDataMeta["counts"] = {};
  for (const model of PUBLIC_MODELS) {
    const rows = sorted(model, tables[model]).map((r) => storedRow(model, r, seen));
    counts[model] = rows.length;
    files.set(FILES[model], serializeRows(rows));
  }
  const meta: PublicDataMeta = { format: PUBLIC_DATA_FORMAT, generatedAt: opts.generatedAt.toISOString(), source: opts.source, counts, seen };
  files.set(META_FILE, `${JSON.stringify(meta, null, 1)}\n`);
  return files;
}
