// tests/helpers/data-source.ts (owner WP02). `src/lib/data.ts` is the folder `src/lib/data/` (a barrel plus one module per domain, and plane/). The ten tests that grep the old file as text
// (best-basket-redesign, deals, demand-finder, ebay-claims, history, portfolio-orphaned-card, portfolio-performance, rising-cards, sealed-offers, set-checklist) call readDataSource() or readDataModule(name) instead.
// Each file is prefixed with a marker line so a test can still slice "the block of file X".
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.TEST_ROOT ?? path.resolve(__dirname, "../..");
export function dataFiles(root: string = ROOT): string[] {
  const dir = path.join(root, "src/lib/data");
  if (!fs.existsSync(dir)) return [];
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  return walk(dir).filter((f) => /\.ts$/.test(f)).sort();
}
export function readDataSource(root: string = ROOT): string {
  return dataFiles(root).map((f) => `// FILE ${path.relative(root, f).replace(/\\/g, "/")}\n${fs.readFileSync(f, "utf8")}`).join("\n");
}
/** The text of ONE data module, e.g. readDataModule("deals") or readDataModule("plane/entitlement"). */
export function readDataModule(name: string, root: string = ROOT): string { return fs.readFileSync(path.join(root, "src/lib/data", `${name}.ts`), "utf8"); }
