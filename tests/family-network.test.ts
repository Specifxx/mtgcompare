// Same file in every Compare Empire repo, beside src/lib/family-network.ts (see its header).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FAMILY_SITES,
  buildFeed,
  clusterSisters,
  familyMoney,
  footerSisters,
  modelKey,
  pickTiles,
  sameProduct,
  tileNote,
  toFamilyRegion,
  validCluster,
  validFeed,
  type FamilyFeed,
  type FamilyItem,
} from "../src/lib/family-network";

const NOW = Date.parse("2026-11-02T12:00:00Z");

const deal = (over: Partial<FamilyItem> = {}): FamilyItem => ({
  kind: "deal",
  cluster: "cards",
  region: "US",
  title: "OP-13 Booster Box",
  url: "https://opcompare.app/sealed/op-13-booster-box",
  cents: 9999,
  currency: "USD",
  store: "Some Store",
  refCents: 12999,
  refLabel: "TCGplayer market price",
  savingPct: 23,
  ...over,
});

const feed = (site: FamilyFeed["site"], items: FamilyItem[], at = "2026-11-02T06:00:00Z"): FamilyFeed => ({ v: 1, site, generatedAt: at, links: {}, items });

test("KaeYoung is never in the network, and every label is region-neutral", () => {
  assert.ok(!FAMILY_SITES.some((s) => /kaeyoung/i.test(s.url + s.name)));
  for (const s of FAMILY_SITES) {
    assert.doesNotMatch(s.label, /\b(Australia|Australian|US|USA|American|UK|British|Canada|Canadian|New Zealand|European|Singapore)\b/, s.label);
    assert.ok(s.feed.startsWith("https://raw.githubusercontent.com/"), s.feed);
  }
});

test("clusters: cards, hobby (Gundam's Gunpla too) and tech", () => {
  assert.deepEqual(clusterSisters("figure", "hobby").map((s) => s.id), ["gundam", "wargame"]);
  assert.deepEqual(clusterSisters("empire", "tech").map((s) => s.id), ["cam"]);
  assert.equal(clusterSisters("rift", "cards").length, 7);
  assert.deepEqual(footerSisters("gundam").map((s) => s.id), ["rift", "op", "dex", "mtg", "lorcana", "ygo", "cyberpunk", "wargame", "figure"]);
  assert.ok(!footerSisters("cam").some((s) => s.clusters.includes("cards")));
});

test("validFeed: wrong site, stale, or bad items are dropped", () => {
  assert.equal(validFeed(feed("op", [deal()]), "mtg", NOW), null);
  assert.equal(validFeed(feed("op", [deal()], "2026-10-25T00:00:00Z"), "op", NOW), null);
  const f = validFeed(
    feed("op", [
      deal(),
      deal({ url: "https://evil.example/x" }),
      deal({ currency: "AUD" }),
      deal({ refCents: 9000 }),
      deal({ cluster: "tech" }),
      deal({ savingPct: 99 }),
    ]),
    "op",
    NOW,
  );
  assert.ok(f);
  // The saving is recomputed from the two prices, never taken from the file.
  assert.equal(f.items.length, 2);
  assert.equal(f.items[1].savingPct, 23);
});

test("buildFeed caps each group and ranks deals by saving", () => {
  const items = Array.from({ length: 10 }, (_, n) => deal({ url: `https://opcompare.app/sealed/x${n}`, refCents: 10000 + n * 500 }));
  const f = buildFeed("op", items, {}, new Date(NOW));
  assert.equal(f.items.length, 6);
  assert.ok(f.items[0].savingPct! >= f.items[5].savingPct!);
  assert.ok(validFeed(f, "op", NOW));
});

