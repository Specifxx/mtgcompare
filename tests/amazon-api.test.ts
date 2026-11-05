// Amazon's Creators API prices (2026-11-05): ASINs found by the daily import, prices fetched by the build, shown 24 hours, never committed.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { amazonTitleMatches, amazonQuery } from "../scripts/amazon-asins";
import { credentialsFor, itemsOf, pickListing, tokenEndpoint, type Item } from "../src/lib/amazon-creators";
import { amazonUrl } from "../src/lib/amazon";
import { identify } from "../src/lib/sealed-title";

test("the token endpoint follows the credential version, else the store's home region", () => {
  assert.equal(tokenEndpoint("3.1", "au"), "https://api.amazon.com/auth/o2/token");
  assert.equal(tokenEndpoint("3.3", "us"), "https://api.amazon.co.jp/auth/o2/token");
  assert.equal(tokenEndpoint(undefined, "uk"), "https://api.amazon.co.uk/auth/o2/token");
  assert.equal(tokenEndpoint(undefined, "au"), "https://api.amazon.co.jp/auth/o2/token");
});

test("one credential serves every store: the AU-named variables are the default, a region's own win", () => {
  const au = { AMAZON_CREATORS_AU_CLIENT_ID: " a ", AMAZON_CREATORS_AU_CLIENT_SECRET: "b", AMAZON_CREATORS_AU_VERSION: "3.3" };
  assert.equal(credentialsFor("us", {}), null);
  assert.deepEqual(credentialsFor("au", au), { id: "a", secret: "b", version: "3.3" });
  assert.deepEqual(credentialsFor("us", au), { id: "a", secret: "b", version: "3.3" });
  assert.deepEqual(credentialsFor("us", { ...au, AMAZON_CREATORS_US_CLIENT_ID: "u", AMAZON_CREATORS_US_CLIENT_SECRET: "v" }), { id: "u", secret: "v", version: "3.1" });
});

const listing = (amount: number, o: Partial<{ cond: string; avail: string; cur: string; box: boolean; seller: string }> = {}) => ({
  price: { money: { amount, currency: o.cur ?? "USD" } },
  condition: { value: o.cond ?? "New" },
  availability: { type: o.avail ?? "IN_STOCK" },
  isBuyBoxWinner: o.box,
  merchantInfo: { name: o.seller ?? "Amazon.com" },
});
const item = (...listings: ReturnType<typeof listing>[]): Item => ({ asin: "B000000001", offersV2: { listings } });

test("the shown price is the new, in-stock buy box in the store's currency, else the cheapest such listing", () => {
  assert.deepEqual(pickListing(item(listing(130), listing(125, { box: true })), "USD"), { amount: 125, seller: undefined });
  assert.deepEqual(pickListing(item(listing(130, { seller: "Card Shop" }), listing(128)), "USD"), { amount: 128, seller: undefined });
  assert.equal(pickListing(item(listing(10, { cond: "Used" })), "USD"), null, "used is never shown");
  assert.equal(pickListing(item(listing(10, { avail: "OUT_OF_STOCK" })), "USD"), null);
  assert.equal(pickListing(item(listing(10, { cur: "AUD" })), "USD"), null, "another currency is another store");
  assert.equal(pickListing({ asin: "B000000001", offersV2: null }, "USD"), null);
  assert.equal(itemsOf({ itemResults: { items: [item()] } }).length, 1);
});

test("an Amazon title matches a product only as the same sealed product (the classifier's groupKey)", () => {
  const id = identify("Magic: The Gathering Bloomburrow Play Booster Box");
  assert.ok(typeof id === "object", "the fixture title classifies");
  const p = { groupKey: (id as { groupKey: string }).groupKey };
  assert.ok(amazonTitleMatches(p, "MTG Bloomburrow Play Booster Box | 36 Packs"));
  assert.ok(!amazonTitleMatches(p, "Magic: The Gathering Bloomburrow Collector Booster Box"), "another product");
  assert.ok(!amazonTitleMatches(p, "Magic: The Gathering Bloomburrow Play Booster Pack"), "a pack is not a box");
  assert.ok(!amazonTitleMatches(p, "Ultra Pro Bloomburrow Deck Box"), "an accessory");
  assert.ok(!amazonTitleMatches(p, "Magic: The Gathering Bloomburrow Play Booster Box (Japanese)"), "another language");
  assert.equal(amazonQuery("Bloomburrow Play Booster Box - LIMIT 2 PER CUSTOMER"), "MTG Bloomburrow Play Booster Box");
});

test("the region's own ASIN links to its own Amazon with the tag and the sub id", () => {
  assert.equal(amazonUrl("x", { region: "us", placement: "amazon-table", asin: "B0ABCDEFGH" }), "https://www.amazon.com/dp/B0ABCDEFGH?tag=riftcompare-20&ascsubtag=mtg-us-amazon-table");
  assert.match(amazonUrl("x", { region: "us", placement: "amazon-table", asin: "bad" }), /amazon\.com\/s\?/, "a bad ASIN is a search");
});

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]));

test("the Creators API client stays script-side; only the product page reads live Amazon prices; prices are never committed", () => {
  for (const f of [...walk("src/app"), ...walk("src/components"), ...walk("src/lib")].filter((f) => /\.tsx?$/.test(f))) {
    const s = readFileSync(f, "utf8");
    if (f !== "src/lib/amazon-creators.ts") assert.ok(!/amazon-creators/.test(s), `${f} imports the Creators API client`);
    if (/from "@\/lib\/amazon-live"/.test(s) && !/import type \{[^}]*\} from "@\/lib\/amazon-live"/.test(s) && !/import \{ AMAZON_CLOCK, type AmazonLive \}/.test(s))
      assert.equal(f, "src/app/[region]/p/[slug]/page.tsx", `${f} reads live Amazon prices`);
    assert.ok(!/AMAZON_CREATORS/.test(s) || f === "src/lib/amazon-creators.ts", `${f} names the credentials`);
  }
  assert.match(readFileSync(".gitignore", "utf8"), /^data\/amazon-live\/$/m);
  assert.match(JSON.parse(readFileSync("package.json", "utf8")).scripts.build, /\(tsx scripts\/fetch-amazon-prices\.ts \|\| true\) && next build/);
  assert.match(readFileSync("next.config.js", "utf8"), /data\/amazon-live\/\*\.json/);
  assert.match(readFileSync(".github/workflows/sealed-import.yml", "utf8"), /scripts\/amazon-asins\.ts/);
  assert.match(readFileSync("scripts/publish-public-data.sh", "utf8"), /AMAZON_DIR="data\/amazon"/);
});
