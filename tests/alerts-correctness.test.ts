import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildAlertConfirmationEmail } from "../src/lib/email";
import { CONFIRMATION_DAILY_CAP, claimConfirmationSlot, confirmationKey, type ConfirmationDb } from "../src/lib/alert-confirmations";

// ─────────────────────────────────────────────────────────────────────────────
// Alert correctness: the numbers and promises the paid target alert is built
// on (RiftCompare's alerts-correctness, over MTG Compare's schema and workflow).
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("schema: targetCents and startPriceCents are additive, nullable PriceAlert columns; lastFlaggedAt records an in-app delivery", () => {
  const schema = read("prisma/schema.prisma");
  const model = schema.slice(schema.indexOf("model PriceAlert {"), schema.indexOf("model AlertMute {"));
  assert.match(model, /\n\s*targetCents\s+Int\?\n/);
  assert.match(model, /\n\s*startPriceCents\s+Int\?\n/);
  assert.match(model, /\n\s*lastNotifiedAt\s+DateTime\?/);
  assert.match(model, /\n\s*lastFlaggedAt\s+DateTime\?/);
  assert.match(model, /\n\s*confirmSentAt\s+DateTime\?/);
  assert.match(model, /@@unique\(\[email, cardId, finish, market\]\)/);
});

test("the run READS the start price (the email's 'you started watching at') but never writes it", () => {
  assert.doesNotMatch(code("src/lib/price-alerts.ts"), /data\.startPriceCents|startPriceCents\s*=[^=]/);
});

test("the anonymous subscribe door seeds from the ALERT PRICE once, never from Card.low<M>", () => {
  // Never the eBay-inclusive Card price: a card only eBay listed was read as
  // sold out on the first run and its first store listing emailed "back in
  // stock". alertBaselineSeed's own behaviour is pinned in alert-price.test.ts.
  const lib = code("src/lib/alert-subscribe.ts");
  assert.match(lib, /computeAlertPrices\(io\.readOffers \?\? liveAlertReader\(\), fresh\.map\(\(c\) => \(\{ cardId: c\.id, finish: c\.finish, market \}\)\), now\)/);
  assert.match(lib, /\.\.\.alertBaselineSeed\(prices\.get\(alertPairKey\(market, c\.id, c\.finish\)\)\)/);
  assert.doesNotMatch(lib, /\blow(US|AU|UK|SG|CA|EU)\b|lowestPriceCents/);
  assert.match(lib, /skipDuplicates: true/, "re-watching never rewrites a baseline");
});

