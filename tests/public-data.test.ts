// The public data files (src/lib/public-data/): the exporter's output read back through the store and the engine answers like the
// database would; the router serves the files in "files" mode and falls back to Neon when they cannot answer; DC2 is the database.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildPublicFiles, seenByStore, type Tables } from "../src/lib/public-data/export";
import { publicDataSource, resetPublicData } from "../src/lib/public-data/store";
import { runPublicQuery } from "../src/lib/public-data/engine";
import { routeQuery, routeRaw } from "../src/lib/public-data/route";
import { publicDataMode } from "../src/lib/public-data/mode";
import { stableId } from "../src/lib/public-data/format";
import { databaseUrl } from "../src/lib/db";

const T0 = new Date("2026-10-15T20:47:31.250Z");
const T1 = new Date("2026-10-14T08:47:02.000Z");

const tables: Tables = {
  Product: [
    { id: "p1", groupKey: "sv8|booster-box", slug: "surging-sparks-booster-box", name: "Surging Sparks Booster Box", productType: "Booster Box", setCode: "sv8", imageUrl: null, createdAt: T1 },
    { id: "p2", groupKey: "sv8|etb", slug: "surging-sparks-elite-trainer-box", name: "Surging Sparks Elite Trainer Box", productType: "Elite Trainer Box", setCode: "sv8", imageUrl: "https://x/img.jpg", createdAt: T1 },
  ],
  Offer: [
    { id: "o1", productId: "p1", store: "pokebox", market: "AU", title: "SSP Box", url: "https://a/1", priceCents: 33500, inStock: true, imageUrl: null, lastSeen: T0 },
    { id: "o2", productId: "p1", store: "cherry", market: "AU", title: "SSP Box", url: "https://b/1", priceCents: 34900, inStock: false, imageUrl: null, lastSeen: T0 },
    { id: "o3", productId: "p2", store: "pokebox", market: "AU", title: "SSP ETB", url: "https://a/2", priceCents: 9900, inStock: true, imageUrl: null, lastSeen: T0 },
    // A store whose last read failed: its row keeps an older lastSeen.
    { id: "o4", productId: "p2", store: "cherry", market: "AU", title: "SSP ETB", url: "https://b/2", priceCents: 9500, inStock: true, imageUrl: null, lastSeen: T1 },
  ],
  ProductStat: [
    { productId: "p1", market: "AU", lowestPriceCents: 33500, inStockStores: 1, listedStores: 2, marketplaceOpen: false, medianOpenCents: null },
    { productId: "p2", market: "AU", lowestPriceCents: 9500, inStockStores: 2, listedStores: 2, marketplaceOpen: false, medianOpenCents: 9700 },
  ],
  StoreStat: [{ store: "pokebox", market: "AU", listed: 2, inStock: 2, lastOkAt: T0, lastError: null, dormant: false, updatedAt: T0 }],
  EbayListing: [],
};

function writeFixture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dex-pd-"));
  for (const [name, body] of buildPublicFiles(tables, { generatedAt: T0, source: "test" })) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}

test("each store's common lastSeen is kept exactly, and only a different one is stored on the row", () => {
  assert.deepEqual(seenByStore(tables.Offer), { cherry: T0.toISOString(), pokebox: T0.toISOString() });
  const files = buildPublicFiles(tables, { generatedAt: T0, source: "test" });
  const offers = files.get("offers.json")!;
  assert.equal((offers.match(/lastSeen/g) ?? []).length, 1, "only the row from the failed read carries its own lastSeen");
  assert.doesNotMatch(offers, /"id":/, "offer ids churn every import, so they are derived on load instead");
  assert.equal(offers.split("\n").length, 7, "one row per line");
});

test("the files read back as the database's rows, through the engine", () => {
  process.env.PUBLIC_DATA_DIR = writeFixture();
  resetPublicData();
  try {
    const src = publicDataSource();
    const page = runPublicQuery(src, "Product", "findUnique", {
      where: { slug: "surging-sparks-elite-trainer-box" },
      select: { name: true, offers: { where: { market: "AU" }, select: { store: true, priceCents: true, lastSeen: true } } },
    }) as { name: string; offers: { store: string; priceCents: number; lastSeen: Date }[] };
    assert.equal(page.name, "Surging Sparks Elite Trainer Box");
    assert.deepEqual(
      page.offers.map((o) => [o.store, o.priceCents, o.lastSeen.toISOString()]),
      [
        ["cherry", 9500, T1.toISOString()],
        ["pokebox", 9900, T0.toISOString()],
      ],
    );
    const tcg = runPublicQuery(src, "Offer", "findUnique", { where: { productId_store: { productId: "p1", store: "cherry" } }, select: { id: true, priceCents: true } });
    assert.deepEqual(tcg, { id: stableId("Offer", { productId: "p1", store: "cherry" }), priceCents: 34900 });
    assert.equal(runPublicQuery(src, "ProductStat", "count", { where: { market: "AU", OR: [{ inStockStores: { gt: 0 } }, { marketplaceOpen: true }] } }), 2);
  } finally {
    delete process.env.PUBLIC_DATA_DIR;
    resetPublicData();
  }
});

test("files mode is the default; scripts always use the database", () => {
  assert.equal(publicDataMode({}), "files");
  assert.equal(publicDataMode({ PUBLIC_DATA_MODE: "db" }), "db");
  assert.equal(publicDataMode({ PUBLIC_DATA_MODE: "fallback" }), "fallback");
  assert.equal(publicDataMode({ DEXCOMPARE_SCRIPT: "1" }), "db", "the importers write and read Neon: the files are made from it");
});

test("with no files, a read goes to the database as before; with files, it never does", async () => {
  const saved = process.env.PUBLIC_DATA_MODE;
  process.env.PUBLIC_DATA_MODE = "files";
  process.env.PUBLIC_DATA_DIR = path.join(os.tmpdir(), "dex-pd-missing");
  resetPublicData();
  try {
    let asked = 0;
    const neon = async () => {
      asked++;
      return 42;
    };
    assert.equal(await routeQuery("ProductStat", "count", {}, neon), 42, "missing files: the database answers");
    assert.equal(await routeRaw(() => 1, neon), 1, "a raw read's file implementation needs no meta file");
    process.env.PUBLIC_DATA_DIR = writeFixture();
    resetPublicData();
    assert.equal(await routeQuery("ProductStat", "count", { where: { market: "AU" } }, neon), 2);
    assert.equal(await routeQuery("EbayCallDay", "findUnique", { where: { day: "x" } }, neon), 42, "EbayCallDay is the importer's own: never public");
    assert.equal(asked, 2);
  } finally {
    if (saved === undefined) delete process.env.PUBLIC_DATA_MODE;
    else process.env.PUBLIC_DATA_MODE = saved;
    delete process.env.PUBLIC_DATA_DIR;
    resetPublicData();
  }
});

test("the database is DC2, with DATABASE_URL only while DC2 is unset", () => {
  assert.equal(databaseUrl({ DC2: "postgres://dc2", DATABASE_URL: "postgres://old" }), "postgres://dc2");
  assert.equal(databaseUrl({ DATABASE_URL: "postgres://old" }), "postgres://old");
  assert.equal(databaseUrl({ DC2: " ", DATABASE_URL: "" }), undefined);
});
