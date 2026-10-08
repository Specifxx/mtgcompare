// Generate data/slug-seed.json from a PUBLISHED tree (the bootstrap output or a checkout of branch data): the fallback memory of a first run or a lost branch (contract 4.1, 6.2). Only what a fresh build cannot reproduce from the sources alone is saved:
// the write-once Set.tok of every group, the card slugs that took the -p<productId> collision form (with the winner of the bare slug), and the oracles whose bare slug is shared (the oldest keeps it, the others carry -<uuid8>) or that carry -<uuid8> although no namesake is in the tree. A catalogue rebuilt from nothing with this
// seed reproduces every URL a search engine already knows. The file is committed to `main` (it is small) and read by scripts/import.ts only while PrevState is empty.
//   npx tsx scripts/slug-seed.ts [dir]        # dir = PLANE_DIR (default .data); writes data/slug-seed.json
import fs from "node:fs";
import path from "node:path";
import type { SlugSeed } from "../src/lib/import";
import { fsTree, type TreeView } from "../src/lib/data/plane/tree";
import type { CatRow, OracleRow, SetsFile } from "../src/lib/data/plane/formats";

export function seedOf(t: TreeView): SlugSeed {
  const sets = (JSON.parse(t.read("meta/sets.json")) as SetsFile).sets; const toks: Record<string, string> = {};
  for (const r of sets) toks[String(r[0])] = r[2];
  const idBySlug = new Map<string, number>(); const cats: CatRow[] = [];
  for (const f of t.files()) if (f.startsWith("cat/")) for (const r of (JSON.parse(t.read(f)) as { c: CatRow[] }).c) { idBySlug.set(r[1], r[0]); cats.push(r); }
  const cards: Record<string, string> = {};
  for (const r of cats) { const m = /^(.*)-p(\d+)$/.exec(r[1]); if (m && Number(m[2]) === r[0] && idBySlug.has(m[1]!)) { cards[String(r[0])] = r[1]; cards[String(idBySlug.get(m[1]!))] = m[1]!; } }
  const oracles: Record<string, string> = {}; const byBare = new Map<string, OracleRow[]>();
  for (const f of t.files()) if (f.startsWith("or/")) for (const r of (JSON.parse(t.read(f)) as { o: OracleRow[] }).o) {
    const suffix = `-${String(r[1]).slice(0, 8)}`; const bare = r[2].endsWith(suffix) ? r[2].slice(0, -suffix.length) : r[2];
    const a = byBare.get(bare); if (a) a.push(r); else byBare.set(bare, [r]);
  }
  for (const list of byBare.values()) if (list.length > 1 || list.some((r) => r[2].endsWith(`-${String(r[1]).slice(0, 8)}`))) for (const r of list) oracles[r[1]] = r[2];     // a shared bare slug (every owner), or a suffixed slug whose namesake is not in this tree
  const sorted = <T,>(o: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(o).sort((a, b) => (Number.isNaN(Number(a[0])) || Number.isNaN(Number(b[0])) ? (a[0] < b[0] ? -1 : 1) : Number(a[0]) - Number(b[0]))));
  return { v: 1, toks: sorted(toks), cards: sorted(cards), oracles: sorted(oracles) };
}
export function writeSeed(seed: SlugSeed, file: string): void {
  const line = (o: Record<string, string>): string => `{\n${Object.entries(o).map(([k, v]) => ` ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n")}\n}`;
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `{"v":1,\n"toks":${line(seed.toks)},\n"cards":${line(seed.cards)},\n"oracles":${line(seed.oracles)}}\n`);
}
if (process.argv[1] && /scripts[\\/]slug-seed\.ts$/.test(process.argv[1])) {
  const dir = path.resolve(process.argv[2] ?? process.env.PLANE_DIR ?? ".data"); const t = fsTree(path.join(dir, "v1"));
  if (!t.has("meta/sets.json")) { console.error(`slug-seed: no published tree in ${dir}`); process.exit(1); }
  const seed = seedOf(t); const out = path.join(__dirname, "..", "data", "slug-seed.json"); writeSeed(seed, out);
  console.log(`slug-seed: ${Object.keys(seed.toks).length} set tokens, ${Object.keys(seed.cards).length} collision slugs, ${Object.keys(seed.oracles).length} oracles in shared-slug groups -> ${out}`);
}