test("confirmations: nothing is sent at request time; the outbox claims a slot only when it is about to send", () => {
  const route = code("src/app/api/alerts/subscribe/route.ts");
  assert.doesNotMatch(route, /send[A-Z]\w+\(|claimConfirmationSlot|CONFIRMATION_DAILY_CAP/, "the route only writes rows: the hourly outbox sends");
  const outbox = code("src/lib/alert-confirmations.ts");
  const loop = outbox.slice(outbox.indexOf("export async function drainConfirmations"));
  assert.match(loop, /confirmedBefore/, "a returning address is stamped silently");
  assert.match(loop, /claimConfirmationSlot\(prisma, now\)/);
  assert.ok(loop.indexOf("confirmedBefore") < loop.indexOf("claimConfirmationSlot"), "a returning address never spends a slot");
  // The confirmation states the real cadence (rendered, both parts), never "whenever the price drops".
  const conf = buildAlertConfirmationEmail([], 3, "tok", true);
  for (const part of [conf.html, conf.text]) {
    assert.doesNotMatch(part, /whenever the price drops/);
    assert.match(part, /At most one email a week/);
  }
});

// A Counter table in memory, with the same upsert-increment semantics.
function counterStub(opts: { fail?: boolean } = {}) {
  const rows = new Map<string, number>();
  const calls: Record<string, unknown>[] = [];
  const db = {
    counter: {
      upsert: async (args: { where: { key: string }; create: { value: number }; update: { value: { increment: number } } }) => {
        calls.push(args as unknown as Record<string, unknown>);
        if (opts.fail) throw new Error("db down");
        const cur = rows.get(args.where.key);
        const value = cur == null ? args.create.value : cur + args.update.value.increment;
        rows.set(args.where.key, value);
        return { value };
      },
    },
  };
  return { db: db as unknown as ConfirmationDb, rows, calls };
}

test("the daily cap counts confirmations sent — one slot per call, per UTC day — and fails closed", async () => {
  const day = new Date("2026-10-04T10:00:00Z");
  const c = counterStub();
  const results: boolean[] = [];
  for (let i = 0; i < CONFIRMATION_DAILY_CAP + 2; i++) results.push(await claimConfirmationSlot(c.db, day));
  assert.equal(CONFIRMATION_DAILY_CAP, 30);
  assert.equal(results.filter(Boolean).length, CONFIRMATION_DAILY_CAP, "exactly the cap is sent");
  assert.deepEqual(results.slice(-2), [false, false]);
  assert.equal(c.rows.get(confirmationKey(day)), CONFIRMATION_DAILY_CAP + 2);
  assert.equal(confirmationKey(day), "alert-confirm:2026-10-04");
  assert.equal(await claimConfirmationSlot(c.db, new Date("2026-10-05T00:00:01Z")), true, "the next UTC day starts again");
  // One atomic upsert-increment on the key, never a read-then-write.
  assert.deepEqual(c.calls[0], {
    where: { key: "alert-confirm:2026-10-04" },
    create: { key: "alert-confirm:2026-10-04", value: 1 },
    update: { value: { increment: 1 } },
    select: { value: true },
  });
  assert.equal(await claimConfirmationSlot(counterStub({ fail: true }).db, day), false, "a failing count sends nothing");
});

test("the confirmation names the cards, their market and today's price, and states the cadence", () => {
  const cards = [
    { name: "Lightning Bolt", setCode: "2XM", number: "141", url: "https://mtgcompare.app/card/lightning-bolt", market: "AU" as const, priceCents: 1840, storeName: "Cherry", condition: null },
    { name: "Sol Ring", setCode: "2XM", number: "259", url: "https://mtgcompare.app/card/sol-ring", market: "AU" as const, priceCents: null, storeName: null },
  ];
  const email = buildAlertConfirmationEmail(cards, 12, "tok", true);
  assert.equal(email.subject, "You're watching 12 cards on MTG Compare");
  for (const part of [email.html, email.text]) {
    assert.match(part, /Lightning Bolt/);
    assert.match(part, /cheapest now A\$18\.40 at Cherry · Condition not stated by the store/);
    assert.doesNotMatch(part, /cheapest Near Mint/);
    assert.match(part, /falls at least 5% \(and at least A\$0\.50\) to a new low/);
    assert.match(part, /not in stock at a store yet/);
    assert.match(part, /and 10 more\./);
    assert.match(part, /At most one email a week for free alerts/);
  }
  assert.equal(email.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.equal(buildAlertConfirmationEmail([cards[0]!], 1, "tok").subject, "You're watching Lightning Bolt on MTG Compare");
  const uk = buildAlertConfirmationEmail([{ ...cards[0]!, market: "UK" as const, condition: "Near Mint" }], 1, "tok");
  assert.match(uk.text, /cheapest now £18\.40 at Cherry · Near Mint/);
  assert.match(uk.text, /at least £0\.50\)/);
});

test("alert runs follow a SUCCESSFUL publish: one daily step after the pointed checkout, baselines by mode only", () => {
  const wf = read(".github/workflows/import-prices.yml");
  // The alert step comes after the publish steps (a failed import fails the job before it) and after the checkout of the
  // pointed tree it reads; it runs bare (the daily mode of scripts/alerts.ts), never a second or third time with a mode.
  const phase2 = wf.indexOf("- name: Phase 2");
  const checkout = wf.indexOf("scripts/plane-checkout.sh .data");
  const alerts = wf.indexOf("- name: Alerts");
  assert.ok(phase2 > 0 && checkout > phase2 && alerts > checkout, "publish, then the checkout, then the alerts");
  const step = wf.slice(alerts);
  assert.match(step, /run: npx tsx scripts\/alerts\.ts\s*(\n|$)/);
  assert.doesNotMatch(wf, /alerts\.ts --mode=(free|paid)/, "one daily run, not a free and a paid one");
  // No Vercel cron runs alerts; the workflow owns the run, and the link secret is the only key Actions holds for it.
  const crons = (JSON.parse(read("vercel.json")).crons ?? []) as { path: string }[];
  assert.deepEqual(crons.filter((c) => /alert|email|newsletter/i.test(c.path)), []);
  assert.doesNotMatch(wf, /AUTH_SECRET/, "AUTH_SECRET never goes into Actions");
});

test("a manual publish can switch the alerts off, and a matcher re-import writes fixes, not market news: baseline mode exists for it", () => {
  const wf = read(".github/workflows/import-prices.yml");
  assert.match(wf, /alerts: \{ description: [^\n]*type: boolean/);
  assert.match(read("scripts/alerts.ts"), /baselineOnly: true/);
  assert.match(wf.slice(wf.indexOf("- name: Alerts")), /inputs\.alerts/, "the step honours the box");
});
