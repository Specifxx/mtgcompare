// tests/helpers/publish-harness.ts (owner WP01b). A local bare repository, a deterministic builder over the mini tree, and the git helpers the publish tests share (plane-publish, plane-prevstate).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { publish, type PublishInput } from "../../src/lib/data/plane/publisher";
import { reconcileStoreFamilies, trackedUidsOf } from "../../src/lib/data/plane/reconcile";
import { fsTree, type MutableTree } from "../../src/lib/data/plane/tree";
import { validateTree } from "../../src/lib/data/plane/validate";
import type { PointerFile } from "../../src/lib/data/plane/formats";
import { MINI_CUT, dayOf, isoOf, miniCatalog, miniFull } from "./plane-tree";

export const sh = (cwd: string, ...a: string[]): string => { const r = spawnSync("git", a, { cwd, encoding: "utf8" }); if (r.status !== 0) throw new Error(`git ${a.join(" ")}: ${r.stderr}`); return r.stdout.trim(); };
export const mk = () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), "plane-pub-")); const remote = path.join(root, "remote.git"); sh(root, "init", "-q", "--bare", remote); return { root, remote, work: path.join(root, "w"), done: () => fs.rmSync(root, { recursive: true, force: true }) }; };
export const T0 = Date.parse("2026-01-05T21:48:00Z"); export const at = (days: number, hours = 0) => () => new Date(T0 + days * 86_400_000 + hours * 3_600_000);
export const day = (n: number) => isoOf(dayOf(n));
export type Mode = "catalog" | "full";
export function builder(n: number, mode: Mode, mutate?: (t: MutableTree) => void): PublishInput["build"] {
  return async (tree) => {
    const fresh = mode === "full" ? miniFull({ day: n }) : miniCatalog({ day: n });
    if (mode === "full") for (const f of tree.files().filter((x) => /^(un|of)\//.test(x) || /^ix\/(s|f)-/.test(x) || x.startsWith("sl/d/"))) tree.remove(f);
    for (const f of fresh.files()) tree.write(f, fresh.read(f));
    if (mode === "catalog") reconcileStoreFamilies(tree, trackedUidsOf(tree));                          // the phase-1 fix: membership first
    mutate?.(tree);
    const r = validateTree(tree, { phase: mode }); return { counts: { cards: r.counts.cards, units: r.counts.tracked, files: r.counts.files }, histCut: isoOf(MINI_CUT), prevCounts: null, status: { counts: { ...r.counts, sets: 3, sealed: 0, bytesRaw: r.counts.bytes, bytesGz: 0 } as never, runs: [{ at: "x", kind: mode, ok: true, seconds: 1, note: "" }] } };
  };
}
export const input = (m: ReturnType<typeof mk>, n: number, mode: Mode, extra: Partial<PublishInput> = {}): PublishInput => ({ remote: m.remote, workdir: m.work, phase: mode, priceDay: day(n), tcgcsv: `t${n}`, scryfall: `s${n}`, repo: "o/data", now: at(n), build: builder(n, mode), ...extra });
export const head = (m: ReturnType<typeof mk>): PointerFile => JSON.parse(sh(m.root, "--git-dir", m.remote, "show", "data:latest.json")) as PointerFile;
export const showAt = (m: ReturnType<typeof mk>, ref: string, p: string): string => sh(m.root, "--git-dir", m.remote, "show", `${ref}:${p}`);
export const checkout = (m: ReturnType<typeof mk>, ref: string): ReturnType<typeof fsTree> => { const d = path.join(m.root, `co-${ref.slice(0, 7)}`); fs.rmSync(d, { recursive: true, force: true }); sh(m.root, "clone", "-q", "--no-checkout", m.remote, d); sh(d, "checkout", "-q", ref); return fsTree(path.join(d, "v1")); };

