import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { canWatchPricedResult } from "../src/lib/deck-watch-pure";

// A "use client" component that imports a server-only module (prisma, node:crypto)
// compiles under tsc and lints clean, but webpack cannot bundle it and every
// page that includes the component answers 500. That happened to the deck
// price watch form on 2026-09-29 (friendlyTargetCents imported from
// lib/deck-watch): the checks were green and only `next dev` showed it.
// (RiftCompare's test; OP Compare adds lib/shipping — the whole postage
// snapshot and store list — and the server loaders to the list.)

const ROOT = process.cwd();
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

const SERVER_ONLY = [
  "deck-watch",
  "sealed-watch",
  "alert-actions",
  "alert-budget",
  "watch-emails",
  "price-alerts",
  "email",
  "db",
  "basket-server",
  "shipping",
  "data",
  "auth",
  "premium",
];

test("no 'use client' file imports a server-only watch, alert, email or database module", () => {
  const offenders: string[] = [];
  for (const f of walk(join(ROOT, "src"))) {
    const src = readFileSync(f, "utf8");
    if (!/^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(src)) continue;
    for (const m of src.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)) {
      const spec = m[1]!;
      const leaf = spec.split("/").pop()!;
      if (/^(@\/lib\/|\.\.?\/(?:.*\/)?lib\/|\.\/)/.test(spec) && SERVER_ONLY.includes(leaf) && !spec.startsWith("./") ) offenders.push(`${f.replace(ROOT + "/", "")} imports ${spec}`);
      if (spec.startsWith("node:") || spec === "@prisma/client") offenders.push(`${f.replace(ROOT + "/", "")} imports ${spec}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("the client-safe deck watch helpers live in lib/deck-watch-pure, which imports nothing", () => {
  const pure = readFileSync(join(ROOT, "src/lib/deck-watch-pure.ts"), "utf8");
  assert.equal(/^\s*import\s/m.test(pure), false);
  const form = readFileSync(join(ROOT, "src/components/DeckWatchForm.tsx"), "utf8");
  assert.match(form, /from "@\/lib\/deck-watch-pure"/);
});

test("a result priced with 'skip copies I own' is not offered as a watch (its total is a smaller list's)", () => {
  assert.equal(canWatchPricedResult({ skippedOwned: 0, coveredCopies: 4 }), true);
  assert.equal(canWatchPricedResult({ coveredCopies: 4 }), true);
  assert.equal(canWatchPricedResult({ skippedOwned: 2, coveredCopies: 4 }), false);
  assert.equal(canWatchPricedResult({ skippedOwned: 0, coveredCopies: 0 }), false);
  const basket = readFileSync(join(ROOT, "src/components/BestBasket.tsx"), "utf8");
  assert.match(basket, /canWatchPricedResult\(/, "Best Basket gates the form on the helper");
});
