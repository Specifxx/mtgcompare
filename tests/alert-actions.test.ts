import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ALERT_ACTION_TTL_MS,
  SNOOZE_MS,
  alertActionLinks,
  watchActionLinks,
  loweredTargetCents,
  performAlertAction,
  signAlertAction,
  verifyAlertAction,
  type AlertActionDb,
} from "../src/lib/alert-actions";
import { PLUS_TARGET_ALERT_LIMIT } from "../src/lib/alert-limits";
import { POST as actionPOST } from "../src/app/api/alerts/action/route";

// ─────────────────────────────────────────────────────────────────────────────
// One-tap links in price-alert emails (lib/alert-actions.ts): the HMAC token,
// and what POST /api/alerts/action does with it — 403 on a bad token, the
// Plus-only targets with targetAlertLimit enforced, and no state change on GET.
// ─────────────────────────────────────────────────────────────────────────────

// The links are signed with a key derived from EMAIL_LINK_SECRET and refused without it.
process.env.EMAIL_LINK_SECRET = "test-link-secret-0123456789abcdef0123456789abcdef";

const NOW = new Date("2026-09-25T09:00:00Z");
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ── The token ────────────────────────────────────────────────────────────────

test("sign → verify round-trips the row, the action and the value", () => {
  const t = signAlertAction({ alertId: "ckrow123", action: "target-set", value: 1840, now: NOW });
  const v = verifyAlertAction(t, NOW);
  assert.ok(v.ok);
  assert.equal(v.alertId, "ckrow123");
  assert.equal(v.action, "target-set");
  assert.equal(v.value, 1840);
  assert.equal(v.exp, Math.floor((NOW.getTime() + ALERT_ACTION_TTL_MS) / 1000));
  const s = verifyAlertAction(signAlertAction({ alertId: "ckrow123", action: "snooze", now: NOW }), NOW);
  assert.ok(s.ok && s.action === "snooze" && s.value === null);
  assert.match(t, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, "URL-safe");
});

test("tampering fails: another row, another action, another value, a flipped signature byte", () => {
  const t = signAlertAction({ alertId: "rowA", action: "snooze", now: NOW });
  const [payload, sig] = t.split(".") as [string, string];
  const forge = (text: string) => `${Buffer.from(text).toString("base64url")}.${sig}`;
  const decoded = Buffer.from(payload, "base64url").toString("utf8");
  for (const forged of [
    forge(decoded.replace("rowA", "rowB")),
    forge(decoded.replace("snooze", "stop")),
    forge(decoded.replace(".snooze.", ".target-set.").replace(/\.\./, ".1.")),
    forge(decoded.replace(/\.(\d+)$/, (_, e: string) => `.${Number(e) + 86400 * 365}`)),
  ]) {
    assert.deepEqual(verifyAlertAction(forged, NOW), { ok: false, reason: "signature" });
  }
  const flipped = Buffer.from(sig, "base64url");
  flipped[0] = flipped[0]! ^ 1;
  assert.deepEqual(verifyAlertAction(`${payload}.${flipped.toString("base64url")}`, NOW), { ok: false, reason: "signature" });
  // A target token's value is signed too.
  const tt = signAlertAction({ alertId: "rowA", action: "target-set", value: 1000, now: NOW });
  const [tp, ts] = tt.split(".") as [string, string];
  const cheaper = Buffer.from(Buffer.from(tp, "base64url").toString("utf8").replace(".1000.", ".1.")).toString("base64url");
  assert.equal(verifyAlertAction(`${cheaper}.${ts}`, NOW).ok, false);
});

test("expired and malformed tokens are refused", () => {
  const t = signAlertAction({ alertId: "rowA", action: "stop", now: NOW });
  assert.equal(verifyAlertAction(t, new Date(NOW.getTime() + ALERT_ACTION_TTL_MS - 1000)).ok, true);
  assert.deepEqual(verifyAlertAction(t, new Date(NOW.getTime() + ALERT_ACTION_TTL_MS + 1000)), { ok: false, reason: "expired" });
  for (const bad of ["", "abc", "a.b.c", "!!!.???", `${"x".repeat(500)}.y`, null, undefined]) {
    assert.equal(verifyAlertAction(bad, NOW).ok, false, String(bad));
  }
  assert.throws(() => signAlertAction({ alertId: "has.dot", action: "stop" }));
});

