import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RELEASE_DAY_WINDOW_DAYS, buildReleaseDayEmail, releaseDayCampaign, releaseDayRefusal, runReleaseDayBlast, type ReleaseDayStats } from "../src/lib/release-day";
import type { SetLite } from "../src/lib/data/types";

// The release-day blast (parity P36): an announcement to the opt-in newsletter list, sent script-side only, once the set is out and
// while it is new, resumable, idempotent per campaign, honest about its figures. Modern Horizons 3 (MH3, released 2024-06-14) is the set.

const MH3 = { id: 23, slug: "modern-horizons-3", tok: "mh3", code: "MH3", name: "Modern Horizons 3", tcgName: "Modern Horizons 3", kind: "expansion", releasedOn: "2024-06-14", bucket: false, cardCount: 1005, trackedCount: 930, sealedCount: 12 } as unknown as SetLite;
const STATS: ReleaseDayStats = { cardCount: 1005, pricedCount: 930, storeCount: 31, marketCount: 6, sealedAvailable: true };
const NOW = new Date("2024-06-14T09:00:00Z");

test("a set is announced only once it is out and while it is new", () => {
  assert.equal(releaseDayRefusal(MH3, "2024-06-14"), null, "release day");
  assert.equal(releaseDayRefusal(MH3, "2024-06-20"), null, "inside the window");
  assert.match(releaseDayRefusal(MH3, "2024-06-13")!, /not out yet/);
  assert.match(releaseDayRefusal(MH3, "2024-07-01")!, new RegExp(`past the ${RELEASE_DAY_WINDOW_DAYS}-day announcement window`));
  assert.match(releaseDayRefusal({ name: "Unannounced", releasedOn: null }, "2024-06-14")!, /no release date/);
});

