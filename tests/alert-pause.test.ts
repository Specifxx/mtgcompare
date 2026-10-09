import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { harness, owned, plus, row } from "./helpers/alert-harness";
import { applyAlertEmailMode, alertEmailSummary, maskEmail, pausedAddresses, type AlertMuteDb } from "../src/lib/alert-mute";
import type { AlertCardLoader } from "../src/lib/alert-price";
import { unitKey } from "../src/lib/constants";
import { GET as marketGET } from "../src/app/api/market/route";
import { GET as unsubGET } from "../src/app/api/alerts/unsubscribe/route";

process.env.EMAIL_LINK_SECRET = "test-link-secret-0123456789abcdef0123456789abcdef";

// ─────────────────────────────────────────────────────────────────────────────
// "Pause alert emails, keep my watchlist" (AlertMute, lib/alert-mute.ts): the
// run honours it for every trigger, the footer page pauses by default and
// deletes only on an explicit mode, and the inbox one-click can only pause.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ── The run ──────────────────────────────────────────────────────────────────

test("a paused address gets no email from any trigger; its baselines still advance", async () => {
  const rows = [
    row("a", { lastPriceCents: 1000, price: 800 }), // free drop
    owned("b", plus, { lastPriceCents: 1000, targetCents: 900, price: 850 }), // paid target
    row("c", { lastPriceCents: 1000, price: 800 }), // not paused
  ];
  const h = harness(rows, { mutes: ["a@example.com", "b@example.com"] });
  const s = await h.run();
  assert.deepEqual(h.sent.map((x) => x.to), ["c@example.com"]);
  assert.equal(s.paused, 2);
  assert.equal(s.emails, 1);
  // Baselines advance like a snooze — resuming never releases stale news.
  // The drop anchor holds at the pre-slide price (seeded here on the rule's first run).
  assert.deepEqual(h.writeFor("a"), { lastPriceCents: 800, dropAnchorCents: 1000 });
  assert.equal(h.writeFor("b")!.lastPriceCents, 850);
  assert.equal(h.writeFor("b")!.lastNotifiedAt, undefined);
  assert.equal(h.writeFor("c")!.lastNotifiedAt instanceof Date, true);
  // One scoped read, for the candidates' addresses only.
  assert.equal(h.muteQueries.length, 1);
  const q = h.muteQueries[0] as { where: { email: { in: string[] } }; take: number; select: unknown };
  assert.deepEqual([...q.where.email.in].sort(), ["a@example.com", "b@example.com", "c@example.com"]);
  assert.equal(q.take, 3);
  assert.deepEqual(q.select, { email: true });
});

test("the paid run honours the pause too", async () => {
  const h = harness([owned("b", plus, { lastPriceCents: 1000, targetCents: 900, price: 850 })], { mutes: ["b@example.com"] });
  const s = await h.run("paid");
  assert.equal(h.sent.length, 0);
  assert.equal(s.paused, 1);
});

test("no candidates, no mute read; a failed mute read sends nothing", async () => {
  const quiet = harness([row("a", { lastPriceCents: 1000, price: 1000 })]);
  await quiet.run();
  assert.equal(quiet.muteQueries.length, 0);
  const failing = harness([row("a", { lastPriceCents: 1000, price: 800 })], { muteQueryFails: true });
  await assert.rejects(failing.run());
  assert.equal(failing.sent.length, 0);
  assert.equal(failing.writes.length, 0);
});

test("the digest gets the address's token and anonymity for its links", async () => {
  const h = harness([row("a", { lastPriceCents: 1000, price: 800 }), owned("b", plus, { lastPriceCents: 1000, price: 800 })]);
  await h.run();
  const a = h.sent.find((x) => x.to === "a@example.com")!;
  assert.equal(a.token, "tok-a");
  assert.equal(a.anonymous, true);
  assert.equal(h.sent.find((x) => x.to === "b@example.com")!.anonymous, false);
  // Each item carries its signed row links; a free row gets the Plus link, a paid one the target links.
  assert.match(a.items[0]!.actions!.stop, /\/alerts\/action\?t=/);
  assert.ok(a.items[0]!.actions!.upsell);
  const b = h.sent.find((x) => x.to === "b@example.com")!.items[0]!;
  assert.equal(b.actions!.upsell, null);
  assert.ok(b.actions!.targetDown);
});

