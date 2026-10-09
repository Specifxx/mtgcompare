import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isEmailEnabled } from "../src/lib/email";
import { lastDelivery, notificationBody, notificationType } from "../src/lib/price-alerts";
import { recordEmailRefused, recordEmailStatus } from "../src/lib/email-status";
import { applyWrites, daysAgo, free, harness, hoursAgo, listing, NOW, owned, plus, row } from "./helpers/alert-harness";

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL OFF (the state MTG Compare ships in, until both mail secrets exist):
// the alert run still works. Every trigger an ACCOUNT would have been emailed
// is delivered in-app — one Notification per card and lastFlaggedAt — the
// baselines advance exactly as after a send, and lastNotifiedAt (which means "an
// email was sent") is NEVER written. An anonymous watch has nowhere in-app to
// go, so it is held until email is on. Nothing is sent, no budget is spent.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const off = { emailEnabled: false } as const;

test("isEmailEnabled needs BOTH secrets", () => {
  assert.equal(isEmailEnabled({}), false);
  assert.equal(isEmailEnabled({ RESEND_API_KEY: "k" }), false);
  assert.equal(isEmailEnabled({ EMAIL_FROM: "MTG Compare <a@example.com>" }), false);
  assert.equal(isEmailEnabled({ RESEND_API_KEY: "k", EMAIL_FROM: "MTG Compare <a@example.com>" }), true);
});

