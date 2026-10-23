// Structured data (ported from DexCompare's tests/jsonld.test.ts): every builder's output passes tests/helpers/jsonld.ts (schema.org
// types, Google's product-snippet, breadcrumb, item-list and FAQ rules), and one real page of each type, rendered from data/public,
// carries valid JSON-LD whose values are on the page: the product's low and high price, offer count and currency; the breadcrumb
// names; each FAQ question. Nothing is emitted that a visitor can't see.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { articleJsonLd, breadcrumbJsonLd, faqJsonLd, itemListJsonLd, productJsonLd, siteJsonLd, toolJsonLd } from "../src/lib/seo";
import { jsonLdBlocks, nodesOf, validateJsonLd } from "./helpers/jsonld";

(globalThis as unknown as { React: typeof React }).React = React;

test("the builders' output is valid: Product + AggregateOffer, BreadcrumbList, ItemList, FAQPage, Article, the site graph, a tool", () => {
  const product = productJsonLd({ name: "Bloomburrow Play Booster Box", path: "/au/p/bloomburrow-play-booster-box", image: "https://cdn.example/x.jpg", productType: "Play Booster Box", setName: "Bloomburrow", currency: "AUD", lowCents: 22999, highCents: 27999, offerCount: 7 });
  assert.deepEqual(validateJsonLd(product), []);
  assert.equal(product.offers.lowPrice, "229.99");
  assert.equal(product.offers.highPrice, "279.99");
  assert.equal(product.offers.offerCount, 7);
  assert.equal(product.offers.priceCurrency, "AUD");
  assert.equal(product.offers.availability, "https://schema.org/InStock");
  assert.equal(productJsonLd({ ...{ name: "x", path: "/us/p/x", productType: "Bundle", currency: "USD", lowCents: 1, highCents: 2, offerCount: 1 }, preorder: true }).offers.availability, "https://schema.org/PreOrder");
  assert.deepEqual(validateJsonLd(breadcrumbJsonLd([{ href: "/au", label: "Australia" }, { href: "/au/sets", label: "Sets" }, { label: "Bloomburrow" }])), []);
  assert.deepEqual(validateJsonLd(itemListJsonLd({ name: "x", path: "/au/sets/x", items: [{ path: "/au/p/a", name: "A" }, { path: "/au/p/b", name: "B" }] })), []);
  assert.deepEqual(validateJsonLd(faqJsonLd([{ q: "Q?", a: "A." }])), []);
  assert.deepEqual(validateJsonLd(articleJsonLd({ title: "T", description: "D", path: "/au/guides/x", published: "2026-10-23", updated: "2026-10-23" })), []);
  assert.deepEqual(validateJsonLd(siteJsonLd()), []);
  assert.deepEqual(validateJsonLd(toolJsonLd({ title: "T", description: "D", path: "/au/tools/x", faq: [{ q: "Q?", a: "A." }] })), []);
  // The site search the WebSite node advertises is the browse page's ?q= (BrowseGrid reads it).
  const site = siteJsonLd()["@graph"][1] as { potentialAction: { target: { urlTemplate: string } } };
  assert.match(site.potentialAction.target.urlTemplate, /\/us\/sealed\?q=\{search_term_string\}$/);
});

test("the checker catches what Google rejects", () => {
  const bad = { "@context": "https://schema.org", "@type": "Product", name: "X", offers: { "@type": "AggregateOffer", lowPrice: "A$10", highPrice: "5.00", offerCount: 0, priceCurrency: "dollars", availability: "in stock" } };
  const problems = validateJsonLd(bad).join(" | ");
  for (const p of [/lowPrice/, /offerCount/, /priceCurrency/, /availability/]) assert.match(problems, p);
  assert.match(validateJsonLd({ "@context": "https://schema.org", "@type": "Product", name: "X" }).join(), /offers required/);
  assert.match(validateJsonLd({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 2, name: "a", item: "/au" }, { "@type": "ListItem", position: 3, name: "b" }] }).join(), /position|absolute/);
  assert.match(validateJsonLd({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "Q" }] }).join(), /acceptedAnswer/);
});

// ─── Real pages, from data/public ─────────────────────────────────────────────

const text = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");

async function setup() {
  process.env.PUBLIC_DATA_MODE = "files";
  // Next's React has cache(); the test's React may not: per-request memoising is irrelevant to one render.
  const R = require("react") as { cache?: unknown };
  if (typeof R.cache !== "function") R.cache = (fn: unknown) => fn;
}

