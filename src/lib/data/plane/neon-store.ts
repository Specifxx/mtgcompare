// src/lib/data/plane/neon-store.ts (owner WP02). THE NEON TRANSPORT OF THE PLANE, in one place (DECISIONS.md, 2026-10-09). The ONLY module of the reader side that may reach the database client (tests/plane-neon-path.test.ts pins that), and it reaches it lazily, so a
// build, a PLANE_DIR run and a GitHub-backend run never load Prisma.
//
// One table, created idempotently by the publisher with raw SQL (no `prisma db push` step, deliberately not a model of prisma/schema.prisma: a model would force a migration step into CI and the build):
//   "PlaneFile"(path text PRIMARY KEY, sha text NOT NULL, body bytea NOT NULL /* gzip */, "updatedAt" timestamptz)
//   path  "v1/<rel>"   the data files                       sha  sha-256 (hex) of the file's UTF-8 text
//         "latest.json" the pointer (the one mutable row)         "status.json" the head status copy (the watchdog and /admin/data)
//         "state/<name>" the write-once state backup + history deltas (state-backup.ts, history-delta.ts)
//         "stage/<path>" files of a publish in flight; readers never look at them; a flip renames them into place
// Only the CURRENT tree is stored. A publish uploads the files whose sha changed under stage/, verifies them, and then in ONE transaction deletes the superseded and removed rows, renames the staged ones into place and upserts the pointer row LAST: a reader sees the
// previous tree or the new one, never half of one, and a crash anywhere before that transaction changes nothing for readers.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createHash } from "node:crypto";

export const PLANE_TABLE = "PlaneFile";
export const POINTER_ROW = "latest.json", STATUS_ROW = "status.json", STATE_PREFIX = "state/", STAGE_PREFIX = "stage/", TREE_PREFIX = "v1/";
export const NEON_REPO = "neon/plane";                     // pointer.repo of a Neon-backed tree: it names no GitHub repository
export const sha256Hex = (s: string): string => createHash("sha256").update(s).digest("hex");
export const pack = (text: string): Buffer => zlib.gzipSync(Buffer.from(text, "utf8"), { level: 6 });
export const unpack = (b: Uint8Array): string => zlib.gunzipSync(Buffer.from(b)).toString("utf8");

/** The SQL the plane needs, over any client: Prisma raw in production (`prismaSql`), anything that can run text in tests. Positional $1.. parameters; a Buffer parameter is a bytea. */
export interface PlaneSql {
  all<T = Record<string, unknown>>(sql: string, ...p: unknown[]): Promise<T[]>;
  run(sql: string, ...p: unknown[]): Promise<number>;
  tx<T>(fn: (q: PlaneSql) => Promise<T>, o?: { repeatableRead?: boolean }): Promise<T>;
  close(): Promise<void>;
}
interface RawClient { $queryRawUnsafe(q: string, ...v: unknown[]): Promise<unknown>; $executeRawUnsafe(q: string, ...v: unknown[]): Promise<number> }
interface RootClient extends RawClient { $transaction<T>(fn: (t: RawClient) => Promise<T>, o?: { maxWait?: number; timeout?: number; isolationLevel?: string }): Promise<T>; $disconnect(): Promise<void> }
const over = (c: RawClient, root: RootClient | null): PlaneSql => ({
  all: async <T,>(sql: string, ...p: unknown[]) => (await c.$queryRawUnsafe(sql, ...p)) as T[],
  run: (sql, ...p) => c.$executeRawUnsafe(sql, ...p),
  tx: (fn, o) => { if (!root) return fn(over(c, null)); return root.$transaction((t) => fn(over(t, null)), { maxWait: 20_000, timeout: 600_000, ...(o?.repeatableRead ? { isolationLevel: "RepeatableRead" } : {}) }); },
  close: async () => { await root?.$disconnect(); },
});
export const prismaSql = (client: RootClient, closeable = false): PlaneSql => { const s = over(client, client); return closeable ? s : { ...s, close: async () => undefined }; };

/** The reader's client: the shared Prisma client of src/lib/db.ts (pooled URL), loaded on first use. */
export async function readerSql(): Promise<PlaneSql> {
  const { prisma } = (await import("../../db")) as unknown as { prisma: RootClient };
  return prismaSql(prisma);
}
/** The publisher's and plane-pull's client: its own client over the DIRECT URL (db.ts), disconnected by close(). */
export async function writerSql(): Promise<PlaneSql> {
  const { createDirectPrisma } = (await import("../../db")) as unknown as { createDirectPrisma(): RootClient };
  return prismaSql(createDirectPrisma(), true);
}

