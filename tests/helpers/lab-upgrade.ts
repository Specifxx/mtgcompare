// tests/helpers/lab-upgrade.ts (owner WP01a). The lab's real S3 tree (design/dataplane-lab/out/data-s3, 9,488 files from the real 2026-10-07 snapshot) was written by an earlier version of the builder. This upgrades it IN MEMORY to the frozen formats, adding only what the final builder adds
// from columns the tree already holds, so the real-tree tests and checks/check-plane-tree.ts --lab validate the final validator against real data:
//   cat rows 18 -> 21 columns (colors, mv, ptype from ix/k), ix/f market digits as a string, sl/list rows 8 -> 13 columns (packCount 0, flags 0, low and stores 0, change7d null), sl/d product rows 3 -> 4 (contents 0).
import type { MutableTree } from "../../src/lib/data/plane/tree";

export function upgradeLabTree(t: MutableTree): void {
  const edit = (f: string, fn: (j: any) => void): void => { const j = JSON.parse(t.read(f)); fn(j); t.write(f, JSON.stringify(j)); };
  const kcols = new Map<number, [number, number, number]>();
  for (const f of t.files().filter((x) => /^ix\/k-\d+\.json$/.test(x))) { const k = JSON.parse(t.read(f)); k.id.forEach((id: number, i: number) => kcols.set(id, [k.co[i], k.mv[i], k.pt.charCodeAt(i) - 48])); }
  for (const f of t.files().filter((x) => x.startsWith("cat/"))) edit(f, (j) => { for (const r of j.c) if (r.length === 18) r.push(...(kcols.get(r[0]) ?? [0, 0, 9])); });
  for (const f of t.files().filter((x) => /^ix\/f-\d+\.json$/.test(x))) edit(f, (j) => { if (typeof j.mk !== "string") j.mk = (j.market ?? []).join(""); });
  for (const f of t.files().filter((x) => /^sl\/list-\d+\.json$/.test(x))) edit(f, (j) => { j.s = j.s.map((r: unknown[]) => (r.length === 8 ? [r[0], r[1], r[2], r[3], typeof r[4] === "string" ? r[4] : "Other", 0, r[5], 0, r[6], r[7], 0, 0, null] : r)); });
  for (const f of t.files().filter((x) => /^sl\/d\/[0-9a-f]{2}\.json$/.test(x))) edit(f, (j) => { j.p = j.p.map((r: unknown[]) => (r.length === 3 ? [...r, 0] : r)); });
}
