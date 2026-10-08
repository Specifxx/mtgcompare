// src/lib/data/plane/tree.ts (owner WP01a). A published tree as a small interface, so the validator, the reconciler and the tests run on a directory, on a git worktree or on an in-memory map with the same code.
import fs from "node:fs";
import path from "node:path";

/** A read-only view of a tree of text files; paths are relative to v1/ and use "/". */
export interface TreeView { files(): string[]; read(rel: string): string; size(rel: string): number; has(rel: string): boolean }
export interface MutableTree extends TreeView { write(rel: string, text: string): void; remove(rel: string): void }

export function memTree(init: Iterable<[string, string]> = []): MutableTree {
  const m = new Map<string, string>(init);
  return { files: () => [...m.keys()].sort(), read: (r) => { const v = m.get(r); if (v === undefined) throw new Error(`no such file: ${r}`); return v; }, size: (r) => Buffer.byteLength(m.get(r) ?? "", "utf8"), has: (r) => m.has(r), write: (r, t) => void m.set(r, t), remove: (r) => void m.delete(r) };
}
export function fsTree(root: string): MutableTree {
  const walk = (d: string, base = ""): string[] => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), `${base}${e.name}/`) : [`${base}${e.name}`])) : [];
  return {
    files: () => walk(root).sort(), read: (r) => fs.readFileSync(path.join(root, r), "utf8"), size: (r) => fs.statSync(path.join(root, r)).size, has: (r) => fs.existsSync(path.join(root, r)),
    write: (r, t) => { fs.mkdirSync(path.dirname(path.join(root, r)), { recursive: true }); fs.writeFileSync(path.join(root, r), t); },
    remove: (r) => { fs.rmSync(path.join(root, r), { force: true }); },
  };
}
/** Copy a tree into memory (tests mutate copies, never the source). */
export function cloneToMem(t: TreeView): MutableTree { return memTree(t.files().map((f) => [f, t.read(f)] as [string, string])); }
/** Paths whose bytes differ between two trees (added, removed or changed). */
export function diffPaths(a: TreeView, b: TreeView): string[] {
  const out: string[] = []; const fa = new Set(a.files()), fb = new Set(b.files());
  for (const f of fa) if (!fb.has(f) || a.read(f) !== b.read(f)) out.push(f);
  for (const f of fb) if (!fa.has(f)) out.push(f);
  return [...new Set(out)].sort();
}