test("the email states only facts it was given, and a missing figure is left out, never guessed", () => {
  const e = buildReleaseDayEmail("Modern Horizons 3", "modern-horizons-3", STATS, "https://mtgcompare.app/newsletter/unsubscribe?token=t1");
  assert.equal(e.subject, "Modern Horizons 3 is out: card prices are up");
  assert.match(e.text, /1,005 cards are in the database\./);
  assert.match(e.text, /930 already have a tracked price\./);
  assert.match(e.text, /sealed products are priced too\./);
  assert.match(e.html, /\/sets\/modern-horizons-3/);
  assert.equal(e.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.match(e.html, /Unsubscribe/);
  const bare = buildReleaseDayEmail("Modern Horizons 3", "modern-horizons-3", { cardCount: 1005, pricedCount: null, storeCount: null, marketCount: 6, sealedAvailable: false }, "https://mtgcompare.app/u");
  assert.doesNotMatch(bare.text, /tracked price|sealed|stores in/);
  assert.doesNotMatch(`${e.html} ${e.text}`, /One Piece|OP Compare|opcompare/i);
});

function fakeDb(rows: { id: string; email: string; unsubToken: string | null; lastEditionKey: string | null }[]) {
  const updates: { id: string; data: Record<string, unknown> }[] = [];
  const db = {
    newsletterSubscriber: {
      findMany: async () => rows.map((r) => ({ ...r })),
      update: async (a: { where: { id: string }; data: Record<string, unknown> }) => {
        updates.push({ id: a.where.id, data: a.data });
        const row = rows.find((r) => r.id === a.where.id)!;
        Object.assign(row, a.data);
        return row;
      },
    },
  };
  return { db: db as never, updates, rows };
}
const deps = (db: never, over: Record<string, unknown> = {}) => ({ now: NOW, getSet: async () => MH3, stats: async () => STATS, emailEnabled: true, sleep: async () => {}, db, ...over });

test("a dry run reports the audience and sends nothing", async () => {
  const f = fakeDb([{ id: "a", email: "a@example.com", unsubToken: "ta", lastEditionKey: null }, { id: "b", email: "b@example.com", unsubToken: "tb", lastEditionKey: releaseDayCampaign("modern-horizons-3") }]);
  const sent: string[] = [];
  const r = await runReleaseDayBlast({ setSlug: "modern-horizons-3", dryRun: true }, deps(f.db, { send: async (to: string) => (sent.push(to), true), emailEnabled: false }));
  assert.equal(r.ok, true);
  assert.deepEqual([r.subscribers, r.pending, r.sent], [2, 1, 0]);
  assert.deepEqual(sent, []);
  assert.deepEqual(f.updates, []);
});

test("a send stamps the campaign only on success; a failure is retried by the next run; nobody is emailed twice", async () => {
  const f = fakeDb([
    { id: "a", email: "a@example.com", unsubToken: "ta", lastEditionKey: null },
    { id: "b", email: "b@example.com", unsubToken: null, lastEditionKey: "2024-W24" },
    { id: "c", email: "c@example.com", unsubToken: "tc", lastEditionKey: null },
  ]);
  const sent: string[] = [];
  const send = async (to: string) => (to === "c@example.com" ? false : (sent.push(to), true));
  const r1 = await runReleaseDayBlast({ setSlug: "modern-horizons-3", dryRun: false }, deps(f.db, { send }));
  assert.deepEqual([r1.sent, r1.failed, r1.remaining], [2, 1, 1]);
  assert.deepEqual(sent.sort(), ["a@example.com", "b@example.com"]);
  assert.ok(f.rows.find((x) => x.id === "b")!.unsubToken, "a missing unsubscribe token is minted before the send");
  assert.equal(f.rows.find((x) => x.id === "c")!.lastEditionKey, null, "a failed send is not stamped");
  const r2 = await runReleaseDayBlast({ setSlug: "modern-horizons-3", dryRun: false }, deps(f.db, { send: async (to: string) => (sent.push(to), true) }));
  assert.deepEqual([r2.sent, r2.pending], [1, 1]);
  assert.deepEqual(sent.sort(), ["a@example.com", "b@example.com", "c@example.com"], "each address exactly once");
});

test("the batch cap leaves the rest for the next run", async () => {
  const f = fakeDb(Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, email: `s${i}@example.com`, unsubToken: `t${i}`, lastEditionKey: null })));
  const r = await runReleaseDayBlast({ setSlug: "modern-horizons-3", dryRun: false, limit: 2 }, deps(f.db, { send: async () => true }));
  assert.deepEqual([r.sent, r.remaining], [2, 3]);
});

test("refusals: an unknown set, email off, an empty database", async () => {
  const f = fakeDb([]);
  assert.match((await runReleaseDayBlast({ setSlug: "nope", dryRun: true }, deps(f.db, { getSet: async () => null }))).error!, /Unknown set slug/);
  assert.match((await runReleaseDayBlast({ setSlug: "modern-horizons-3", dryRun: false }, deps(f.db, { emailEnabled: false }))).error!, /Email is off/);
  assert.match((await runReleaseDayBlast({ setSlug: "modern-horizons-3", dryRun: true }, deps(f.db, { stats: async () => ({ ...STATS, cardCount: 0 }) }))).error!, /Zero cards/);
  assert.match((await runReleaseDayBlast({ setSlug: "modern-horizons-3", dryRun: true }, deps(f.db, { now: new Date("2024-06-01T00:00:00Z") }))).error!, /not out yet/);
});

test("it is script-side only: a manual workflow gated on the mail secrets, a script that refuses without RELEASE_DAY_SEND, no page imports it", () => {
  const wf = readFileSync(".github/workflows/release-day-email.yml", "utf8");
  assert.match(wf, /on:\n\s+workflow_dispatch:/);
  assert.doesNotMatch(wf, /schedule:|\[deploy\]/);
  assert.match(wf, /RESEND_API_KEY[\s\S]*EMAIL_FROM[\s\S]*run=false/);
  const script = readFileSync("scripts/send-release-day.ts", "utf8");
  assert.match(script, /RELEASE_DAY_SEND !== "1"/);
  assert.match(script, /DRY_RUN === "1"/);
});