test("pausedAddresses is scoped and capped", async () => {
  const calls: unknown[] = [];
  const db = { alertMute: { findMany: async (a: unknown) => (calls.push(a), [{ email: "x@y.z" }]) } };
  assert.deepEqual(await pausedAddresses(db as never, []), new Set());
  assert.equal(calls.length, 0);
  assert.deepEqual(await pausedAddresses(db as never, ["x@y.z", "q@y.z"]), new Set(["x@y.z"]));
  assert.deepEqual(calls[0], { where: { email: { in: ["x@y.z", "q@y.z"] } }, select: { email: true }, take: 2 });
});

// ── The token page's modes ───────────────────────────────────────────────────

// The catalogue stand-in: the watch rows hold only a product id and a finish.
const catalogue: AlertCardLoader = async (units) => {
  const rows: Record<number, { name: string; variant: string | null; number: string }> = {
    3000: { name: "Lightning Bolt", variant: null, number: "141" },
    3001: { name: "Sol Ring", variant: "Foil", number: "259" },
    3002: { name: "Counterspell", variant: null, number: "50" },
  };
  return new Map(units.flatMap((u) => (rows[u.id] ? [[unitKey(u.id, u.finish), { id: u.id, finish: u.finish, slug: String(u.id), setCode: "2XM", releasedOn: null, marketUsd: null, low: {} as never, ...rows[u.id]! }] as const] : [])));
};

function muteStub() {
  const alerts = [
    { id: "r1", email: "bill@example.com", unsubToken: "T", market: "AU", snoozedUntil: null, createdAt: new Date(2), cardId: 3000, finish: 0 },
    { id: "r2", email: "bill@example.com", unsubToken: "T", market: "US", snoozedUntil: null, createdAt: new Date(1), cardId: 3001, finish: 1 },
    { id: "o1", email: "other@example.com", unsubToken: "O", market: "AU", snoozedUntil: null, createdAt: new Date(1), cardId: 3002, finish: 0 },
  ];
  const mutes = new Map<string, { source: string }>();
  const db = {
    priceAlert: {
      findFirst: async ({ where }: { where: { unsubToken: string } }) => alerts.find((a) => a.unsubToken === where.unsubToken) ?? null,
      findMany: async ({ where }: { where: { unsubToken: string } }) => alerts.filter((a) => a.unsubToken === where.unsubToken),
      deleteMany: async ({ where }: { where: { unsubToken: string; id?: string } }) => {
        const hit = alerts.filter((a) => a.unsubToken === where.unsubToken && (where.id == null || a.id === where.id));
        for (const h of hit) alerts.splice(alerts.indexOf(h), 1);
        return { count: hit.length };
      },
    },
    alertMute: {
      findUnique: async ({ where }: { where: { email: string } }) => (mutes.has(where.email) ? { email: where.email } : null),
      upsert: async ({ where, create }: { where: { email: string }; create: { source: string } }) => {
        if (!mutes.has(where.email)) mutes.set(where.email, { source: create.source });
        return {};
      },
      deleteMany: async ({ where }: { where: { email: string } }) => ({ count: mutes.delete(where.email) ? 1 : 0 }),
    },
  };
  return { db: db as unknown as AlertMuteDb, alerts, mutes };
}

test("pause keeps every watch; resume lifts it; the summary reports it", async () => {
  const s = muteStub();
  const r = await applyAlertEmailMode(s.db, "T", "pause", { source: "one-click" });
  assert.equal(r.status, 200);
  assert.equal(s.alerts.length, 3, "no watch deleted");
  assert.equal(s.mutes.get("bill@example.com")?.source, "one-click");
  const sum = await alertEmailSummary(s.db, "T", catalogue);
  assert.deepEqual(sum.cards.map((c) => c.name), ["Lightning Bolt", "Sol Ring (Foil)"], "named from the catalogue, the finish shown");
  assert.equal(sum.paused, true);
  assert.equal(sum.count, 2);
  assert.equal(sum.email, "bi***@example.com");
  assert.deepEqual(sum.cards.map((c) => c.id), ["r1", "r2"]);
  await applyAlertEmailMode(s.db, "T", "resume");
  assert.equal(s.mutes.size, 0);
  assert.equal(maskEmail("x@y.z"), "x*@y.z");
});

