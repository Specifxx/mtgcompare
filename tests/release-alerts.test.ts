import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RELEASE_ALERT_SEND_CAP,
  RELEASE_ALERT_SOURCES,
  RELEASE_ALERT_WINDOW_DAYS,
  buildReleaseEmail,
  groupByEmail,
  isUnreleased,
  releaseAlertSets,
  releaseCounterKey,
  releaseOneClickUrl,
  releaseStopUrl,
  renderReleaseEmailHtml,
  renderReleaseEmailText,
  restockTransitions,
  singlesNotices,
  type ReleaseAlertRow,
} from "../src/lib/release-alerts";
import { parseReleaseBody } from "../src/lib/alert-routes";
import { emailShell } from "../src/lib/email";

const row = (over: Partial<ReleaseAlertRow> = {}): ReleaseAlertRow => ({
  id: "r1",
  email: "a@b.co",
  scope: "set",
  market: "US",
  unsubToken: "tok",
  singlesNotifiedAt: null,
  restockNotifiedAt: null,
  ...over,
});

test("which sets take release alerts: unreleased, or released within 30 days", () => {
  assert.equal(RELEASE_ALERT_WINDOW_DAYS, 30);
  const today = "2026-10-04";
  const sets = [
    { slug: "op-99", releasedOn: "2026-11-21" }, // ahead
    { slug: "op-14", releasedOn: "2026-10-04" }, // today
    { slug: "op-13", releasedOn: "2026-09-04" }, // exactly 30 days ago
    { slug: "op-12", releasedOn: "2026-09-03" }, // 31 days ago: out
    { slug: "tba", releasedOn: null },
  ];
  assert.deepEqual(releaseAlertSets(sets, today).map((s) => s.slug), ["op-99", "op-14", "op-13"]);
  assert.equal(isUnreleased("2026-11-21", today), true);
  assert.equal(isUnreleased("2026-10-04", today), false, "released today is released");
  assert.equal(isUnreleased(null, today), false);
  assert.equal(RELEASE_ALERT_SEND_CAP, 40);
});

test("a set-wide signup is told once singles have a store price in its own market", () => {
  const facts = { pricedCount: { US: 0, AU: 12 }, cards: {} };
  assert.equal(singlesNotices([row()], facts).size, 0);
  const n = singlesNotices([row({ market: "AU" })], facts).get("r1");
  assert.deepEqual(n, { kind: "singles", market: "AU", pricedCount: 12, card: null });
  // Already told → never again.
  assert.equal(singlesNotices([row({ market: "AU", singlesNotifiedAt: new Date() })], facts).size, 0);
});

test("a card-page signup waits for THAT card, not the set", () => {
  const facts = {
    pricedCount: { US: 40 },
    cards: { "100001": { name: "Lightning Bolt (Borderless)", href: "/card/lightning-bolt-borderless", price: { US: null as number | null } } },
  };
  assert.equal(singlesNotices([row({ scope: "100001" })], facts).size, 0);
  facts.cards["100001"].price.US = 129900;
  const n = singlesNotices([row({ scope: "100001" })], facts).get("r1")!;
  assert.deepEqual(n.card, { name: "Lightning Bolt (Borderless)", href: "/card/lightning-bolt-borderless", priceCents: 129900 });
});

test("restock fires only for a product that was sold out everywhere and is open again", () => {
  const prev = new Set(["box"]);
  const t = restockTransitions(
    [
      { key: "box", state: "open" },
      { key: "bundle", state: "soldout" },
      { key: "pack", state: "open" },
      { key: "vault", state: "other" },
    ],
    prev,
  );
  assert.deepEqual(t, { restocked: ["box"], markSoldOut: ["bundle"], clear: ["box"] });
  // A product that simply stays open, or goes stale ("other"), never counts.
  assert.deepEqual(restockTransitions([{ key: "box", state: "other" }], prev), { restocked: [], markSoldOut: [], clear: [] });
  assert.equal(releaseCounterKey("op-99", "US", "5001"), "release-soldout:op-99:US:5001");
});

test("one email per address, and the email states only facts, with an unsubscribe", () => {
  assert.equal(groupByEmail([row(), row({ id: "r2", scope: "100001" }), row({ id: "r3", email: "x@y.z" })]).size, 2);
  const e = buildReleaseEmail("Modern Horizons 3", "/sets/modern-horizons-3", [
    { kind: "singles", market: "US", pricedCount: 3, card: null },
    { kind: "restock", market: "US", products: ["Modern Horizons 3 Play Booster Box"] },
  ]);
  assert.equal(e.subject, "Modern Horizons 3 singles have store prices");
  assert.match(e.lines.join(" "), /3 Modern Horizons 3 singles have a store price in the United States/);
  assert.match(e.lines.join(" "), /Back in stock for pre-order in the United States: Modern Horizons 3 Play Booster Box/);
  const text = renderReleaseEmailText(e, "tok");
  assert.match(text, /Unsubscribe: https:\/\/mtgcompare\.app\/alerts\/release\?token=tok/);
  assert.doesNotMatch(text, /ebay|tcgplayer/i, "no affiliate links in emails");
  const html = renderReleaseEmailHtml(e, "tok", emailShell);
  assert.match(html, /at most two emails/);
  assert.doesNotMatch(`${html} ${text}`, /riftbound|riftcompare|radiance/i);
  assert.equal(releaseStopUrl("a b"), "https://mtgcompare.app/alerts/release?token=a%20b");
  assert.equal(releaseOneClickUrl("tok"), "https://mtgcompare.app/api/alerts/release/unsubscribe?token=tok");
});

