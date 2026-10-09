import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SUBSCRIBE_CARD_CAP, anonymousAlertsEnabled, parseSubscribeBody } from "../src/lib/alert-subscribe";

// ─────────────────────────────────────────────────────────────────────────────
// The anonymous (email-only) watch — RiftCompare's watchlist.test.ts security
// cases, ported. BUILT, AND HIDDEN: it exists only while email is on AND the
// owner has enabled NEXT_PUBLIC_ANON_ALERTS=1; the modal and the route share
// that one predicate. Source-level assertions pin what is invisible at runtime
// until something has gone wrong: an ownership-forgery hole, a row the run can
// no longer see, a token that needs a session.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("the door is open only with email on AND the owner's switch", () => {
  assert.equal(anonymousAlertsEnabled("on", { NEXT_PUBLIC_ANON_ALERTS: "1" }), true);
  assert.equal(anonymousAlertsEnabled("on", {}), false);
  assert.equal(anonymousAlertsEnabled("on", { NEXT_PUBLIC_ANON_ALERTS: "0" }), false);
  assert.equal(anonymousAlertsEnabled("off", { NEXT_PUBLIC_ANON_ALERTS: "1" }), false);
  const route = code("src/app/api/alerts/subscribe/route.ts");
  assert.match(route, /if \(!anonymousAlertsEnabled\(await getEmailStatus\(\)\)\) return NextResponse\.json\(\{ error: "Not found" \}, \{ status: 404 \}\)/);
  // The route's 404 comes BEFORE any read of the body, the session or the database.
  assert.ok(route.indexOf("anonymousAlertsEnabled") < route.indexOf("req.json()"));
  assert.ok(route.indexOf("anonymousAlertsEnabled") < route.indexOf("getCurrentUser()"));
  // The modal mounts under the same two conditions and nothing else.
  const gate = code("src/components/PriceAlertModalGate.tsx");
  assert.match(gate, /NEXT_PUBLIC_ANON_ALERTS !== "1"\) return null/);
  assert.match(gate, /status !== "on"\) return null/);
  assert.match(code("src/app/layout.tsx"), /<PriceAlertModalGate \/>/);
});

test("request bodies: a real address, 1 to 500 integer card ids, a supported market", () => {
  const ok = parseSubscribeBody({ email: " Sam@Example.com ", cardIds: [100001, "100002", 100001], market: "AU" });
  assert.deepEqual(ok, { email: "sam@example.com", cardIds: [100001, 100002], market: "AU", finish: null });
  assert.equal(parseSubscribeBody({ email: "a@b.co", cardIds: [1], finish: 1 })!.finish, "F", "a finish may be named (0 or 1, N or F)");
  assert.equal(parseSubscribeBody({ email: "a@b.co", cardIds: [1], finish: 2 }), null);
  assert.equal(parseSubscribeBody({ email: "a@b.co", cardIds: [1] })!.market, "US", "market defaults to US");
  for (const bad of [
    null,
    "x",
    {},
    { email: "no", cardIds: [1] },
    { email: "a@b.co", cardIds: [] },
    { email: "a@b.co", cardIds: [0] },
    { email: "a@b.co", cardIds: [1.5] },
    { email: "a@b.co", cardIds: ["abc"] },
    { email: "a@b.co", cardIds: Array.from({ length: SUBSCRIBE_CARD_CAP + 1 }, (_, i) => i + 1) },
    { email: "a@b.co", cardIds: [1], market: "NZ" },
    { email: `${"a".repeat(200)}@b.co`, cardIds: [1] },
  ]) {
    assert.equal(parseSubscribeBody(bad), null, JSON.stringify(bad).slice(0, 80));
  }
  assert.equal(SUBSCRIBE_CARD_CAP, 500);
});

test("THE FORGERY GUARD: ownership is claimed only when the session's own address matches", () => {
  // The email arrives in the REQUEST BODY. Stamping userId from the session
  // without comparing addresses would let any signed-in user POST a stranger's
  // address and adopt that person's watches.
  const lib = code("src/lib/alert-subscribe.ts");
  assert.match(lib, /session && session\.email\.toLowerCase\(\) === email \? session\.id : null/, "userId is null unless the session address equals the subscribed address");
  assert.match(lib, /skipDuplicates: true/);
  // A claim of an address's rows by a signed-in account is the sign-in path's, address-verified.
  assert.match(code("src/lib/accounts.ts"), /claimAlertsForUser/);
});

test("the run never FILTERS on account status in the 'all' scope — anonymous watchers keep their emails", () => {
  const run = read("src/lib/price-alerts.ts");
  const findMany = run.slice(run.indexOf("db.priceAlert.findMany"));
  const beforeSelect = findMany.slice(0, findMany.indexOf("select:"));
  assert.match(beforeSelect, /where: paidOnly/, "the only filter is the paid scope");
  assert.match(run, /const paidOnly = scope === "paid"/);
  assert.doesNotMatch(run, /if \(.*userId.*\)\s*continue/, "no row may be skipped because of its userId");
  assert.match(run, /if \(a\.userId != null\) bucket\.anonymous = false/);
});

test("unsubscribe stays token-addressed and session-free; the account pause needs a session", () => {
  const src = code("src/app/api/alerts/unsubscribe/route.ts");
  assert.doesNotMatch(src, /getCurrentUser/, "an unsubscribe click arrives from an email client with no cookie");
  assert.match(src, /token/);
  const lib = code("src/lib/alert-mute.ts");
  assert.match(lib, /unsubToken/);
  assert.match(code("src/app/api/alerts/pause/route.ts"), /getCurrentUser\(\)/);
  for (const p of ["src/app/unsubscribe/page.tsx", "src/app/alerts/manage/page.tsx", "src/app/alerts/action/page.tsx"]) {
    assert.match(read(p), /index: false/, `${p} is noindex`);
  }
});

test("claiming an address's watches on sign-in stays inside the address the provider verified", () => {
  const accounts = code("src/lib/accounts.ts");
  const at = accounts.indexOf("claimAlertsForUser");
  assert.ok(at > 0);
  const lib = code("src/lib/alert-confirmations.ts") + code("src/lib/alerts.ts");
  assert.match(lib, /userId: null/, "only unlinked rows are ever claimed, so it is safe to re-run");
  assert.match(lib, /export async function claimAlertsForUser/);
});

test("PriceAlert.userId is NULLABLE and the email dedupe key is untouched", () => {
  const model = /model PriceAlert \{([\s\S]*?)\n\}/.exec(read("prisma/schema.prisma"))?.[1] ?? "";
  assert.match(model, /userId\s+String\?/);
  assert.match(model, /\n\s*email\s+String/);
  assert.match(model, /@@unique\(\[email, cardId, finish, market\]\)/);
  assert.match(model, /@@index\(\[userId\]\)/);
});
