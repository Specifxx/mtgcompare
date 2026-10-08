// The Neon schema holds PRIVATE state only (addendum 9; contract 2.2). Owner WP01a. Reads prisma/schema.prisma as text.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.TEST_ROOT ?? path.resolve(__dirname, "..");
const schema = fs.readFileSync(path.join(ROOT, "prisma/schema.prisma"), "utf8");
const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map((m) => ({ name: m[1]!, body: m[2]! }));
const fields = (body: string) => body.split("\n").map((l) => l.replace(/\/\/.*$/, "").trim()).filter((l) => l && !l.startsWith("@@") && !l.startsWith("//"));
const PUBLIC = ["Set", "ScrySet", "Oracle", "Card", "CardPrice", "Unit", "Offer", "StoreRun", "Sealed", "EbayCheck", "EbayListing", "EbayGradedListing"];
const EXPECTED = ["User", "Meta", "PriceReport", "StoreSuggestion", "Feedback", "ContactMessage", "ClickEvent", "PremiumClick", "PriceAlert", "AlertMute", "SealedWatch", "DeckWatch", "Notification", "CollectionCard", "Counter", "NewsletterSubscriber", "SetReleaseAlert", "PublishedDeck", "RisingSnapshot", "SupportTicket", "ImportRun", "EbayTrack", "EbayBest", "EbayPanel", "EbayBanner", "EbayLedger", "CardStat", "DemandDay"];

test("28 models, exactly the private ones; none of the public catalogue tables is back", () => {
  assert.deepEqual(models.map((m) => m.name).sort(), [...EXPECTED].sort());
  for (const p of PUBLIC) assert.ok(!models.some((m) => m.name === p), `${p} must be a published file, not a table`);
  assert.match(schema, /28 models/);
});
test("every relation points at User: a product is a plain integer, never a foreign key", () => {
  for (const m of models) for (const f of fields(m.body)) if (/@relation\(/.test(f)) assert.match(f, /^\w+\s+User\??\s/, `${m.name}: ${f}`);
  const field = (model: string, name: string): string => fields(models.find((m) => m.name === model)!.body).find((f) => f.startsWith(`${name} `)) ?? "";
  assert.match(field("PriceAlert", "cardId"), /^cardId\s+Int\b/); assert.match(field("SealedWatch", "sealedId"), /^sealedId\s+Int\b/); assert.match(field("CollectionCard", "cardId"), /^cardId\s+Int\b/);
  assert.ok(!/card\s+Card|sealed\s+Sealed/.test(schema), "no field typed Card or Sealed");
});
test("the explicit unit and the denormalised set: PriceAlert keeps finish in its key, CollectionCard carries setId with its index", () => {
  const pa = models.find((m) => m.name === "PriceAlert")!.body; assert.match(pa, /finish\s+Int\s+@default\(0\)\s+@db\.SmallInt/); assert.match(pa, /@@unique\(\[email, cardId, finish, market\]\)/);
  const cc = models.find((m) => m.name === "CollectionCard")!.body; assert.match(cc, /setId\s+Int\?/); assert.match(cc, /@@index\(\[userId, setId\]\)/); assert.match(cc, /@@unique\(\[userId, cardId, condition, isFoil\]\)/);
});
test("eBay data and the demand analytics are here and nowhere else; the counters are the private paid signal", () => {
  for (const n of ["EbayTrack", "EbayBest", "EbayPanel", "EbayBanner", "EbayLedger", "CardStat", "DemandDay"]) assert.ok(models.some((m) => m.name === n), n);
  assert.match(models.find((m) => m.name === "CardStat")!.body, /searchCount\s+Int/); assert.match(models.find((m) => m.name === "DemandDay")!.body, /data\s+Json/);
  assert.match(schema, /SAMPLED/, "the counter's header says it is sampled and batched (tests/plane-neon-path.test.ts pins the numbers)");
});
test("one database, one URL: no directUrl, no second datasource; Meta holds no import state", () => {
  assert.equal([...schema.matchAll(/^datasource /gm)].length, 1); assert.match(schema, /url\s+=\s+env\("DATABASE_URL"\)/); assert.ok(!/directUrl/.test(schema));
  assert.ok(!/historyRef|tcgcsv\.lastUpdated|catalog\.lastGroups/.test(models.find((m) => m.name === "Meta")!.body));
});