test("a card signup's email names the card and its price", () => {
  const e = buildReleaseEmail("Modern Horizons 3", "/sets/modern-horizons-3", [
    { kind: "singles", market: "AU", pricedCount: 9, card: { name: "Lightning Bolt", href: "/card/lightning-bolt", priceCents: 4500 } },
  ]);
  assert.equal(e.subject, "Lightning Bolt is listed");
  assert.match(e.lines[0]!, /Lightning Bolt now has a store price in Australia: A\$45\.00/);
  assert.equal(e.cta.url, "https://mtgcompare.app/card/lightning-bolt");
});

test("signup bodies: a valid address and a real set slug; a card must be an integer id; the honeypot is flagged", () => {
  const ok = parseReleaseBody({ email: " Sam@Example.com ", setSlug: "Modern-Horizons-3", market: "uk", source: "set" });
  assert.deepEqual(ok, { email: "sam@example.com", setSlug: "modern-horizons-3", cardId: null, market: "UK", source: "set", honeypot: false });
  assert.equal(parseReleaseBody({ email: "sam@example.com", setSlug: "modern-horizons-3", cardId: 100001, source: "card" })!.cardId, 100001);
  assert.equal(parseReleaseBody({ email: "sam@example.com", setSlug: "modern-horizons-3", cardId: "100001" })!.cardId, 100001);
  assert.equal(parseReleaseBody({ email: "sam@example.com", setSlug: "modern-horizons-3", source: "bogus" })!.source, null);
  assert.equal(parseReleaseBody({ email: "sam@example.com", setSlug: "modern-horizons-3", website: "http://spam" })!.honeypot, true);
  for (const bad of [null, {}, { email: "no", setSlug: "modern-horizons-3" }, { email: "a@b.co" }, { email: "a@b.co", setSlug: "../x" }, { email: "a@b.co", setSlug: "modern-horizons-3", cardId: -1 }, { email: "a@b.co", setSlug: "modern-horizons-3", cardId: 1.5 }]) {
    assert.equal(parseReleaseBody(bad), null, JSON.stringify(bad));
  }
  assert.deepEqual([...RELEASE_ALERT_SOURCES], ["release-dates", "set", "sealed", "card"]);
});

test("signup API: explicit action only, dark while email is off, unsubscribe is POST-only", () => {
  const api = readFileSync("src/app/api/alerts/release/route.ts", "utf8");
  assert.match(api, /export async function POST/);
  assert.doesNotMatch(api, /export async function GET/);
  assert.match(api, /getEmailStatus\(\)\) !== "on"/);
  assert.match(api, /body\.honeypot/);
  const lib = readFileSync("src/lib/alert-routes.ts", "utf8");
  assert.match(lib, /releaseAlertSets\(\[\{ releasedOn \}\], today\)\.length/, "only a set that takes release alerts");
  assert.match(lib, /card\?\.setId !== set\.id/, "a card scope must be a card of that set");
  const unsub = readFileSync("src/app/api/alerts/release/unsubscribe/route.ts", "utf8");
  assert.match(unsub, /export async function POST/);
  assert.doesNotMatch(unsub, /export async function GET/);
  const page = readFileSync("src/app/alerts/release/page.tsx", "utf8");
  assert.match(page, /index: false/);
  assert.doesNotMatch(page, /fetch\(|deleteMany/, "the page only renders the confirm card");
});

test("the run: generalised over every set in the window, 2 emails per address per set, 40 per run, off until email is on", () => {
  const run = readFileSync("src/lib/release-alerts-run.ts", "utf8");
  assert.match(run, /releaseAlertSets\(/);
  assert.match(run, /RELEASE_ALERT_SEND_CAP/);
  assert.match(run, /ix\.smin\[/, "real stores only (the store-only minimum): never eBay, never TCGplayer's own low");
  assert.match(run, /readSealedListings\(null,/, "the presale restock reads real-store listings only");
  assert.match(run, /if \(!emailOn\) continue;/, "pending until email is configured");
  assert.match(run, /singlesNotifiedAt: at/);
  assert.match(run, /restockNotifiedAt: at/);
  assert.match(run, /isUnreleased\(set\.releasedOn, today\)/, "restocks only while the set is unreleased");
  assert.match(run, /"List-Unsubscribe-Post": "List-Unsubscribe=One-Click"/);
  const script = readFileSync("scripts/alerts.ts", "utf8");
  assert.match(script, /runReleaseAlerts\(\)/);
});

test("the signup shows on the set page, the sealed presale page, unreleased card pages and /release-dates, inside the email gate", () => {
  for (const [file, source] of [
    ["src/app/sets/[slug]/page.tsx", "set"],
    ["src/app/sealed/[slug]/page.tsx", "sealed"],
    ["src/app/card/[slug]/page.tsx", "card"],
    ["src/app/release-dates/page.tsx", "release-dates"],
  ] as const) {
    const src = readFileSync(file, "utf8");
    assert.match(src, new RegExp(`<ReleaseAlertSlot[^>]*source="${source}"`), file);
  }
  const slot = readFileSync("src/components/ReleaseAlertSlot.tsx", "utf8");
  assert.match(slot, /<EmailOnly>/);
  assert.match(readFileSync("src/components/EmailOnly.tsx", "utf8"), /getEmailStatus\(\)/);
  assert.match(readFileSync("src/components/ReleaseAlertSignup.tsx", "utf8"), /mc:alert_email/);
});
