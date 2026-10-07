import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FREE_LIMIT_STATUS, FREE_PORTFOLIO_LIMIT, freeLimitBody, parseFreeLimit } from "../src/lib/free-limits";
import { portfolioAllowance, type PortfolioLimitDb } from "../src/lib/collection-server";

// ─────────────────────────────────────────────────────────────────────────────
// THE SET TRACKER'S WIRING — RiftCompare's tests/set-tracker.test.ts, ported in
// wave 2 (2026-10-03): the public /sets/[slug] page reads neither cookies nor
// the user, the tick is the existing add path with its 402, an unreleased set
// shows "N revealed", and the set view carries no P&L wording.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SET_PAGE = "src/app/sets/[slug]/page.tsx";

test("/sets/[slug] never reads the session: the owned overlay is client-side", () => {
  const c = code(SET_PAGE);
  assert.doesNotMatch(c, /getCurrentUser|@\/lib\/auth|\bcookies\(|useMe\b/, "a session read here would make the page per-user");
  assert.doesNotMatch(c, /collectionCard|ownedBySet|set-owned/, "no per-request owned read on the page");
  assert.match(c, /<SetOwnedProvider setSlug=\{set\.slug\} enabled=\{!future\}>/, "only a released set gets the ticks");
  assert.match(c, /<SetTickLayer tileIds=\{grid\.items\.map\(\(c\) => c\.id\)\}/);
  assert.match(c, /data-tick-grid/, "one marker on the grid");
  assert.doesNotMatch(c, /<OwnedTick/, "no tick component per tile in the server HTML");
  assert.match(c, /<SetOwnedStatus /);
  assert.doesNotMatch(c, /generateStaticParams/);
});

test("the overlay reads the owned map from the authenticated no-store route, only for a signed-in visitor", () => {
  const c = code("src/components/SetOwned.tsx");
  assert.match(c, /fetchMe\(\)/, "signed-out is known from /api/me, so an anonymous visitor makes no request");
  assert.match(c, /\/api\/collection\/owned\?set=\$\{encodeURIComponent\(setSlug\)\}/);
  assert.match(c, /cache: "no-store"/);
  assert.ok(c.indexOf("if (!me.user)") < c.indexOf("/api/collection/owned"));
  assert.match(c, /src=set_tracker/, "a signed-out tick goes to sign-up, attributed");
  const route = code("src/app/api/collection/owned/route.ts");
  assert.match(route, /getCurrentUser\(\)/);
  assert.match(route, /"Cache-Control": "private, no-store"/);
});

test("the tick is the existing add path: POST /api/collection, whose 402 opens the portfolio panel inline", () => {
  const c = code("src/components/SetOwned.tsx");
  assert.match(c, /fetch\("\/api\/collection", \{\s*method: "POST"/);
  assert.match(c, /res\.status === FREE_LIMIT_STATUS/);
  assert.match(c, /parseFreeLimit\(/);
  assert.match(c, /<FreeLimitPanel kind="portfolio" context="set"/);
  assert.match(c, /if \(!res\.ok\) return;/);
  assert.ok(c.indexOf("if (!res.ok) return;") < c.indexOf("setOwned((o)"));
  // A tap on a tile's tick must not open the card (the tile is one link).
  assert.match(c, /e\.preventDefault\(\);\s*e\.stopPropagation\(\);/);
  const lib = code("src/lib/collection-server.ts");
  const add = lib.slice(lib.indexOf("export async function addToCollection"), lib.indexOf("export interface PatchBody"));
  assert.ok(add.indexOf("portfolioAllowance(") < add.indexOf("addCopies("), "the limit is checked before any write");
  assert.match(add, /status: FREE_LIMIT_STATUS, body: \{ \.\.\.freeLimitBody\("portfolio"/);
});

function stubDb(held: number[], distinct: number): PortfolioLimitDb {
  return {
    collectionCard: { findMany: async (args) => held.filter((id) => ((args.where as { cardId: { in: number[] } }).cardId.in).includes(id)).map((cardId) => ({ cardId })) },
    $queryRaw: async () => [{ n: distinct }],
  };
}
const FREE = { id: "u1", isAdmin: false, premiumUntil: null, premiumTier: "plus" };
const PLUS = { id: "u2", isAdmin: false, premiumUntil: new Date(Date.now() + 86400_000), premiumTier: "plus" };

test("the 51st distinct card on a free account is a 402 body; the 50th and any held card are not", async () => {
  assert.equal(FREE_PORTFOLIO_LIMIT, 50);
  const at49 = await portfolioAllowance(stubDb([], 49), FREE, [454665]);
  assert.deepEqual(at49.blocked, [], "the 50th card lands");
  const at50 = await portfolioAllowance(stubDb([], 50), FREE, [454665]);
  assert.deepEqual(at50.blocked, [454665], "the 51st is refused");
  const body = freeLimitBody("portfolio", at50.count ?? at50.limit);
  assert.equal(FREE_LIMIT_STATUS, 402);
  assert.deepEqual(parseFreeLimit(body), body);
  const held = await portfolioAllowance(stubDb([454665], 80), FREE, [454665]);
  assert.deepEqual(held.blocked, [], "a card already held always takes more copies, even over the limit");
  const paid = await portfolioAllowance(stubDb([], 500), PLUS, [1, 2, 3]);
  assert.deepEqual(paid, { allowed: [1, 2, 3], blocked: [], count: null, limit: 50 }, "Plus is never counted");
});

test("an unreleased set: 'N revealed' with no denominator, percentage, bar or cost", () => {
  const c = code("src/components/SetTracker.tsx");
  const pre = c.slice(c.indexOf("if (preRelease) {"), c.indexOf("const scopeInfo"));
  assert.match(pre, /preReleaseLine\(pre\)/);
  assert.doesNotMatch(pre, /role="progressbar"|percent|costCents/);
  assert.match(pre, /priced=\{false\}/, "no prices on a set that has not released");
  const idx = code("src/app/portfolio/sets/page.tsx");
  assert.match(idx, /pre=\{!!set\.releasedOn && set\.releasedOn > today\}/);
});

test("the checklist states the footer verbatim and names its scopes as printings we track", () => {
  const c = code("src/components/SetTracker.tsx");
  assert.match(c, /\{SET_FOOTER_COPY\}/);
  assert.match(c, /Counts are printings in our catalogue\./);
  assert.match(c, /filename=\{`opcompare-\$\{setSlug\}-missing\.csv`\}/);
});

test("no P&L, value, prediction or urgency words anywhere in the set view", () => {
  const banned = /\bworth\b|\bprofit|\bROI\b|\bgain(ed|s)?\b|\bP&L\b|\binvest|\bflip|\bpredict|\bvalue\b|\bsav(e|ing|ings)\b|\bdeal\b|\bhurry|\bsell(s|ing)? out\b|\bgrab\b|\bbefore it/i;
  for (const f of [
    "src/components/SetTracker.tsx",
    "src/components/SetOwned.tsx",
    "src/components/SetMissingActions.tsx",
    "src/app/portfolio/sets/page.tsx",
    "src/app/portfolio/sets/[set]/page.tsx",
  ]) {
    const shown = code(f).replace(/\bvalue=(\{[^}]*\}|"[^"]*")/g, "").replace(/\.value\b/g, "");
    const m = shown.match(banned);
    assert.equal(m, null, `${f} uses "${m?.[0]}"`);
  }
});

test("the tracker pages are noindex, per-request and never call notFound (a loading.tsx sits above /portfolio)", () => {
  for (const f of ["src/app/portfolio/sets/page.tsx", "src/app/portfolio/sets/[set]/page.tsx"]) {
    const c = code(f);
    assert.match(c, /export const dynamic = "force-dynamic"/, f);
    assert.match(c, /robots: \{ index: false, follow: false \}/, f);
    assert.doesNotMatch(c, /notFound\(/, f);
    assert.match(c, /redirect\(`?"?\/login\?next=/, `${f} bounces a signed-out visitor to sign-in`);
    assert.doesNotMatch(c, /generateStaticParams/, f);
  }
});

test("/portfolio links to the checklist, and promos and events sit behind a toggle", () => {
  assert.match(code("src/app/portfolio/page.tsx"), /href="\/portfolio\/sets"/);
  const idx = code("src/app/portfolio/sets/page.tsx");
  assert.match(idx, /const MAIN_KINDS = \["booster", "extra", "premium", "starter"\]/);
  assert.match(idx, /\?promos=1/);
});
