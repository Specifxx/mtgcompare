// The public render path must not wake Neon (critique DP-03; spec 12.12): crawler gating and the sampled, batched view counter. Owner WP02.
import test from "node:test";
import assert from "node:assert/strict";
import { isLikelyBot, shouldTouchNeon } from "../src/lib/data/plane/crawler";
import { BEACON_DEFAULTS, CLICK_DEFAULTS, ClickBatcher, ViewBatcher } from "../src/lib/data/plane/view-beacon";

test("crawlers, link-preview bots, AI crawlers, HTTP libraries and an empty user agent are bots; browsers are not", () => {
  for (const ua of ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.1; +https://openai.com/gptbot)", "Mozilla/5.0 (compatible; bingbot/2.0)", "facebookexternalhit/1.1", "Slackbot-LinkExpanding 1.0", "curl/8.4.0", "python-requests/2.31", "Go-http-client/2.0", "Mozilla/5.0 (compatible; AhrefsBot/7.0)", "Mozilla/5.0 (compatible; ClaudeBot/1.0)", "node-fetch/1.0", "", null, undefined]) assert.equal(isLikelyBot(ua), true, String(ua));
  for (const ua of ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0"]) { assert.equal(isLikelyBot(ua), false, ua); assert.equal(shouldTouchNeon(ua), true); }
});
test("the view counter samples 1 in 10, never counts a bot, caps its memory, flushes at most every 30 minutes, and drains scaled so totals stay unbiased", () => {
  let t = 0, seq = 0; const rnd = () => ((seq = (seq * 1103515245 + 12345) % 2147483648) / 2147483648); const b = new ViewBatcher(() => t, rnd);
  assert.equal(BEACON_DEFAULTS.sampleOneIn, 10); assert.equal(BEACON_DEFAULTS.flushMinutes, 30);
  assert.equal(b.record(5, "view", true), false, "a bot is never counted"); assert.equal(b.record(-1, "view", false), false); assert.equal(b.size, 0);
  let counted = 0; for (let i = 0; i < 10_000; i++) if (b.record(1 + (i % 50), "view", false)) counted++; assert.ok(counted > 800 && counted < 1200, `sampled ${counted} of 10000`);
  assert.equal(b.due(), false, "nothing is flushed before the first window"); t = 29 * 60_000; assert.equal(b.due(), false); t = 30 * 60_000 + 61_000; assert.equal(b.due(), false, "outside the one-minute window after :30 nothing is flushed, however long ago the last flush was"); t = 30 * 60_000 + 5_000; assert.equal(b.due(), true);
  const rows = b.drain(); const est = rows.reduce((a, r) => a + r.views, 0); assert.ok(est > 8000 && est < 12000, `the drained total estimates ${est} of 10000 views`); assert.equal(b.due(), false, "drain resets the timer"); assert.equal(b.size, 0);
  const small = new ViewBatcher(() => t, () => 0, { sampleOneIn: 1, flushMinutes: 30, maxEntries: 3, maxFlushRows: 2 });
  for (const id of [1, 2, 3, 4, 5]) small.record(id, "search", false); assert.equal(small.size, 3, "memory is bounded: further cards are dropped until the next drain"); assert.equal(small.drain().length, 2, "a flush writes at most maxFlushRows rows in one statement"); assert.equal(small.size, 1);
  assert.equal(new ViewBatcher(() => t, () => 0, { ...BEACON_DEFAULTS, sampleOneIn: 0 }).record(1, "view", false), false, "VIEW_BEACON_SAMPLE=0 switches the counter off");
});

test("ALIGNED flush: instances flush inside the same minute of each half hour, so the database wakes at most 48 times a day however many instances run", () => {
  const instances = Array.from({ length: 5 }, (_, i) => { let t = 0; const b = new ViewBatcher(() => t, () => 0, { ...BEACON_DEFAULTS, sampleOneIn: 1 }); return { b, at: (ms: number) => { t = ms; }, i }; });
  let wakes = 0, minutesAwake = 0; let lastWake = -1;
  for (let minute = 0; minute < 24 * 60; minute++) {
    const flushedNow = instances.filter(({ b, at, i }) => { at(minute * 60_000 + 3_000 + i * 1000); b.record(1 + i, "view", false); if (!b.due()) return false; b.drain(); return true; }).length;
    if (flushedNow > 0) { wakes++; if (lastWake < 0 || minute - lastWake > 5) minutesAwake += 5; lastWake = minute; }
  }
  assert.ok(wakes === 47 || wakes === 48, `5 instances, one burst per half hour: ${wakes} wakes in a day (47 on the first day: the period of construction counts as flushed)`); assert.ok(minutesAwake <= 48 * 5, `${minutesAwake} minutes of compute a day (the Free plan allows 800)`);
});

test("the outbound click log is buffered and flushed in the SAME aligned window as the view counter (10.32): never a bot, sampled, bounded, one insert per half hour", () => {
  let t = 0; const row = { retailer: "store:x", page: "card", slug: "sol-ring", country: "US", userId: null, entry: null };
  const b = new ClickBatcher(() => t, () => 0.5, { ...CLICK_DEFAULTS, sampleRate: 1 });
  assert.equal(b.record(row, true), false, "a bot never logs a click"); assert.equal(b.record(row, false), true); assert.equal(b.due(), false, "nothing before the first window");
  t = 30 * 60_000 + 5_000; assert.equal(b.due(), true, "inside the first minute after :30"); assert.equal(b.drain().length, 1); assert.equal(b.due(), false, "drain resets the timer");
  t = 30 * 60_000 + 61_000; b.record(row, false); assert.equal(b.due(), false, "outside the window nothing is written");
  assert.equal(new ClickBatcher(() => t, () => 0.5, { ...CLICK_DEFAULTS, sampleRate: 0 }).record(row, false), false, "CLICK_LOG=0 switches the log off");
  assert.equal(new ClickBatcher(() => t, () => 0.9, { ...CLICK_DEFAULTS, sampleRate: 0.5 }).record(row, false), false, "sampling drops a click when the draw is above the rate");
  const small = new ClickBatcher(() => t, () => 0, { ...CLICK_DEFAULTS, maxEntries: 2 }); for (let i = 0; i < 5; i++) small.record(row, false); assert.equal(small.size, 2, "memory is bounded");
  const v = new ViewBatcher(() => t, () => 0, { ...BEACON_DEFAULTS, sampleOneIn: 1 }), c = new ClickBatcher(() => t, () => 0); v.record(1, "view", false); c.record(row, false);
  let wakesA = 0; for (let m = 0; m < 24 * 60; m++) { t = m * 60_000 + 2_000; if (v.due() || c.due()) { wakesA++; v.drain(); c.drain(); } v.record(1, "view", false); c.record(row, false); }
  assert.ok(wakesA <= 48, `views and clicks share one aligned window: ${wakesA} wakes a day (at most 48)`);
});