test("links: a paid row gets one target link, 10% under the LOWER of target and price; a free row the Plus link", () => {
  assert.equal(loweredTargetCents(2000, 1840), 1656, "the price is already under the target: 10% under the price");
  assert.equal(loweredTargetCents(1500, 1840), 1350, "the target is under the price: 10% under the target");
  assert.equal(loweredTargetCents(null, 1840), 1656);
  const paid = alertActionLinks({ alertId: "r", currentCents: 1840, targetCents: 2000, canTarget: true, now: NOW })!;
  assert.equal(paid.targetDown?.cents, 1656);
  assert.ok(paid.targetDown!.cents < 1840, "never a target the price the member is looking at already meets");
  assert.equal("targetSet" in paid, false, "'Set target at this price' set a target the price already met");
  assert.equal(paid.upsell, null);
  assert.equal(paid.hasTarget, true);
  const v = verifyAlertAction(new URL(paid.targetDown!.url).searchParams.get("t"), NOW);
  assert.ok(v.ok && v.action === "target-down" && v.value === 1656);
  const free = alertActionLinks({ alertId: "r", currentCents: 1840, targetCents: null, canTarget: false, now: NOW })!;
  assert.equal(free.targetDown, null);
  assert.match(free.upsell!, /\/premium\?src=alert-email/);
  for (const u of [free.stop, free.snooze]) assert.match(u, /\/alerts\/action\?t=/);
});

// ── Applying (a stub PriceAlert table) ───────────────────────────────────────

type StubRow = {
  id: string;
  cardId: number;
  market: string;
  userId: string | null;
  targetCents: number | null;
  targetEmailedCents: number | null;
  lastPriceCents?: number | null;
  snoozedUntil: Date | null;
  user: { id: string; email: string; isAdmin: boolean; premiumUntil: Date | null; premiumTier: string; premiumTierFloor: string | null } | null;
};

const PAID = new Date("2099-01-01T00:00:00Z");
const account = (tier: "plus" | "premium" | null, id = "u1") => ({
  id,
  email: `${id}@example.com`,
  isAdmin: false,
  premiumUntil: tier ? PAID : null,
  premiumTier: tier ?? "plus",
  premiumTierFloor: null,
});

type WatchRow = { id: string; snoozedUntil: Date | null };

function stub(rows: StubRow[], decks: WatchRow[] = [], sealed: WatchRow[] = []) {
  const calls: string[] = [];
  const table = (list: WatchRow[], name: string) => ({
    findUnique: async ({ where }: { where: { id: string } }) => list.find((r) => r.id === where.id) ?? null,
    deleteMany: async ({ where }: { where: { id: string } }) => {
      calls.push(`${name}:delete:${where.id}`);
      const i = list.findIndex((r) => r.id === where.id);
      if (i >= 0) list.splice(i, 1);
      return { count: i >= 0 ? 1 : 0 };
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<WatchRow> }) => {
      calls.push(`${name}:update:${where.id}`);
      Object.assign(list.find((x) => x.id === where.id)!, data);
    },
  });
  const db = {
    priceAlert: {
      findUnique: async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null,
      deleteMany: async ({ where }: { where: { id: string } }) => {
        calls.push(`delete:${where.id}`);
        const i = rows.findIndex((r) => r.id === where.id);
        if (i >= 0) rows.splice(i, 1);
        return { count: i >= 0 ? 1 : 0 };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<StubRow> }) => {
        calls.push(`update:${where.id}`);
        const r = rows.find((x) => x.id === where.id)!;
        Object.assign(r, data);
        return r;
      },
      count: async ({ where }: { where: { userId: string; targetCents: { not: null } } }) => rows.filter((r) => r.userId === where.userId && r.targetCents != null).length,
    },
    deckWatch: table(decks, "deck"),
    sealedWatch: table(sealed, "sealed"),
  };
  return { db: db as unknown as AlertActionDb, rows, decks, sealed, calls };
}

const watch = (over: Partial<StubRow> = {}): StubRow => ({
  id: "row1",
  cardId: 100001,
  market: "AU",
  userId: null,
  targetCents: null,
  targetEmailedCents: null,
  snoozedUntil: null,
  user: null,
  ...over,
});
const tok = (action: "stop" | "snooze" | "target-set" | "target-down", value?: number, alertId = "row1") => signAlertAction({ alertId, action, value, now: NOW });

test("a bad token is a 403 and touches nothing", async () => {
  const s = stub([watch()]);
  for (const t of [null, "", "junk", tok("stop").replace(/.$/, (c) => (c === "A" ? "B" : "A"))]) {
    const r = await performAlertAction(s.db, t, NOW);
    assert.equal(r.status, 403);
    assert.equal(r.outcome, "invalid");
  }
  assert.deepEqual(s.calls, []);
  assert.equal(s.rows.length, 1);
});

