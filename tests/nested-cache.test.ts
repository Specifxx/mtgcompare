// Egress rule 2 (src/lib/db.ts): unstable_cache lives in src/lib/data.ts only,
// so no page can wrap a self-cached loader in a second cache (Next bypasses the
// inner one inside an outer callback). Pages read the loaders directly.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "../src");
function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

test("unstable_cache is only used in lib/data.ts", () => {
  const offenders = walk(SRC)
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(path.join("lib", "data.ts")))
    .filter((f) => /unstable_cache\s*\(/.test(fs.readFileSync(f, "utf8")))
    .map((f) => path.relative(SRC, f));
  assert.deepEqual(offenders, []);
});

test("no request path imports the Prisma client directly", () => {
  const offenders = walk(path.join(SRC, "app"))
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .filter((f) => /from "@\/lib\/db"/.test(fs.readFileSync(f, "utf8")))
    .map((f) => path.relative(SRC, f));
  assert.deepEqual(offenders, []);
});
