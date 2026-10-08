// tests/helpers/plane-golden.ts (owner WP01a). The golden samples of the wire formats: one file per family from the mini tree, arrays trimmed to 3 rows, keys in file order. Used by checks/make-plane-fixtures.ts (writes) and tests/plane-format.test.ts (compares).
import { miniFull } from "./plane-tree";
import { familyOf } from "../../src/lib/data/plane/shards";

const TRIM = 3;
function trim(v: unknown): unknown {
  if (Array.isArray(v)) {
    const rows = v.length > 0 && v.every((x) => x !== null && typeof x === "object");                       // a list of rows or objects: keep the first three
    const column = !rows && v.length > 100;                                                                  // a long primitive column (ix/*): keep the first three
    return (rows && v.length > TRIM ? v.slice(0, TRIM) : column ? v.slice(0, TRIM) : v).map(trim);
  }
  if (typeof v === "string" && v.length > 60) return `${v.slice(0, 12)}... (${v.length} chars, one per row)`;                   // the character columns of ix/k (rar, cls, pt)
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, trim(x)]));
  return v;
}
/** family name (as familyOf prints it, "/" replaced by "-") -> the trimmed content of the first file of that family in the day-3 mini tree. */
export function goldenFiles(): Record<string, unknown> {
  const t = miniFull({ day: 3 }); const out: Record<string, unknown> = {}; const firstOf = new Map<string, string>();
  for (const f of t.files()) { const fam = familyOf(f); if (!firstOf.has(fam)) firstOf.set(fam, f); }
  for (const [fam, f] of [...firstOf].sort((a, b) => (a[0] < b[0] ? -1 : 1))) out[fam.replace(/\//g, "-").replace(/\.json$/, "")] = { file: f, content: trim(JSON.parse(t.read(f))) };
  return out;
}