test("stop deletes exactly that row, and a second tap is still fine", async () => {
  const s = stub([watch(), watch({ id: "row2", cardId: 100002 })]);
  const r = await performAlertAction(s.db, tok("stop"), NOW);
  assert.equal(r.status, 200);
  assert.deepEqual(s.rows.map((x) => x.id), ["row2"]);
  const again = await performAlertAction(s.db, tok("stop"), NOW);
  assert.equal(again.status, 200);
  assert.equal(again.body.removed, 0);
});

test("snooze sets snoozedUntil 30 days out", async () => {
  const s = stub([watch()]);
  const r = await performAlertAction(s.db, tok("snooze"), NOW);
  assert.equal(r.status, 200);
  assert.deepEqual(s.rows[0]!.snoozedUntil, new Date(NOW.getTime() + SNOOZE_MS));
  const gone = await performAlertAction(stub([]).db, tok("snooze"), NOW);
  assert.equal(gone.status, 404);
  assert.equal(gone.outcome, "gone");
});

test("targets: an anonymous or free watch can't set one (403); Plus can, and re-arms", async () => {
  const anon = stub([watch()]);
  const a = await performAlertAction(anon.db, tok("target-set", 1840), NOW);
  assert.equal(a.status, 403);
  assert.equal(a.outcome, "no-account");
  assert.equal(anon.rows[0]!.targetCents, null);

  const free = stub([watch({ userId: "u1", user: account(null) })]);
  const f = await performAlertAction(free.db, tok("target-set", 1840), NOW);
  assert.equal(f.status, 403);
  assert.equal(f.outcome, "not-plus");
  assert.equal(free.rows[0]!.targetCents, null);
  assert.deepEqual(free.calls, [], "nothing written for a free account");

  const plus = stub([watch({ userId: "u1", user: account("plus"), targetCents: 2000, targetEmailedCents: 1900 })]);
  const p = await performAlertAction(plus.db, tok("target-down", 1800), NOW);
  assert.equal(p.status, 200);
  assert.equal(p.outcome, "ok");
  assert.equal(plus.rows[0]!.targetCents, 1800);
  assert.equal(plus.rows[0]!.targetEmailedCents, null, "a changed target re-arms");
});

test("the Plus target limit is enforced server-side; Premium is unlimited", async () => {
  const full = Array.from({ length: PLUS_TARGET_ALERT_LIMIT }, (_, i) =>
    watch({ id: `t${i}`, cardId: 200000 + i, userId: "u1", user: account("plus"), targetCents: 500 }),
  );
  const s = stub([...full, watch({ userId: "u1", user: account("plus") })]);
  const r = await performAlertAction(s.db, tok("target-set", 1840), NOW);
  assert.equal(r.status, 409);
  assert.equal(r.outcome, "limit");
  assert.equal(s.rows.find((x) => x.id === "row1")!.targetCents, null);

  const prem = stub([...full.map((w) => ({ ...w, user: account("premium") })), watch({ userId: "u1", user: account("premium") })]);
  const ok = await performAlertAction(prem.db, tok("target-set", 1840), NOW);
  assert.equal(ok.status, 200);
  assert.equal(prem.rows.find((x) => x.id === "row1")!.targetCents, 1840);
});

test("a one-tap target at or above the current alert price is stored already FIRED there, never re-sent as is", async () => {
  // The email showed 1399; a target at 1399 (an old "Set target at this
  // price" link) used to re-arm, and the next paid run re-sent "hit your
  // target" with nothing changed. Now it re-fires only on a further drop.
  const at = stub([watch({ userId: "u1", user: account("plus"), targetCents: 1500, lastPriceCents: 1399 })]);
  assert.equal((await performAlertAction(at.db, tok("target-set", 1399), NOW)).status, 200);
  assert.equal(at.rows[0]!.targetCents, 1399);
  assert.equal(at.rows[0]!.targetEmailedCents, 1399, "fired at the price the member was looking at");
  // The price fell after the email: the new target is above it — same rule.
  const fell = stub([watch({ userId: "u1", user: account("plus"), targetCents: 1500, lastPriceCents: 1200 })]);
  await performAlertAction(fell.db, tok("target-down", 1350), NOW);
  assert.equal(fell.rows[0]!.targetEmailedCents, 1200);
  // A target under the price arms normally.
  const under = stub([watch({ userId: "u1", user: account("plus"), targetCents: null, lastPriceCents: 1840 })]);
  await performAlertAction(under.db, tok("target-down", 1656), NOW);
  assert.equal(under.rows[0]!.targetEmailedCents, null);
});

test("…and the run then stays quiet until a real further drop", async () => {
  const { harness, owned, plus, daysAgo } = await import("./helpers/alert-harness");
  const state = { targetCents: 1399, targetEmailedCents: 1399, lastPriceCents: 1399, dropAnchorCents: 1399, lastNotifiedAt: daysAgo(2) };
  const same = harness([owned("a", plus, { ...state, price: 1399 })]);
  await same.run("paid");
  assert.equal(same.sent.length, 0, "no duplicate 'hit your target'");
  const lower = harness([owned("a", plus, { ...state, price: 1250 })]);
  await lower.run("paid");
  assert.equal(lower.items()[0]?.kind, "target", "10% further down fires");
});