test("delete is explicit and scoped to the token; remove is one row of the token's own", async () => {
  const s = muteStub();
  const other = await applyAlertEmailMode(s.db, "T", "remove", { alertId: "o1" });
  assert.equal(other.status, 404, "a token can't remove another address's watch");
  assert.equal(s.alerts.length, 3);
  assert.equal((await applyAlertEmailMode(s.db, "T", "remove", { alertId: "r2" })).status, 200);
  assert.deepEqual(s.alerts.map((a) => a.id), ["r1", "o1"]);
  const del = await applyAlertEmailMode(s.db, "T", "delete");
  assert.equal(del.body.removed, 1);
  assert.deepEqual(s.alerts.map((a) => a.id), ["o1"]);
  assert.equal((await applyAlertEmailMode(s.db, "bad", "pause")).status, 404);
});

test("the unsubscribe route: pause by default, one-click can only pause, no session", () => {
  const src = code("src/app/api/alerts/unsubscribe/route.ts");
  assert.doesNotMatch(src, /getCurrentUser/, "a mail client has no session");
  const form = src.slice(src.indexOf("application/x-www-form-urlencoded"), src.indexOf("const parsed"));
  assert.match(form, /applyAlertEmailModeForToken\(token, "pause", \{ source: "one-click" \}\)/);
  assert.doesNotMatch(form, /"delete"|deleteMany/);
  assert.doesNotMatch(src, /priceAlert\.deleteMany/, "deletion lives behind the explicit mode in lib/alert-mute.ts");
  assert.match(code("src/lib/alert-mute.ts"), /mode: z\.enum\(\["pause", "resume", "delete", "remove"\]\)\.default\("pause"\)|"pause", "resume", "delete", "remove"/);
});

test("GET /api/alerts/unsubscribe without a token is a 400", async () => {
  const res = await unsubGET(new Request("https://mtgcompare.app/api/alerts/unsubscribe"));
  assert.equal(res.status, 400);
});

test("the account's own pause switch requires a session and writes AlertMute", () => {
  const src = code("src/app/api/alerts/pause/route.ts");
  assert.match(src, /getCurrentUser\(\)/);
  assert.match(src, /status: 401/);
  assert.match(src, /sameOrigin\(req\)/, "a cross-site POST is refused");
  assert.match(src, /setAccountAlertPause\(user\.email, body\.paused\)/);
  const lib = code("src/lib/alert-routes.ts");
  assert.match(lib, /pauseAddress\(muteDb, email, "watchlist"\)/);
  assert.match(lib, /resumeAddress\(muteDb, email\)/);
});

test("AlertMute is a new, email-keyed table (additive for db push)", () => {
  const schema = read("prisma/schema.prisma");
  const model = /model AlertMute \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? "";
  assert.match(model, /email\s+String\s+@id/);
  assert.match(model, /source\s+String\?/);
});

// ── /api/market ──────────────────────────────────────────────────────────────

test("/api/market sets the watch's market and redirects same-origin only", async () => {
  const res = marketGET(new Request(`https://mtgcompare.app/api/market?m=uk&to=${encodeURIComponent("/card/lightning-bolt?utm_source=email")}`));
  assert.equal(res.status, 307);
  assert.equal(res.headers.get("location"), "https://mtgcompare.app/card/lightning-bolt?utm_source=email");
  assert.match(res.headers.get("set-cookie") ?? "", /^country=UK; Path=\/; .*Max-Age=31536000/i);
  assert.doesNotMatch(res.headers.get("set-cookie") ?? "", /HttpOnly/i, "CountryProvider reads it client-side");
  for (const to of ["//evil.example/x", "https://evil.example/", "/api/admin"]) {
    const r = marketGET(new Request(`https://mtgcompare.app/api/market?m=AU&to=${encodeURIComponent(to)}`));
    assert.equal(r.headers.get("location"), "https://mtgcompare.app/", to);
  }
  const unknown = marketGET(new Request("https://mtgcompare.app/api/market?m=ZZ&to=/browse"));
  assert.equal(unknown.headers.get("set-cookie"), null);
});