test("a free account's new low is flagged in-app: one Notification, lastFlaggedAt, no lastNotifiedAt, baseline advanced", async () => {
  const h = harness([owned("a", free, { lastPriceCents: 1000, price: 800, dropAnchorCents: 1000 })], off);
  const s = await h.run();
  assert.equal(s.emailOn, false);
  assert.equal(s.emails, 0);
  assert.equal(s.flagged, 1);
  assert.equal(h.sent.length, 0, "nothing is emailed");
  assert.equal(h.notified.length, 1);
  assert.equal(h.notified[0]!.userId, "u-a");
  assert.equal(h.notified[0]!.type, "price_drop");
  assert.match(h.notified[0]!.href ?? "", /^\/card\//);
  const w = h.writeFor("a")!;
  assert.deepEqual(w.lastFlaggedAt, NOW);
  assert.equal(w.lastNotifiedAt, undefined, "lastNotifiedAt means an email was sent");
  assert.equal(w.lowestEmailedCents, undefined, "the emailed watermark is not a flag");
  assert.equal(w.lastPriceCents, 800, "the baseline advances as after a send");
  assert.equal(w.dropAnchorCents, 800, "the slide we just flagged is over");
});

test("a Plus target hit is flagged and re-arms only on a real further drop; the 20h cooldown reads the flag", async () => {
  const h = harness([owned("p", plus, { targetCents: 1000, lastPriceCents: 1200, price: 950 })], off);
  const s = await h.run("paid");
  assert.equal(s.targets, 1);
  assert.equal(s.flagged, 1);
  assert.equal(h.notified[0]!.type, notificationType({ kind: "target" }));
  const w = h.writeFor("p")!;
  assert.equal(w.targetEmailedCents, 950, "fired: it will not re-fire at the same price");
  assert.equal(w.lastNotifiedAt, undefined);
  // The next run, 12h later at the same price: quiet.
  const rows = applyWrites([owned("p", plus, { targetCents: 1000, lastPriceCents: 1200, price: 950 })], h.writes).map((r) => ({ ...r, _price: 950 }));
  const next = harness(rows, { ...off, now: new Date(NOW.getTime() + 12 * 3600_000) });
  await next.run("paid");
  assert.equal(next.notified.length, 0);
  // A paid trigger inside the cooldown of a FLAG is held (the later of the two stamps counts).
  const hot = harness([owned("c", plus, { targetCents: 1000, lastPriceCents: 1200, price: 950, lastFlaggedAt: hoursAgo(5) })], off);
  const sc = await hot.run("paid");
  assert.equal(sc.cooldown, 1);
  assert.equal(hot.notified.length, 0);
});

test("the weekly cap holds for in-app flags too; the second week's drop is delivered", async () => {
  const state = { lastPriceCents: 1000, price: 800, dropAnchorCents: 1000 };
  const early = harness([owned("a", free, { ...state, lastFlaggedAt: daysAgo(3) })], off);
  const s = await early.run();
  assert.equal(s.deferred, 1);
  assert.equal(early.notified.length, 0);
  assert.equal(early.writeFor("a"), undefined, "baseline held, so it re-detects next week");
  const later = harness([owned("a", free, { ...state, lastFlaggedAt: daysAgo(8) })], off);
  assert.equal((await later.run()).flagged, 1);
});

test("an anonymous watch has nowhere in-app to go: it is held, its baseline kept, until email is on", async () => {
  const h = harness([row("anon", { lastPriceCents: 1000, price: 800, dropAnchorCents: 1000 })], off);
  const s = await h.run();
  assert.equal(s.flagged, 0);
  assert.equal(h.notified.length, 0);
  assert.equal(h.sent.length, 0);
  assert.equal(h.writeFor("anon")?.lastPriceCents, undefined, "held: the drop is still news when email arrives");
  assert.equal(h.writeFor("anon")?.lastNotifiedAt, undefined);
});

test("the send budget, per-run caps and AlertMute (a pause of EMAIL) do not apply to in-app delivery", async () => {
  const rows = Array.from({ length: 60 }, (_, i) => owned(`m${i}`, free, { lastPriceCents: 1000, price: 800, dropAnchorCents: 1000 }));
  const h = harness(rows, { ...off, dailyBudget: 0, mutes: ["m0@example.com"] });
  const s = await h.run();
  assert.equal(s.flagged, 60);
  assert.equal(s.paused, 0);
  assert.equal(s.budgetDeferred, 0);
  assert.equal(h.budgetQueries.length, 0, "no budget read when nothing is sent");
  assert.equal(h.muteQueries.length, 0);
});

test("a Notification that fails to write holds the watch for the next run", async () => {
  const h = harness([owned("a", free, { lastPriceCents: 1000, price: 800, dropAnchorCents: 1000 })], { ...off, notifyFails: true });
  const s = await h.run();
  assert.equal(s.flagged, 0);
  assert.equal(s.held, 1);
  assert.equal(h.writeFor("a")?.lastPriceCents, undefined, "baseline held, so the drop re-detects");
  assert.equal(h.writeFor("a")?.lastFlaggedAt, undefined);
});

test("baselineOnly delivers nothing in either mode and never touches the flag or notified stamps", async () => {
  for (const emailEnabled of [true, false]) {
    const h = harness([owned("a", free, { lastPriceCents: 1000, price: 700, dropAnchorCents: 1000 }), row("b", { lastPriceCents: 1000, price: 700, dropAnchorCents: 1000 })], { emailEnabled });
    await h.runBaseline();
    assert.equal(h.sent.length, 0);
    assert.equal(h.notified.length, 0);
    for (const w of h.writes) {
      assert.equal(w.data.lastNotifiedAt, undefined);
      assert.equal(w.data.lastFlaggedAt, undefined);
    }
    assert.equal(h.writeFor("a")!.lastPriceCents, 700);
  }
});

test("a first price in-app: 'now listed' for an account, flagged, baseline written", async () => {
  const h = harness([owned("a", free, { price: 1299 })], off);
  const s = await h.run();
  assert.equal(s.listed, 1);
  assert.equal(s.flagged, 1);
  assert.equal(h.notified[0]!.type, notificationType({ kind: "listed" }));
  assert.equal(h.writeFor("a")!.lastPriceCents, 1299);
  assert.equal(h.writeFor("a")!.lowestEmailedCents, undefined, "a flag never seeds the emailed watermark");
});

test("a restock in-app: sold out for 2 runs and 20h, then priced again, flagged", async () => {
  const h = harness([owned("a", free, { lastPriceCents: 1000, soldOutAt: daysAgo(2), price: 1000, dropAnchorCents: 1000 })], off);
  const s = await h.run();
  assert.equal(s.restocks, 1);
  assert.equal(s.flagged, 1);
  assert.equal(h.notified[0]!.type, notificationType({ kind: "restock" }));
  assert.equal(h.writeFor("a")!.soldOutAt, null);
});

test("the notification text names the card and the cheapest store, never promises an email", async () => {
  const h = harness([owned("a", free, { lastPriceCents: 1000, price: 800, dropAnchorCents: 1000 })], { ...off, stores: [listing("card-a", 900, { source: "store:other" })] });
  await h.run();
  const n = h.notified[0]!;
  assert.match(n.title, /Card a/);
  assert.doesNotMatch(`${n.title} ${n.body}`, /email/i);
  assert.ok(notificationBody({ kind: "drop", stores: [], currentCents: 800, currency: "USD", market: "US" } as never).length > 0);
});

test("lastDelivery is the later of the email and the flag", () => {
  assert.equal(lastDelivery(null, null), null);
  assert.deepEqual(lastDelivery(daysAgo(5), daysAgo(1)), daysAgo(1));
  assert.deepEqual(lastDelivery(daysAgo(1), daysAgo(5)), daysAgo(1));
});

test("the status the runners record: on only with both secrets; a refused key flips it back off", async () => {
  const upserts: { key: string; value: string }[] = [];
  const db = { meta: { upsert: async (a: { create: { key: string; value: string } }) => (upserts.push(a.create), a) } } as never;
  assert.equal(await recordEmailStatus(db, true), "on");
  assert.equal(await recordEmailStatus(db, false), "off");
  assert.equal(await recordEmailRefused(db), "off");
  assert.deepEqual(upserts.map((u) => [u.key, u.value]), [["email", "on"], ["email", "off"], ["email", "off"]]);
});

test("scripts/alerts.ts: modes, the Meta record first, an ImportRun row, red only on a refused key", () => {
  const src = read("scripts/alerts.ts");
  assert.match(src, /arg === "free" \|\| arg === "paid" \|\| arg === "baseline"/);
  assert.match(src, /return "daily"/, "no mode named is the daily run");
  assert.ok(src.indexOf("recordEmailStatus(prisma, emailOn)") < src.indexOf("prisma.importRun.create"), "the site's promises follow the run, written first");
  assert.match(src, /importRun\.create\(\{ data: \{ kind: "alerts" \} \}\)/);
  assert.match(src, /baselineOnly: true/);
  assert.match(src, /if \(providerRefused\(\)\) throw new Error/, "a refused key exits red");
  assert.match(src, /exits 0/i, "any other failure is recorded, not red");
  const wf = read(".github/workflows/import-prices.yml");
  assert.match(wf, /scripts\/alerts\.ts/);
});