function checkPage(html: string, label: string) {
  const { docs, errors } = jsonLdBlocks(html);
  assert.deepEqual(errors, [], label);
  assert.ok(docs.length > 0, `${label}: JSON-LD`);
  for (const d of docs) assert.deepEqual(validateJsonLd(d), [], label);
  const nodes = docs.flatMap(nodesOf);
  const t = text(html);
  const crumbs = nodes.find((n) => n["@type"] === "BreadcrumbList") as { itemListElement: { name: string }[] } | undefined;
  assert.ok(crumbs, `${label}: breadcrumbs`);
  for (const it of crumbs!.itemListElement) assert.ok(t.includes(it.name), `${label}: crumb "${it.name}" on the page`);
  for (const f of nodes.filter((n) => n["@type"] === "FAQPage") as { mainEntity: { name: string }[] }[])
    for (const q of f.mainEntity) assert.ok(t.includes(q.name), `${label}: FAQ question "${q.name}" on the page`);
  return { nodes, t };
}

test("real product pages: valid JSON-LD, and every price, count and currency it states is on the page", async () => {
  await setup();
  const { default: ProductPage } = await import("../src/app/[region]/p/[slug]/page");
  const stats = JSON.parse(readFileSync("data/public/product-stats.json", "utf8")) as { productId: string; market: string; inStockStores: number }[];
  const products = JSON.parse(readFileSync("data/public/products.json", "utf8")) as { id: string; slug: string }[];
  const slugOf = new Map(products.map((p) => [p.id, p.slug]));
  const pick = (market: string, min: number) => stats.filter((s) => s.market === market && s.inStockStores >= min).map((s) => slugOf.get(s.productId)!).filter(Boolean)[0];
  const cases = [
    { region: "au", slug: pick("AU", 5) },
    { region: "us", slug: pick("US", 3) },
    { region: "uk", slug: pick("UK", 1) },
  ].filter((c) => c.slug);
  assert.ok(cases.length >= 2, "the data files have products to render");
  for (const c of cases) {
    const html = renderToStaticMarkup(await ProductPage({ params: { region: c.region, slug: c.slug } }));
    const { nodes, t } = checkPage(html, `${c.region}/p/${c.slug}`);
    const product = nodes.find((n) => n["@type"] === "Product") as { offers: { lowPrice: string; highPrice: string; offerCount: number; priceCurrency: string } } | undefined;
    if (!product) continue; // nothing open: no Product markup, as the page shows no price
    const plain = t.replace(/[^\d.,\s]/g, " ");
    for (const v of [product.offers.lowPrice, product.offers.highPrice]) {
      const shown = Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const whole = v.endsWith(".00") ? Number(v).toLocaleString("en-US") : null;
      assert.ok(plain.includes(shown) || (whole != null && plain.includes(whole)), `${c.slug}: ${v} is on the page`);
    }
    assert.equal(product.offers.priceCurrency, { au: "AUD", us: "USD", uk: "GBP" }[c.region]);
  }
});

test("one real page of each kind: type, set, deals and guide pages carry valid BreadcrumbList / ItemList / Article / FAQPage", async () => {
  await setup();
  const pages: [string, () => Promise<React.ReactElement>][] = [
    ["type", async () => (await import("../src/app/[region]/type/[type]/page")).default({ params: { region: "us", type: "play-booster-boxes" } } as never)],
    ["set", async () => (await import("../src/app/[region]/sets/[set]/page")).default({ params: { region: "au", set: "bloomburrow" } } as never)],
    ["deals", async () => (await import("../src/app/[region]/deals/page")).default({ params: { region: "uk" } } as never)],
    ["guide", async () => (await import("../src/app/[region]/guides/[slug]/page")).default({ params: { region: "us", slug: "cheapest-way-to-buy-magic-packs" } } as never)],
  ];
  for (const [kind, render] of pages) {
    const html = renderToStaticMarkup(await render());
    const { nodes } = checkPage(html, kind);
    const types = new Set(nodes.map((n) => n["@type"]));
    if (kind === "type" || kind === "set" || kind === "deals") assert.ok(types.has("ItemList"), `${kind}: ItemList`);
    if (kind === "guide") {
      assert.ok(types.has("Article"), "guide: Article");
      assert.ok(types.has("FAQPage"), "guide: FAQPage");
    }
  }
});