// ── The route and the page ───────────────────────────────────────────────────

test("POST /api/alerts/action: 403 on a bad token, JSON or form", async () => {
  const json = await actionPOST(
    new Request("https://mtgcompare.app/api/alerts/action", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.1" }, body: JSON.stringify({ token: "nope.nope" }) }),
  );
  assert.equal(json.status, 403);
  const form = await actionPOST(
    new Request("https://mtgcompare.app/api/alerts/action", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "10.0.0.2" }, body: "t=forged.token" }),
  );
  assert.equal(form.status, 403);
});

test("no GET acts: the route's GET only redirects to the confirmation page, and the page only confirms, posting a form", () => {
  const route = code("src/app/api/alerts/action/route.ts");
  // A GET (a mail scanner, or a client opening List-Unsubscribe in a browser) redirects to the page and does nothing else.
  const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
  assert.match(get, /NextResponse\.redirect\(to, \{ status: 303/);
  assert.doesNotMatch(get, /performAlertAction|applyAlertActionToken|prisma|deleteMany|\.update\(/);
  assert.match(route, /applyAlertActionToken\(token\)/);
  const page = code("src/app/alerts/action/page.tsx");
  assert.doesNotMatch(page, /performAlertAction|applyAlertActionToken|deleteMany|\.update\(|applyTargetPrice/, "the GET page must never change state");
  assert.match(page, /<form method="post" action="\/api\/alerts\/action"/);
  assert.match(page, /verifyAlertAction\(token\)/);
  assert.match(page, /index: false/);
});

// ── Deck and sealed watch tokens (OP: one v2 token family, kind-tagged) ──────

test("deck and sealed watch links: stop deletes that one watch, snooze sets it, a card token never reaches them", async () => {
  const links = watchActionLinks({ kind: "sealed", id: "sw1", now: NOW })!;
  const stop = new URL(links.stop).searchParams.get("t")!;
  const snooze = new URL(links.snooze).searchParams.get("t")!;
  const v = verifyAlertAction(stop, NOW);
  assert.ok(v.ok && v.kind === "sealed" && v.action === "stop");
  const s = stub([watch()], [{ id: "d1", snoozedUntil: null }], [{ id: "sw1", snoozedUntil: null }, { id: "sw2", snoozedUntil: null }]);
  assert.equal((await performAlertAction(s.db, snooze, NOW)).status, 200);
  assert.deepEqual(s.sealed.find((r) => r.id === "sw1")!.snoozedUntil, new Date(NOW.getTime() + SNOOZE_MS));
  assert.equal((await performAlertAction(s.db, stop, NOW)).status, 200);
  assert.deepEqual(s.sealed.map((r) => r.id), ["sw2"], "exactly that watch");
  assert.equal(s.rows.length, 1, "a sealed token never touches the card table");
  assert.equal(s.decks.length, 1);
  const again = await performAlertAction(s.db, stop, NOW);
  assert.equal(again.status, 200);
  assert.equal(again.body.removed, 0);
});

test("without EMAIL_LINK_SECRET no link is minted and no token verifies (fail closed)", () => {
  const key = process.env.EMAIL_LINK_SECRET;
  const t = signAlertAction({ alertId: "rowA", action: "stop", now: NOW });
  delete process.env.EMAIL_LINK_SECRET;
  try {
    assert.equal(alertActionLinks({ alertId: "r", currentCents: 1000, targetCents: null, canTarget: true, now: NOW }), null);
    assert.equal(watchActionLinks({ kind: "deck", id: "d", now: NOW }), null);
    assert.equal(verifyAlertAction(t, NOW).ok, false, "a token signed with the key is refused once the key is gone");
    assert.throws(() => signAlertAction({ alertId: "rowA", action: "stop", now: NOW }));
    process.env.EMAIL_LINK_SECRET = "short";
    assert.equal(alertActionLinks({ alertId: "r", currentCents: 1000, targetCents: null, canTarget: true, now: NOW }), null, "under 32 characters counts as unset");
  } finally {
    process.env.EMAIL_LINK_SECRET = key;
  }
});

test("the HMAC key is derived from EMAIL_LINK_SECRET with its own label, never AUTH_SECRET", () => {
  const src = code("src/lib/alert-actions.ts");
  assert.match(src, /alert-action:v1/);
  assert.doesNotMatch(src, /AUTH_SECRET/);
});
