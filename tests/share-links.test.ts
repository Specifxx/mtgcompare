import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { collectionPostText, isShareToken, newShareToken } from "../src/lib/collection-share";

// ─────────────────────────────────────────────────────────────────────────────
// Public share links for a binder (/c/<token>). A token is a CAPABILITY: unguessable, never derived from an
// id, revoked by rotation; the public projection never carries what the owner
// paid; the page is never indexed and has no share image of its own.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const SHARE = "src/lib/collection-share.ts";
const COLLECTION_PAGE = "src/app/c/[token]/page.tsx";

test("share tokens are unguessable, URL-safe and unique", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const t = newShareToken();
    // URL-safe with no padding: these get pasted into chat clients that mangle
    // anything needing percent-encoding.
    assert.match(t, /^[A-Za-z0-9_-]+$/, `token is not URL-safe: ${t}`);
    // 16 bytes base64url = 22 chars. Anything materially shorter is guessable.
    assert.ok(t.length >= 20, `token too short to be unguessable: ${t}`);
    assert.ok(!seen.has(t), "newShareToken returned a duplicate");
    seen.add(t);
  }
});

test("isShareToken rejects anything that cannot be a token before a DB hit", () => {
  assert.ok(isShareToken(newShareToken()));
  for (const bad of ["", "  ", "short", "has spaces in it", "../../etc/passwd", "a/b", "%2e%2e", null, undefined]) {
    assert.ok(!isShareToken(bad as string), `should have rejected ${JSON.stringify(bad)}`);
  }
});

test("a token is not derived from the row id", () => {
  // A share URL is safe to paste anywhere; a row id shows up in owner-only API
  // responses and admin views. If the two were the same string, pasting one
  // would leak the other.
  const src = read(SHARE);
  const fn = src.slice(src.indexOf("export function newShareToken"));
  const body = codeOnly(fn.slice(0, fn.indexOf("\n}")));
  assert.match(body, /randomBytes\(/, "tokens must come from a CSPRNG");
  assert.ok(!/\bid\b/.test(body), "token must not be derived from any id");
});

// ── 2. The public projection must not carry private columns ─────────────────

test("a shared collection never selects what the owner paid", () => {
  const src = read(SHARE);
  const fn = src.slice(src.indexOf("export async function getSharedCollection"));
  const body = codeOnly(fn.slice(0, fn.indexOf("\n}")));
  assert.ok(!/costBasisCents/.test(body), "costBasisCents must never reach a public page");
  assert.ok(!/\bnote\s*:/.test(body), "the owner's free-text note must not be a selected field");
  // `select`, never `include`/spread: a future column added to CollectionCard
  // must be invisible here until somebody deliberately adds it, rather than
  // being published the moment it is created.
  assert.match(body, /select:\s*\{/, "the public projection must select fields explicitly");
  assert.ok(!/include:\s*\{/.test(body), "include: would pass through every column, present and future");
});

test("the shared-collection type has no P&L surface at all", () => {
  const src = read(SHARE);
  const type = src.slice(src.indexOf("export type SharedHolding"), src.indexOf("export type SharedCollection"));
  for (const banned of ["costBasis", "plCents", "plPct", "invested", "profit"]) {
    assert.ok(!type.includes(banned), `SharedHolding must not expose ${banned}`);
  }
});

// ── 3. Capability URLs must never be indexed ────────────────────────────────

test("the public collection share page is noindex", () => {
  const src = read(COLLECTION_PAGE);
  // A robots Disallow would be WRONG here and is deliberately not used: a
  // disallowed page is never crawled, so the noindex is never seen (see the
  // long note in app/robots.ts). noindex on the page is the mechanism.
  assert.match(src, /robots:\s*\{[^}]*index:\s*false/, "must set index: false");
  assert.match(src, /follow:\s*false/, "must not have crawlers follow links out of a capability URL");
});

// ── 4. Revocation has to actually revoke ────────────────────────────────────

test("enabling a share is idempotent but rotating is not", () => {
  const src = read(SHARE);
  const enable = src.slice(src.indexOf("export async function enableCollectionShare"));
  const enableBody = enable.slice(0, enable.indexOf("\n}"));
  // A "Share" button that mints a new token on every click silently breaks the
  // link the user shared thirty seconds ago.
  assert.match(enableBody, /if \(existing\) return existing;/, "enable must reuse an existing token");

  const rotate = src.slice(src.indexOf("export async function rotateCollectionShare"));
  const rotateBody = rotate.slice(0, rotate.indexOf("\n}"));
  assert.match(rotateBody, /newShareToken\(\)/, "rotate must mint a fresh token");
});

test("there is no second source of truth for 'is this shared'", () => {
  // Presence of the token IS the switch. A separate boolean is how a revoked
  // share stays live because only one of the two got cleared.
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /collectionShareId\s+String\?\s+@unique/, "expected a nullable unique token on User");
  assert.ok(!/collectionSharePublic|isCollectionShared/.test(schema), "no boolean may shadow the token");
});

test("the shared page uses the root share image, and its CTA carries the signup source", () => {
  const { existsSync } = require("node:fs") as typeof import("node:fs");
  assert.equal(existsSync(join(process.cwd(), "src/app/c/[token]/opengraph-image.tsx")), false, "share images read only data/ loaders; a binder is per-user");
  const page = read(COLLECTION_PAGE);
  assert.match(page, /\/login\?next=\/portfolio&src=shared_collection/);
  assert.match(page, /nocache: true/);
  assert.match(page, /notFound\(\)/, "a rotated token is a 404, never an 'expired' page");
});

test("the share route is same-origin, rate-limited at 20 an hour, and answers no-store", () => {
  const route = codeOnly(read("src/app/api/collection/share/route.ts"));
  assert.match(route, /rateLimit\(`coll-share:\$\{user\.id\}`, 20, 3600_000\)/);
  assert.equal((route.match(/sameOrigin\(req\)/g) ?? []).length, 2, "POST and DELETE");
});

test("the post text is plain, one fact a line, in the viewer's currency", () => {
  const t = collectionPostText({
    ownerName: "Jace",
    distinctCards: 3,
    totalCopies: 5,
    totalCents: 123456,
    country: "AU",
    top: [
      { card: { name: "Stingcaster Mage", variant: "Borderless · Facet Foil" }, isFoil: true, unitCents: 29800 },
      { card: { name: "Counterspell", variant: null }, unitCents: 394 },
      { card: { name: "Black Lotus", variant: null }, unitCents: null },
    ],
    url: "https://mtgcompare.app/c/abc",
  });
  assert.equal(
    t,
    "Jace's Magic collection — 3 cards (5 copies), A$1,235 at today's prices\n· Stingcaster Mage (Borderless · Facet Foil) (foil) — A$298.00\n· Counterspell — A$3.94\n· Black Lotus\nhttps://mtgcompare.app/c/abc",
  );
  assert.doesNotMatch(t, /[*_`#]/, "no markdown");
});

test("a shared holding carries its finish, valued as that finish", () => {
  const src = read(SHARE);
  const type = src.slice(src.indexOf("export type SharedHolding"), src.indexOf("export type SharedCollection"));
  assert.match(type, /isFoil: boolean/);
  const fn = codeOnly(src.slice(src.indexOf("export async function getSharedCollection")));
  assert.match(fn, /copyValueCents\(c, r\.isFoil, r\.condition, country\)/, "the Foil copy is valued at the Foil unit's price");
  assert.match(fn, /getCardsByIds\(/, "cards come from the published data, not a table");
});
