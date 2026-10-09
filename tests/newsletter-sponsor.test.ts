import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sponsorFor, NEWSLETTER_SPONSORS, type NewsletterSponsor } from "../src/lib/newsletter-sponsor";
import { buildDigest, digestMovers, editionKey, type DigestCard, type DigestExtras } from "../src/lib/newsletter";
import { parseNewsletterBody } from "../src/lib/newsletter-signup";

const sp = (over: Partial<NewsletterSponsor> = {}): NewsletterSponsor => ({
  name: "Acme Sleeves", headline: "Sleeves <b>for</b> chase cards", body: "Matte sleeves & top-loaders.",
  url: "https://acme.example/magic", cta: "Shop sleeves", from: "2026-10-01", until: "2026-10-07", ...over,
});

test("no sponsor is booked until the owner adds one", () => {
  assert.deepEqual(NEWSLETTER_SPONSORS, []);
  assert.equal(sponsorFor("US", new Date("2026-10-03T21:00:00Z")), null);
});

test("sponsorFor picks a booking only inside its dates and markets, https only", () => {
  const d = new Date("2026-10-03T21:00:00Z");
  assert.equal(sponsorFor("US", d, [sp()])?.name, "Acme Sleeves");
  assert.equal(sponsorFor("US", new Date("2026-10-08T21:00:00Z"), [sp()]), null, "after `until`");
  assert.equal(sponsorFor("US", new Date("2026-09-30T21:00:00Z"), [sp()]), null, "before `from`");
  assert.equal(sponsorFor("US", d, [sp({ markets: ["AU"] })]), null, "other market");
  assert.equal(sponsorFor("AU", d, [sp({ markets: ["AU"] })])?.name, "Acme Sleeves");
  assert.equal(sponsorFor("US", d, [sp({ url: "http://acme.example" })]), null, "no plain http");
  assert.equal(sponsorFor("US", d, [sp({ imageUrl: "javascript:alert(1)" })]), null, "no non-https image");
});

const card = (name: string, over: Partial<DigestCard> = {}): DigestCard => ({
  id: 1, slug: name.toLowerCase().replace(/\W+/g, "-"), name, number: "141", variant: null, setCode: "2XM",
  marketUsd: 500, change7d: null, high90Usd: null, low: { US: 450 }, ...over,
});
const movers = digestMovers([card("Lightning Bolt", { change7d: 25 }), card("Sol Ring", { id: 2, change7d: -20 })]);

test("the sponsored slot is labelled, escaped, UTM-tagged and rel=sponsored", () => {
  const d = buildDigest(movers, "US", [], { sponsor: sp() })!;
  assert.match(d.inner, /SPONSORED · Acme Sleeves/);
  assert.match(d.inner, /Sleeves &lt;b&gt;for&lt;\/b&gt; chase cards/, "sponsor text is HTML-escaped");
  assert.match(d.inner, /href="https:\/\/acme\.example\/magic\?utm_source=mtgcompare&amp;utm_medium=email&amp;utm_campaign=newsletter-sponsor" rel="sponsored"/);
});

test("with no booking the slot is a labelled 'sponsor this newsletter' line", () => {
  assert.match(buildDigest(movers, "US", [], { sponsor: "house" })!.inner, /Sponsor this newsletter/);
  assert.doesNotMatch(buildDigest(movers, "US", [], {})!.inner, /SPONSORED/);
  assert.match(readFileSync("src/lib/newsletter.ts", "utf8"), /loadDigestExtras\(market, now, \{ sponsor: true \}\)/);
});

test("the extra sections render only from the data they are given", () => {
  const extras: DigestExtras = {
    stats: { priced: 1234, liveStores: 42 },
    popular: [card("Trafalgar Law", { id: 3, low: { US: 1999 } })],
    releases: [{ name: "Modern Horizons 3", date: "2026-10-23", daysAway: 22, href: "/sets/modern-horizons-3" }],
  };
  const inner = buildDigest(movers, "US", [], extras)!.inner;
  for (const s of ["The market at a glance", "1,234 cards with a live price", "42 US stores with stock", "What collectors are searching for", "from US$19.99", "Coming up", "in 22 days"]) {
    assert.ok(inner.includes(s), s);
  }
  const bare = buildDigest(movers, "US", [], {})!.inner;
  for (const s of ["The market at a glance", "What collectors are searching for", "Coming up"]) assert.ok(!bare.includes(s), s);
});