export interface PulledTree { files: Map<string, string>; pointer: string | null; status: string | null }   // path -> sha, as stored
const T = `"${PLANE_TABLE}"`;
const BATCH_ROWS = 150, BATCH_BYTES = 6 * 1024 * 1024;

export class NeonStore {
  constructor(readonly sql: PlaneSql) {}
  close(): Promise<void> { return this.sql.close(); }
  /** CREATE TABLE IF NOT EXISTS, raw SQL, safe to run on every publish and concurrently. body is already gzip: EXTERNAL storage skips Postgres' second, useless compression attempt. */
  async ensureSchema(): Promise<void> {
    await this.sql.run(`CREATE TABLE IF NOT EXISTS ${T} (path text PRIMARY KEY, sha text NOT NULL, body bytea NOT NULL, "updatedAt" timestamptz NOT NULL DEFAULT now())`);
    await this.sql.run(`ALTER TABLE ${T} ALTER COLUMN body SET STORAGE EXTERNAL`);
  }
  async tableExists(): Promise<boolean> { const r = await this.sql.all<{ t: string | null }>(`SELECT to_regclass('public."${PLANE_TABLE}"')::text AS t`); return !!r[0]?.t; }
  /** path -> sha of every stored row under `prefix` (no bodies). */
  async shas(prefix: string): Promise<Map<string, string>> {
    const rows = await this.sql.all<{ path: string; sha: string }>(`SELECT path, sha FROM ${T} WHERE starts_with(path, $1)`, prefix);
    return new Map(rows.map((r) => [r.path, r.sha]));
  }
  async get(rowPath: string): Promise<{ sha: string; text: string } | null> {
    const r = await this.sql.all<{ sha: string; body: Uint8Array }>(`SELECT sha, body FROM ${T} WHERE path = $1`, rowPath);
    return r[0] ? { sha: r[0].sha, text: unpack(r[0].body) } : null;
  }
  /** One small row (status.json, a state file): upsert, a single statement. */
  async put(rowPath: string, text: string): Promise<void> {
    await this.sql.run(`INSERT INTO ${T} (path, sha, body) VALUES ($1, $2, $3) ON CONFLICT (path) DO UPDATE SET sha = EXCLUDED.sha, body = EXCLUDED.body, "updatedAt" = now()`, rowPath, sha256Hex(text), pack(text));
  }
  /** Upsert many rows, one transaction per batch of at most 150 rows or 6 MB. `onBatch(n)` is called after each committed batch (the crash tests throw from it). A row whose sha is already stored is the caller's business: this writes what it is given. */
  async putMany(rows: Iterable<[string, string]>, onBatch?: (batch: number) => void): Promise<number> {
    let batch: { path: string; sha: string; body: Buffer }[] = [], bytes = 0, n = 0, b = 0;
    const flush = async (): Promise<void> => {
      if (!batch.length) return; const part = batch; batch = []; bytes = 0;
      const values = part.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(", ");
      await this.sql.tx((q) => q.run(`INSERT INTO ${T} (path, sha, body) VALUES ${values} ON CONFLICT (path) DO UPDATE SET sha = EXCLUDED.sha, body = EXCLUDED.body, "updatedAt" = now()`, ...part.flatMap((r) => [r.path, r.sha, r.body])));
      n += part.length; onBatch?.(++b);
    };
    for (const [p, text] of rows) { const body = pack(text); batch.push({ path: p, sha: sha256Hex(text), body }); bytes += body.length; if (batch.length >= BATCH_ROWS || bytes >= BATCH_BYTES) await flush(); }
    await flush(); return n;
  }
  async clearStage(): Promise<void> { await this.sql.run(`DELETE FROM ${T} WHERE starts_with(path, $1)`, STAGE_PREFIX); }
  async stage(files: Iterable<[string, string]>, onBatch?: (batch: number) => void): Promise<number> { return this.putMany([...files].map(([p, t]) => [STAGE_PREFIX + p, t] as [string, string]), onBatch); }
  /** The staged rows, as unstaged path -> sha: the publisher compares them with what it meant to upload before it flips. */
  async staged(): Promise<Map<string, string>> { const m = await this.shas(STAGE_PREFIX); return new Map([...m].map(([p, s]) => [p.slice(STAGE_PREFIX.length), s])); }
  /** THE ATOMIC SWITCH: one transaction that removes the superseded and removed rows, renames every staged row into place and writes the small rows LAST, the pointer after everything else. */
  async flip(o: { drop: string[]; small: [string, string][] }): Promise<void> {
    await this.sql.tx(async (q) => {
      for (let i = 0; i < o.drop.length; i += 5000) await q.run(`DELETE FROM ${T} WHERE path = ANY($1::text[])`, o.drop.slice(i, i + 5000));
      await q.run(`UPDATE ${T} SET path = substr(path, ${STAGE_PREFIX.length + 1}) WHERE starts_with(path, $1)`, STAGE_PREFIX);
      for (const [p, text] of o.small) await q.run(`INSERT INTO ${T} (path, sha, body) VALUES ($1, $2, $3) ON CONFLICT (path) DO UPDATE SET sha = EXCLUDED.sha, body = EXCLUDED.body, "updatedAt" = now()`, p, sha256Hex(text), pack(text));
    });
  }
  async delete(paths: string[]): Promise<void> { if (paths.length) await this.sql.run(`DELETE FROM ${T} WHERE path = ANY($1::text[])`, paths); }
  async pointerText(): Promise<string | null> { return (await this.get(POINTER_ROW))?.text ?? null; }

