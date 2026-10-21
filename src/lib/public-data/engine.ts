// ─────────────────────────────────────────────────────────────────────────────
// The in-memory query engine behind the public data files. Ported unchanged from RiftCompare
// (TCGEmpire src/lib/public-data/engine.ts, "Public data moves out of Neon into the repository",
// 2026-10-09), where it has served ~160 read sites since; DexCompare adopted it on 2026-10-16.
// ─────────────────────────────────────────────────────────────────────────────
// It answers the same Prisma read calls the site already makes — findMany,
// findFirst, findUnique, count, aggregate, groupBy — for the public models only
// (lib/public-data/models.ts), against rows loaded from data/public/. That is
// what lets every read site move off Neon without being rewritten: lib/db.ts
// routes the call here instead of to Postgres.
//
// THE CONTRACT: it either answers EXACTLY as Postgres would for the shapes this
// codebase uses, or it throws PublicDataUnsupported, and the caller runs the
// query against Neon instead. It never guesses. An operator it does not know, a
// relation to a private model, a cursor or a `having` clause are all refusals,
// not approximations. Every refusal is logged once per shape
// ([public-data:unsupported]) so the gap can be closed.
//
// SEMANTICS MATCHED TO POSTGRES:
//   • NULL never satisfies a comparison: `not`, `notIn`, `lt`… all exclude NULL
//     rows, as SQL's three-valued logic does (Prisma's `not: x` is `<> x`).
//   • ORDER BY puts NULLs last ascending and first descending, unless `nulls` is
//     given — Postgres's default, which Prisma passes through.
//   • Strings compare by code point (the C collation). Neon's default database
//     collation can differ from that for punctuation and case in rare ties; the
//     only effect is the order of two cards whose names differ only that way.
//   • `mode: "insensitive"` lower-cases both sides (ILIKE / LOWER() =).
//   • Aggregates over no rows return null (_min/_max/_sum/_avg) and 0 (_count).
import { PublicDataUnsupported, type ModelName, type FieldInfo, modelInfo, isPublicModel } from "./models";

/** Where rows come from. Implemented by lib/public-data/store.ts; tests pass a fixture. */
export interface RowSource {
  /** Every row of a model. */
  all(model: ModelName): readonly Row[];
  /** Rows of `model` whose `field` equals one of `values`; may use a file index. */
  byField(model: ModelName, field: string, values: readonly unknown[]): readonly Row[];
}

export type Row = Record<string, unknown>;
type Args = Record<string, unknown> | undefined;

const unsupported = (why: string): never => {
  throw new PublicDataUnsupported(why);
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !(v instanceof Date) && !Array.isArray(v);

// ── Values ───────────────────────────────────────────────────────────────────

function cmpScalar(a: unknown, b: unknown): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  if (a instanceof Date || b instanceof Date) {
    const x = a instanceof Date ? a.getTime() : new Date(a as string).getTime();
    const y = b instanceof Date ? b.getTime() : new Date(b as string).getTime();
    return x - y;
  }
  return unsupported(`comparison between ${typeof a} and ${typeof b}`);
}

function eq(a: unknown, b: unknown, insensitive: boolean): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (insensitive && typeof a === "string" && typeof b === "string") return a.toLowerCase() === b.toLowerCase();
  if (a instanceof Date || b instanceof Date) return cmpScalar(a, b) === 0;
  return a === b;
}

const lower = (s: unknown, insensitive: boolean) => (insensitive && typeof s === "string" ? s.toLowerCase() : s);

// ── WHERE ────────────────────────────────────────────────────────────────────

const SCALAR_OPS = new Set([
  "equals", "not", "in", "notIn", "lt", "lte", "gt", "gte", "contains", "startsWith", "endsWith", "mode", "has",
]);