test("the newest Magic cards come from the catalogue's newest set", () => {
  const inner = buildDigest(movers, "US", [card("Portgas.D.Ace", { id: 9 })], {})!.inner;
  assert.match(inner, /Newest Magic cards/);
  assert.match(inner, /Portgas\.D\.Ace/);
  assert.match(inner, /utm_source=newsletter/);
  assert.match(inner, /Search eBay/, "the eBay link is an affiliate search, never an API call");
});

test("a quiet week still sends nothing, extras or not", () => {
  assert.equal(buildDigest({ spiking: [], plummeting: [], value: [] }, "US", [], { sponsor: "house", stats: { priced: 10, liveStores: 1 } }), null);
});

test("editionKey: one edition per ISO week, so a re-run never double-sends", () => {
  // Friday 2026-10-02 21:00 UTC is ISO week 40 of 2026; so is the rest of that week.
  assert.equal(editionKey(new Date("2026-10-02T21:00:00Z")), "2026-W40");
  assert.equal(editionKey(new Date("2026-10-02T21:59:00Z")), editionKey(new Date("2026-10-02T21:00:00Z")));
  assert.equal(editionKey(new Date("2026-10-04T23:59:00Z")), "2026-W40", "Sunday still week 40");
  assert.equal(editionKey(new Date("2026-10-05T00:00:00Z")), "2026-W41", "Monday starts the next");
  // The ISO year boundary: Thursday decides it.
  assert.equal(editionKey(new Date("2027-01-01T12:00:00Z")), "2026-W53");
  assert.equal(editionKey(new Date("2024-12-30T12:00:00Z")), "2025-W01");
});

test("the run only marks a subscriber after a successful send, and skips an already-sent edition", () => {
  const src = readFileSync("src/lib/newsletter.ts", "utf8");
  assert.match(src, /due = subs\.filter\(\(s\) => s\.lastEditionKey !== edition\)/);
  assert.match(src, /if \(sent\) \{\s*summary\.emails\+\+;\s*await prisma\.newsletterSubscriber\.update\(\{ where: \{ id: sub\.id \}, data: \{ lastEditionKey: edition \} \}\)/);
  assert.match(src, /if \(!isEmailEnabled\(\)\) return \{ \.\.\.summary, skipped: "email-off" \}/);
});

test("signup bodies: a valid address, a known source, a market; anything else is refused", () => {
  assert.deepEqual(parseNewsletterBody({ email: " Sam@Example.COM ", market: "au", source: "movers" }), { email: "sam@example.com", market: "AU", source: "movers" });
  assert.equal(parseNewsletterBody({ email: "sam@example.com", source: "nonsense" })!.source, null);
  assert.equal(parseNewsletterBody({ email: "sam@example.com", market: "ZZ" })!.market, "US");
  for (const bad of [null, "x", {}, { email: "nope" }, { email: "a@b" }, { email: `${"a".repeat(250)}@b.co` }]) assert.equal(parseNewsletterBody(bad), null, JSON.stringify(bad));
});

test("the signup route sends nothing at request time and is dark while email is off", () => {
  const route = readFileSync("src/app/api/newsletter/route.ts", "utf8");
  assert.doesNotMatch(route, /send[A-Z]\w+\(/, "the welcome goes out from the hourly outbox");
  assert.match(route, /getEmailStatus\(\)\) !== "on"/);
  const unsub = readFileSync("src/app/api/newsletter/unsubscribe/route.ts", "utf8");
  assert.match(unsub, /export async function POST/);
  assert.doesNotMatch(unsub, /deleteMany/, "the route holds no query; the lib does");
  const signup = readFileSync("src/lib/newsletter-signup.ts", "utf8");
  assert.doesNotMatch(signup, /from "\.\/email"/, "the signup half imports no sending code");
});
