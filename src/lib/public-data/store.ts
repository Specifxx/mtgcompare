// Reads data/public/ (format.ts) into memory for the query engine. SERVER ONLY (node:fs).
//
// The files are bundled with each release (next.config.js outputFileTracingIncludes), and every data export is a commit to main, so
// a release IS a data refresh: for the life of a server instance the files never change, and each is read at most once per instance
// and kept, with lazy per-field indexes (Offer by productId, Product by slug …) built on first use.
import fs from "node:fs";
import path from "node:path";
import { modelInfo, PUBLIC_MODELS, type ModelName } from "./models";
import type { Row, RowSource } from "./engine";
import { DERIVED_ID, FILES, META_FILE, PUBLIC_DATA_FORMAT, publicDataDir, stableId, type PublicDataMeta } from "./format";

/** The files are missing, unreadable or in a format this code does not know. */
export class PublicDataUnavailable extends Error {
  readonly publicDataUnavailable = true;
  constructor(message: string) {
    super(`[public-data] unavailable: ${message}`);
    this.name = "PublicDataUnavailable";
  }
}

function readJson<T>(file: string): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch (err) {
    throw new PublicDataUnavailable(`${path.relative(process.cwd(), file)}: ${(err as Error).message}`);
  }
}

/** Turn a stored row back into what Prisma would return. */
function revive(model: ModelName, raw: Record<string, unknown>, meta: PublicDataMeta): Row {
  const info = modelInfo(model);
  const row: Row = { ...raw };
  if (model === "Offer" && (row.lastSeen === undefined || row.lastSeen === null)) row.lastSeen = meta.seen[String(row.store)] ?? meta.generatedAt;
  for (const f of info.dateFields) {
    const v = row[f];
    if (typeof v === "string") row[f] = new Date(v);
  }
  for (const f of info.scalarFields) if (row[f.name] === undefined) row[f.name] = null;
  if (DERIVED_ID[model]) row.id = stableId(model, row);
  return row;
}

class FileSource implements RowSource {
  readonly meta: PublicDataMeta;
  private readonly rows = new Map<ModelName, Row[]>();
  private readonly indexes = new Map<string, Map<unknown, Row[]>>();

  constructor(private readonly dir: string) {
    const meta = readJson<PublicDataMeta>(path.join(dir, META_FILE));
    if (meta.format !== PUBLIC_DATA_FORMAT) throw new PublicDataUnavailable(`format ${meta.format}, this code reads ${PUBLIC_DATA_FORMAT}`);
    this.meta = meta;
  }

  all(model: ModelName): readonly Row[] {
    let rows = this.rows.get(model);
    if (!rows) {
      const raw = readJson<Record<string, unknown>[]>(path.join(this.dir, FILES[model]));
      rows = raw.map((r) => revive(model, r, this.meta));
      this.rows.set(model, rows);
    }
    return rows;
  }

  byField(model: ModelName, field: string, values: readonly unknown[]): readonly Row[] {
    const key = `${model}.${field}`;
    let index = this.indexes.get(key);
    if (!index) {
      index = new Map();
      for (const r of this.all(model)) {
        const v = r[field] instanceof Date ? (r[field] as Date).getTime() : r[field];
        let list = index.get(v);
        if (!list) index.set(v, (list = []));
        list.push(r);
      }
      this.indexes.set(key, index);
    }
    if (values.length === 1) return index.get(values[0] instanceof Date ? (values[0] as Date).getTime() : values[0]) ?? [];
    const out: Row[] = [];
    for (const v of new Set(values)) out.push(...(index.get(v instanceof Date ? (v as Date).getTime() : v) ?? []));
    return out;
  }
}

const g = globalThis as unknown as { __dexPublicData?: { dir: string; source: FileSource } };

/** The bundled files (throws PublicDataUnavailable when they are missing or in another format). */
export function publicDataSource(): FileSource {
  const dir = publicDataDir();
  if (g.__dexPublicData?.dir !== dir) g.__dexPublicData = { dir, source: new FileSource(dir) };
  return g.__dexPublicData.source;
}

/** Every row of a public model, for the raw-SQL replacements (lib/public-data/raw.ts). */
export function publicRows(model: ModelName): readonly Row[] {
  return publicDataSource().all(model);
}

/** Rows of `model` whose `field` is one of `values`, through the index. */
export function publicRowsBy(model: ModelName, field: string, values: readonly unknown[]): readonly Row[] {
  return publicDataSource().byField(model, field, values);
}

/** Where public reads come from right now, for the x-dex-data header: "files <snapshot time> <source>", or "db" when they cannot be read. */
export function publicDataStatus(): string {
  try {
    const { generatedAt, source } = publicDataSource().meta;
    return `files ${generatedAt} ${source}`;
  } catch {
    return "db";
  }
}

/** Forget the loaded files (tests). */
export function resetPublicData(): void {
  g.__dexPublicData = undefined;
}

export { PUBLIC_MODELS };