function matchScalar(field: FieldInfo, value: unknown, filter: unknown): boolean {
  // Shorthand: `field: value` / `field: null`.
  if (filter === null) return value === null || value === undefined;
  if (!isPlainObject(filter)) {
    if (field.isList) return unsupported(`list equality on ${field.name}`);
    return eq(value, filter, false);
  }
  const insensitive = filter.mode === "insensitive";
  if (filter.mode !== undefined && filter.mode !== "insensitive" && filter.mode !== "default") {
    unsupported(`mode ${String(filter.mode)}`);
  }
  for (const [op, arg] of Object.entries(filter)) {
    if (arg === undefined) continue; // Prisma ignores undefined operators
    if (!SCALAR_OPS.has(op)) unsupported(`operator ${op} on ${field.name}`);
    switch (op) {
      case "mode":
        break;
      case "equals":
        if (arg === null) {
          if (!(value === null || value === undefined)) return false;
        } else if (!eq(value, arg, insensitive)) return false;
        break;
      case "not":
        if (arg === null) {
          if (value === null || value === undefined) return false;
        } else if (isPlainObject(arg)) {
          // A nested filter: NOT (filter). NULL rows stay excluded (SQL).
          if (value === null || value === undefined) return false;
          if (matchScalar(field, value, { ...arg, ...(insensitive ? { mode: "insensitive" } : {}) })) return false;
        } else {
          if (value === null || value === undefined) return false;
          if (eq(value, arg, insensitive)) return false;
        }
        break;
      case "in":
      case "notIn": {
        if (!Array.isArray(arg)) unsupported(`${op} with a non-array`);
        if (value === null || value === undefined) return false;
        const hit = (arg as unknown[]).some((x) => eq(value, x, insensitive));
        if (op === "in" ? !hit : hit) return false;
        break;
      }
      case "lt":
      case "lte":
      case "gt":
      case "gte": {
        if (value === null || value === undefined || arg === null || arg === undefined) return false;
        const c = cmpScalar(lower(value, insensitive), lower(arg, insensitive));
        if (op === "lt" && !(c < 0)) return false;
        if (op === "lte" && !(c <= 0)) return false;
        if (op === "gt" && !(c > 0)) return false;
        if (op === "gte" && !(c >= 0)) return false;
        break;
      }
      case "contains":
      case "startsWith":
      case "endsWith": {
        if (typeof value !== "string" || typeof arg !== "string") return false;
        const v = lower(value, insensitive) as string;
        const a = lower(arg, insensitive) as string;
        if (op === "contains" && !v.includes(a)) return false;
        if (op === "startsWith" && !v.startsWith(a)) return false;
        if (op === "endsWith" && !v.endsWith(a)) return false;
        break;
      }
      case "has":
        if (!field.isList || !Array.isArray(value)) return false;
        if (!value.some((x) => eq(x, arg, false))) return false;
        break;
    }
  }
  return true;
}