  /** Materialise the CURRENT tree into `dir` (v1/**, latest.json, status.json): one repeatable-read transaction, so a publish that flips meanwhile cannot mix two trees. Paths and shas as stored are returned. Writes the files only when their bytes differ (a re-pull is cheap). */
  async pullTo(dir: string, o: { clean?: boolean } = {}): Promise<PulledTree> {
    const root = path.resolve(dir); if (o.clean) fs.rmSync(root, { recursive: true, force: true }); fs.mkdirSync(root, { recursive: true });
    return this.sql.tx(async (q) => {
      const out: PulledTree = { files: new Map(), pointer: null, status: null }; let last = "";
      for (;;) {
        const rows = await q.all<{ path: string; sha: string; body: Uint8Array }>(`SELECT path, sha, body FROM ${T} WHERE path > $1 AND NOT starts_with(path, $2) AND NOT starts_with(path, $3) ORDER BY path LIMIT 200`, last, STAGE_PREFIX, STATE_PREFIX);
        if (!rows.length) break;
        for (const r of rows) {
          last = r.path; const text = unpack(r.body); out.files.set(r.path, r.sha);
          if (r.path === POINTER_ROW) out.pointer = text; else if (r.path === STATUS_ROW) out.status = text;
          const f = path.join(root, r.path); if (!f.startsWith(root + path.sep)) throw new Error(`refusing a path outside the tree: ${r.path}`);
          let same = false; try { same = fs.readFileSync(f, "utf8") === text; } catch { /* absent */ }
          if (!same) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); }
        }
      }
      return out;
    }, { repeatableRead: true });
  }
  /** The write-once state (slugs.tsv, oracles.tsv, sets.tsv) and every history delta, as stored under state/. */
  async readState(): Promise<Record<string, string>> {
    const rows = await this.sql.all<{ path: string; body: Uint8Array }>(`SELECT path, body FROM ${T} WHERE starts_with(path, $1) ORDER BY path`, STATE_PREFIX);
    return Object.fromEntries(rows.map((r) => [r.path.slice(STATE_PREFIX.length), unpack(r.body)]));
  }
  /** Upsert the state files whose bytes changed. Returns how many rows were written. */
  async writeState(files: Record<string, string>): Promise<number> {
    const have = await this.shas(STATE_PREFIX); const todo = Object.entries(files).filter(([n, t]) => have.get(STATE_PREFIX + n) !== sha256Hex(t));
    return this.putMany(todo.map(([n, t]) => [STATE_PREFIX + n, t] as [string, string]));
  }
}

/** A store over the writer client, or throws when there is no DATABASE_URL. */
export async function openWriterStore(env: Record<string, string | undefined> = process.env): Promise<NeonStore> {
  if (!env.DATABASE_URL) throw new Error("PLANE_BACKEND=neon (the default) needs DATABASE_URL: the published data lives in the Neon database. Set DATABASE_URL, or PLANE_BACKEND=github with PLANE_REPO and DATA_REPO_TOKEN.");
  return new NeonStore(await writerSql());
}
