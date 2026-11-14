// The product page's store rows (src/lib/data.ts productPage, 2026-11-14; ported from DexCompare, where it was found). The read took
// 80 offers with no order: on the 48 product pages more than 80 stores list (146 at most) it kept 80 arbitrary stores, so a page could
// lose its cheapest in-stock store and state a dearer best price than the list card beside it. Pinned on the committed data files:
// every listing is read, and the order comes before the cap.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.PUBLIC_DATA_MODE = "files";

interface Offer { productId: string; market: string; store: string; priceCents: number; inStock: boolean }
const offers = JSON.parse(readFileSync("data/public/offers.json", "utf8")) as Offer[];
const products = JSON.parse(readFileSync("data/public/products.json", "utf8")) as { id: string; slug: string }[];
const slugOf = new Map(products.map((p) => [p.id, p.slug]));
const groups = new Map<string, Offer[]>();
for (const o of offers) {
  const k = `${o.productId}|${o.market}`;
  groups.set(k, [...(groups.get(k) ?? []), o]);
}

test("the most-listed product pages show every store, the cheapest in-stock one among them", async () => {
  const { productPage, PRODUCT_OFFERS_TAKE } = await import("../src/lib/data");
  const big = [...groups].filter(([, g]) => g.length > 80);
  assert.ok(big.length > 0, "the data files have products more than 80 stores list");
  for (const [k, all] of big) {
    const [productId, market] = k.split("|");
    const slug = slugOf.get(productId)!;
    const page = await productPage(slug, market as "US");
    assert.ok(page, `${slug} loads`);
    // Every listing is a row; past the cap (no product today) the dearest sold-out rows are the ones left out.
    assert.equal(page!.offers.length, Math.min(all.length, PRODUCT_OFFERS_TAKE), `${market} ${slug}: every listing is a row`);
    const open = all.filter((o) => o.inStock);
    if (!open.length) continue;
    const low = Math.min(...open.map((o) => o.priceCents));
    const shown = Math.min(...page!.offers.filter((o) => o.inStock).map((o) => o.priceCents));
    assert.equal(shown, low, `${market} ${slug}: the cheapest in-stock listing is on the page`);
  }
});

test("both capped offer reads order their rows before the cap: in stock first, cheapest first", () => {
  const src = readFileSync("src/lib/data.ts", "utf8");
  const reads = src.match(/offers: \{\s*where: \{ market \},[\s\S]*?select: offerSelect/g) ?? [];
  assert.equal(reads.length, 2, "productPage and setOfferGroups");
  for (const r of reads) {
    assert.match(r, /orderBy: \[\{ inStock: "desc" \}, \{ priceCents: "asc" \}, \{ store: "asc" \}\]/);
    assert.ok(r.indexOf("orderBy") < r.indexOf("take:"), "ordered, then capped");
  }
});