function asArray(v: unknown): unknown[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

export function matchWhere(src: RowSource, model: ModelName, row: Row, where: unknown): boolean {
  if (where === undefined || where === null) return true;
  if (!isPlainObject(where)) return unsupported(`where of type ${typeof where}`);
  const info = modelInfo(model);
  for (const [key, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (key === "AND") {
      if (!asArray(cond).every((w) => matchWhere(src, model, row, w))) return false;
      continue;
    }
    if (key === "OR") {
      const list = asArray(cond);
      // Prisma: OR: [] matches nothing.
      if (!list.some((w) => matchWhere(src, model, row, w))) return false;
      continue;
    }
    if (key === "NOT") {
      if (asArray(cond).some((w) => matchWhere(src, model, row, w))) return false;
      continue;
    }
    const field = info.fields.get(key);
    if (!field) {
      // A compound unique selector (`itemId_country: { itemId, country }`).
      if (isPlainObject(cond) && info.compoundKeys.has(key)) {
        if (!matchWhere(src, model, row, cond)) return false;
        continue;
      }
      return unsupported(`unknown field ${model}.${key}`);
    }
    if (field.kind === "object") {
      if (!matchRelation(src, model, field, row, cond)) return false;
      continue;
    }
    if (!matchScalar(field, row[key], cond)) return false;
  }
  return true;
}

function matchRelation(src: RowSource, model: ModelName, field: FieldInfo, row: Row, cond: unknown): boolean {
  const target = field.type as ModelName;
  if (!isPublicModel(target)) return unsupported(`relation ${model}.${field.name} -> private ${field.type}`);
  if (field.isList) {
    if (!isPlainObject(cond)) return unsupported(`list relation filter on ${field.name}`);
    const related = relatedRows(src, model, field, row);
    for (const [op, w] of Object.entries(cond)) {
      if (w === undefined) continue;
      if (op === "some") {
        if (!related.some((r) => matchWhere(src, target, r, w))) return false;
      } else if (op === "every") {
        if (!related.every((r) => matchWhere(src, target, r, w))) return false;
      } else if (op === "none") {
        if (related.some((r) => matchWhere(src, target, r, w))) return false;
      } else return unsupported(`list relation operator ${op}`);
    }
    return true;
  }
  const one = relatedOne(src, model, field, row);
  if (cond === null) return one === null;
  if (!isPlainObject(cond)) return unsupported(`to-one relation filter on ${field.name}`);
  if ("is" in cond || "isNot" in cond) {
    if (cond.is !== undefined) {
      if (cond.is === null ? one !== null : one === null || !matchWhere(src, target, one, cond.is)) return false;
    }
    if (cond.isNot !== undefined) {
      if (cond.isNot === null ? one === null : one !== null && matchWhere(src, target, one, cond.isNot)) return false;
    }
    return true;
  }
  return one !== null && matchWhere(src, target, one, cond);
}

// ── Relations ────────────────────────────────────────────────────────────────

function relatedRows(src: RowSource, model: ModelName, field: FieldInfo, row: Row): readonly Row[] {
  const target = field.type as ModelName;
  if (!isPublicModel(target)) return unsupported(`relation ${model}.${field.name} -> private ${field.type}`);
  const opposite = field.opposite;
  if (!opposite || !opposite.fromFields.length) return unsupported(`relation ${model}.${field.name} without a foreign key`);
  if (opposite.fromFields.length !== 1) return unsupported(`compound foreign key on ${field.name}`);
  const fk = opposite.fromFields[0];
  const pk = opposite.toFields[0];
  return src.byField(target, fk, [row[pk]]);
}

function relatedOne(src: RowSource, model: ModelName, field: FieldInfo, row: Row): Row | null {
  const target = field.type as ModelName;
  if (!isPublicModel(target)) return unsupported(`relation ${model}.${field.name} -> private ${field.type}`);
  if (field.fromFields.length === 1) {
    const v = row[field.fromFields[0]];
    if (v === null || v === undefined) return null;
    return src.byField(target, field.toFields[0], [v])[0] ?? null;
  }
  // The FK lives on the other side (a 1:1 back-reference).
  return relatedRows(src, model, field, row)[0] ?? null;
}

// ── ORDER BY / DISTINCT / paging ─────────────────────────────────────────────

type SortKey = { get: (r: Row) => unknown; desc: boolean; nulls: "first" | "last" };

function sortKeys(src: RowSource, model: ModelName, orderBy: unknown): SortKey[] {
  const info = modelInfo(model);
  const out: SortKey[] = [];
  for (const entry of asArray(orderBy)) {
    if (!isPlainObject(entry)) unsupported("orderBy entry");
    for (const [key, spec] of Object.entries(entry as Record<string, unknown>)) {
      if (spec === undefined) continue;
      const field = info.fields.get(key);
      if (!field) unsupported(`orderBy on ${key}`);
      if (field!.kind === "object") {
        // Ordering by a to-one relation's scalar: { card: { name: "asc" } }.
        if (field!.isList || !isPlainObject(spec)) unsupported(`orderBy on relation ${key}`);
        const inner = sortKeys(src, field!.type as ModelName, spec);
        for (const k of inner) {
          out.push({ ...k, get: (r) => {
            const one = relatedOne(src, model, field!, r);
            return one ? k.get(one) : null;
          } });
        }
        continue;
      }
      let dir: unknown = spec;
      let nulls: unknown;
      if (isPlainObject(spec)) {
        dir = spec.sort;
        nulls = spec.nulls;
      }
      if (dir !== "asc" && dir !== "desc") unsupported(`orderBy direction ${String(dir)}`);
      const desc = dir === "desc";
      out.push({
        get: (r) => r[key],
        desc,
        nulls: nulls === "first" || nulls === "last" ? nulls : desc ? "first" : "last",
      });
    }
  }
  return out;
}

function compareRows(keys: SortKey[], a: Row, b: Row): number {
  for (const k of keys) {
    const x = k.get(a);
    const y = k.get(b);
    const xn = x === null || x === undefined;
    const yn = y === null || y === undefined;
    if (xn || yn) {
      if (xn && yn) continue;
      return xn === (k.nulls === "first") ? -1 : 1;
    }
    const c = cmpScalar(x, y);
    if (c !== 0) return k.desc ? -c : c;
  }
  return 0;
}

function selectRows(src: RowSource, model: ModelName, rows: readonly Row[], args: Args): Row[] {
  const a = args ?? {};
  if (a.cursor !== undefined) unsupported("cursor pagination");
  let out = rows.filter((r) => matchWhere(src, model, r, a.where));
  if (a.orderBy !== undefined) {
    const keys = sortKeys(src, model, a.orderBy);
    // Stable sort: equal keys keep their source order, like Postgres for a
    // single-table scan without an index on the key (not guaranteed by SQL
    // either, so no caller may depend on tie order).
    out = out.map((r, i) => ({ r, i })).sort((p, q) => compareRows(keys, p.r, q.r) || p.i - q.i).map((p) => p.r);
  }
  if (a.distinct !== undefined) {
    const fields = asArray(a.distinct) as string[];
    const seen = new Set<string>();
    out = out.filter((r) => {
      const k = JSON.stringify(fields.map((f) => (r[f] instanceof Date ? (r[f] as Date).toISOString() : r[f])));
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  const skip = a.skip === undefined ? 0 : Number(a.skip);
  if (a.take !== undefined && Number(a.take) < 0) unsupported("negative take");
  const take = a.take === undefined ? undefined : Number(a.take);
  if (skip || take !== undefined) out = out.slice(skip, take === undefined ? undefined : skip + take);
  return out;
}

/** Narrow the scan when the WHERE pins an indexed field (Offer.productId, Product.slug). */
function candidateRows(src: RowSource, model: ModelName, where: unknown): readonly Row[] {
  if (isPlainObject(where)) {
    for (const field of modelInfo(model).indexedFields) {
      const c = where[field];
      if (typeof c === "string") return src.byField(model, field, [c]);
      if (isPlainObject(c) && Array.isArray(c.in) && Object.keys(c).every((k) => k === "in")) {
        return src.byField(model, field, c.in as unknown[]);
      }
      if (isPlainObject(c) && typeof c.equals === "string" && Object.keys(c).length === 1) {
        return src.byField(model, field, [c.equals]);
      }
    }
  }
  return src.all(model);
}

// ── Projection (select / include / _count) ───────────────────────────────────

function project(src: RowSource, model: ModelName, row: Row, args: Args): Row {
  const info = modelInfo(model);
  const a = args ?? {};
  if (a.select !== undefined && a.include !== undefined) unsupported("select and include together");
  const out: Row = {};
  const relationArgs = (spec: unknown): Args => (isPlainObject(spec) ? spec : undefined);
  const addRelation = (name: string, spec: unknown) => {
    const field = info.fields.get(name);
    if (!field || field.kind !== "object") return unsupported(`select of ${model}.${name}`);
    const target = field.type as ModelName;
    if (!isPublicModel(target)) return unsupported(`relation ${model}.${name} -> private ${field.type}`);
    if (field.isList) {
      const ra = relationArgs(spec);
      out[name] = selectRows(src, target, relatedRows(src, model, field, row), ra).map((r) => project(src, target, r, ra));
    } else {
      const one = relatedOne(src, model, field, row);
      out[name] = one ? project(src, target, one, relationArgs(spec)) : null;
    }
  };
  const addCount = (spec: unknown) => {
    const counts: Row = {};
    let wanted: Record<string, unknown>;
    if (spec === true) {
      wanted = {};
      for (const f of info.fields.values()) if (f.kind === "object" && f.isList) wanted[f.name] = true;
    } else if (isPlainObject(spec) && isPlainObject(spec.select)) {
      wanted = spec.select;
    } else return unsupported("_count shape");
    for (const [name, w] of Object.entries(wanted)) {
      if (!w) continue;
      const field = info.fields.get(name);
      if (!field || field.kind !== "object" || !field.isList) return unsupported(`_count of ${name}`);
      const target = field.type as ModelName;
      const related = relatedRows(src, model, field, row);
      const where = isPlainObject(w) ? w.where : undefined;
      counts[name] = where === undefined ? related.length : related.filter((r) => matchWhere(src, target, r, where)).length;
    }
    out._count = counts;
  };
  if (isPlainObject(a.select)) {
    for (const [key, spec] of Object.entries(a.select)) {
      if (!spec) continue;
      if (key === "_count") {
        addCount(spec);
        continue;
      }
      const field = info.fields.get(key);
      if (!field) return unsupported(`select of unknown ${model}.${key}`);
      if (field.kind === "object") addRelation(key, spec);
      else out[key] = cloneValue(row[key]);
    }
    return out;
  }
  for (const f of info.fields.values()) if (f.kind !== "object") out[f.name] = cloneValue(row[f.name]);
  if (isPlainObject(a.include)) {
    for (const [key, spec] of Object.entries(a.include)) {
      if (!spec) continue;
      if (key === "_count") addCount(spec);
      else addRelation(key, spec);
    }
  }
  return out;
}

function cloneValue(v: unknown): unknown {
  if (v === undefined) return null;
  if (v instanceof Date) return new Date(v.getTime());
  if (Array.isArray(v)) return v.slice();
  return v;
}

// ── Aggregates ───────────────────────────────────────────────────────────────

function aggregateOf(rows: readonly Row[], kind: "_min" | "_max" | "_sum" | "_avg", fields: unknown): Row {
  if (!isPlainObject(fields)) return unsupported(`${kind} shape`);
  const out: Row = {};
  for (const [f, on] of Object.entries(fields)) {
    if (!on) continue;
    const vals = rows.map((r) => r[f]).filter((v) => v !== null && v !== undefined);
    if (!vals.length) {
      out[f] = null;
      continue;
    }
    if (kind === "_min") out[f] = cloneValue(vals.reduce((m, v) => (cmpScalar(v, m) < 0 ? v : m)));
    else if (kind === "_max") out[f] = cloneValue(vals.reduce((m, v) => (cmpScalar(v, m) > 0 ? v : m)));
    else {
      if (vals.some((v) => typeof v !== "number")) return unsupported(`${kind} of a non-number`);
      const sum = (vals as number[]).reduce((s, v) => s + v, 0);
      out[f] = kind === "_sum" ? sum : sum / vals.length;
    }
  }
  return out;
}

function countOf(rows: readonly Row[], spec: unknown): unknown {
  if (spec === true) return rows.length;
  if (!isPlainObject(spec)) return unsupported("_count shape");
  const out: Row = {};
  for (const [f, on] of Object.entries(spec)) {
    if (!on) continue;
    out[f] = f === "_all" ? rows.length : rows.filter((r) => r[f] !== null && r[f] !== undefined).length;
  }
  return out;
}

const AGG_KEYS = ["_count", "_min", "_max", "_sum", "_avg"] as const;

// ── Operations ───────────────────────────────────────────────────────────────

export function runPublicQuery(src: RowSource, model: ModelName, operation: string, args: Args): unknown {
  if (!isPublicModel(model)) return unsupported(`model ${model} is not public`);
  const a = (args ?? {}) as Record<string, unknown>;
  switch (operation) {
    case "findMany":
      return selectRows(src, model, candidateRows(src, model, a.where), a).map((r) => project(src, model, r, a));
    case "findFirst": {
      const rows = selectRows(src, model, candidateRows(src, model, a.where), { ...a, take: 1 });
      return rows.length ? project(src, model, rows[0], a) : null;
    }
    case "findUnique": {
      const rows = selectRows(src, model, candidateRows(src, model, a.where), { where: a.where });
      if (rows.length > 1) return unsupported(`findUnique matched ${rows.length} rows`);
      return rows.length ? project(src, model, rows[0], a) : null;
    }
    case "count": {
      const rows = selectRows(src, model, candidateRows(src, model, a.where), { ...a, select: undefined });
      if (a.select === undefined || a.select === true) return rows.length;
      return countOf(rows, a.select);
    }
    case "aggregate": {
      const rows = selectRows(src, model, candidateRows(src, model, a.where), a);
      const out: Row = {};
      for (const k of AGG_KEYS) {
        if (a[k] === undefined) continue;
        out[k] = k === "_count" ? countOf(rows, a[k]) : aggregateOf(rows, k, a[k]);
      }
      return out;
    }
    case "groupBy":
      return groupBy(src, model, a);
    default:
      return unsupported(`operation ${operation}`);
  }
}

function groupBy(src: RowSource, model: ModelName, a: Record<string, unknown>): Row[] {
  if (a.having !== undefined) unsupported("groupBy having");
  const by = asArray(a.by) as string[];
  if (!by.length) unsupported("groupBy without by");
  const rows = selectRows(src, model, candidateRows(src, model, a.where), { where: a.where });
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = JSON.stringify(by.map((f) => (r[f] instanceof Date ? (r[f] as Date).toISOString() : r[f] ?? null)));
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(r);
  }
  let out: Row[] = [];
  for (const g of groups.values()) {
    const row: Row = {};
    for (const f of by) row[f] = cloneValue(g[0][f]);
    for (const k of AGG_KEYS) {
      if (a[k] === undefined) continue;
      row[k] = k === "_count" ? countOf(g, a[k]) : aggregateOf(g, k, a[k]);
    }
    out.push(row);
  }
  if (a.orderBy !== undefined) {
    const keys: SortKey[] = [];
    for (const entry of asArray(a.orderBy)) {
      if (!isPlainObject(entry)) unsupported("groupBy orderBy entry");
      for (const [key, spec] of Object.entries(entry as Record<string, unknown>)) {
        if ((AGG_KEYS as readonly string[]).includes(key)) {
          if (!isPlainObject(spec)) unsupported("groupBy aggregate orderBy");
          for (const [f, dir] of Object.entries(spec as Record<string, unknown>)) {
            if (dir !== "asc" && dir !== "desc") unsupported("groupBy orderBy direction");
            keys.push({
              get: (r) => {
                const agg = r[key];
                return isPlainObject(agg) ? agg[f] : agg;
              },
              desc: dir === "desc",
              nulls: dir === "desc" ? "first" : "last",
            });
          }
        } else {
          if (!by.includes(key)) unsupported(`groupBy orderBy on ${key}`);
          keys.push(...sortKeys(src, model, { [key]: spec }));
        }
      }
    }
    out = out.map((r, i) => ({ r, i })).sort((p, q) => compareRows(keys, p.r, q.r) || p.i - q.i).map((p) => p.r);
  }
  const skip = a.skip === undefined ? 0 : Number(a.skip);
  const take = a.take === undefined ? undefined : Number(a.take);
  if (skip || take !== undefined) out = out.slice(skip, take === undefined ? undefined : skip + take);
  return out;
}