test("pickTiles: one per sister, the visitor's region first, then the US, then the other kind", () => {
  const feeds = [
    feed("op", [deal({ region: "US" }), deal({ region: "AU", currency: "AUD", cents: 15000, refCents: 19000, url: "https://opcompare.app/au/x" })]),
    feed("mtg", [deal({ url: "https://mtgcompare.app/us/p/x", refLabel: "median store price" })]),
    feed("dex", [{ kind: "preorder", cluster: "cards", region: "AU", title: "Box", url: "https://dexcompare.app/au/p/box", cents: 20000, currency: "AUD", store: "S", releaseDate: "2026-11-14" }]),
    feed("figure", [deal({ cluster: "hobby", url: "https://figurecompare.com/figure/x" })]),
  ];
  const t = pickTiles(feeds, { self: "rift", cluster: "cards", kind: "deal", region: "AU" });
  assert.deepEqual(t.map((x) => x.site.id).sort(), ["dex", "mtg", "op"]);
  assert.equal(t.find((x) => x.site.id === "op")!.item.region, "AU");
  assert.equal(t.find((x) => x.site.id === "mtg")!.item.region, "US");
  assert.equal(t[t.length - 1].site.id, "dex");
  assert.equal(pickTiles(feeds, { self: "op", cluster: "cards", kind: "deal", region: "US" }).some((x) => x.site.id === "op"), false);
});

test("validCluster re-checks every feed and ignores its own", () => {
  const c = { v: 1, site: "gundam", fetchedAt: "2026-11-02T06:00:00Z", feeds: [feed("op", [deal()]), feed("gundam", []), feed("op", [deal()], "2026-01-01T00:00:00Z")] };
  assert.equal(validCluster(c, "gundam", NOW).length, 1);
  assert.deepEqual(validCluster(null, "gundam", NOW), []);
});

test("money and notes", () => {
  assert.equal(familyMoney(12999, "USD"), "US$129.99");
  assert.equal(familyMoney(21900, "AUD"), "A$219");
  assert.equal(familyMoney(8450, "GBP"), "£84.50");
  assert.equal(tileNote(validFeed(feed("op", [deal()]), "op", NOW)!.items[0]), "23% under the TCGplayer market price");
  assert.equal(toFamilyRegion("gb"), "UK");
  assert.equal(toFamilyRegion("xx"), "US");
});

test("hand-offs: same model only, never a kit, never ambiguous", () => {
  const cam = [
    { name: "Canon EOS R6 Mark III", url: "https://www.camcompare.app/cameras/canon-eos-r6-mark-iii" },
    { name: "Nikon Z8", url: "https://www.camcompare.app/cameras/nikon-z8" },
    { name: "Sony a7 IV", url: "https://www.camcompare.app/cameras/sony-a7-iv" },
    { name: "Sony a7 IV", url: "https://www.camcompare.app/cameras/sony-a7-iv-dup" },
  ];
  assert.equal(sameProduct("Canon EOS R6 Mark III Body", cam)?.url, cam[0].url);
  assert.equal(sameProduct("Nikon Z8 Mirrorless Camera Body", cam)?.url, cam[1].url);
  assert.equal(sameProduct("Nikon Z8 Body with 24-120mm Lens Kit", cam), null);
  assert.equal(sameProduct("Canon EOS R6 Mark II Body", cam), null);
  assert.equal(sameProduct("Sony a7 IV Body", cam), null, "two candidates is no match");
  assert.equal(modelKey("DJI Osmo Pocket 4 Creator Combo"), null);
});

test("pickTiles: several per sister when asked, preferred category first", () => {
  const items = [
    deal({ cluster: "tech", url: "https://compareempire.com/laptops/a", category: "laptops", refCents: 20000 }),
    deal({ cluster: "tech", url: "https://compareempire.com/cameras/b", category: "cameras" }),
    deal({ cluster: "tech", url: "https://compareempire.com/cameras/c", category: "cameras", refCents: 11000 }),
  ];
  const t = pickTiles([feed("empire", items)], { self: "cam", cluster: "tech", kind: "deal", region: "US", perSite: 3, prefer: "cameras" });
  assert.equal(t.length, 3);
  assert.deepEqual(t.map((x) => x.item.category), ["cameras", "cameras", "laptops"]);
});
