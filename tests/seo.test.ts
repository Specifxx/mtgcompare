// The growth release's SEO contracts (src/lib/seo.ts): withPokemon for titles and H1s, the default share image, the guides'
// Article JSON-LD, and the product JSON-LD's description and condition.
import { test } from "node:test";
import assert from "node:assert/strict";
import { articleJsonLd, DEFAULT_OG_IMAGE, pageMeta, productJsonLd, withPokemon } from "../src/lib/seo";
import { SITE_NAME, SITE_URL } from "../src/lib/site";

test("withPokemon: 'Pokémon ' in front, unless the name already says it (any case, accented or not)", () => {
  assert.equal(withPokemon("Pitch Black"), "Pokémon Pitch Black");
  assert.equal(withPokemon("Booster Boxes"), "Pokémon Booster Boxes");
  assert.equal(withPokemon("Pokémon Center Elite Trainer Boxes"), "Pokémon Center Elite Trainer Boxes", "never 'Pokémon Pokémon Center…'");
  assert.equal(withPokemon("pokemon center etb"), "pokemon center etb");
  assert.equal(withPokemon("POKEMON 151 Booster Bundle"), "POKEMON 151 Booster Bundle");
  assert.equal(withPokemon("Scarlet & Violet 151 Pokémon Card Collection"), "Scarlet & Violet 151 Pokémon Card Collection", "anywhere in the name");
  assert.equal(withPokemon("Pokémon Center ETB"), "Pokémon Center ETB", "a decomposed é is still Pokémon");
  assert.equal(withPokemon("Pokéball Tin"), "Pokémon Pokéball Tin", "Pokéball is not Pokémon");
});

test("pageMeta: without an image, the site's share card (1200×630) and the large Twitter card; with one, that image", () => {
  const m = pageMeta({ title: "t", description: "d", path: "/au/sets" });
  assert.deepEqual((m.openGraph as { images: unknown }).images, [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: SITE_NAME }]);
  assert.deepEqual(DEFAULT_OG_IMAGE, { url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: SITE_NAME });
  assert.equal((m.twitter as { card: string }).card, "summary_large_image");
  const own = pageMeta({ title: "t", description: "d", path: "/au/sets/x", image: "https://images.example/logo.png" });
  assert.deepEqual((own.openGraph as { images: unknown }).images, [{ url: "https://images.example/logo.png" }]);
  assert.equal((own.twitter as { card: string }).card, "summary_large_image");
  // the product shape still has no openGraph.type key (Next throws on type: undefined), and gets the default image too
  const p = pageMeta({ title: "t", description: "d", path: "/au/p/x", ogType: "product", image: null });
  assert.ok(!("type" in (p.openGraph as object)));
  assert.equal((p.openGraph as { images: { url: string }[] }).images[0].url, `${SITE_URL}/opengraph-image`);
});

test("productJsonLd: an optional description, and every offer is NewCondition (sealed product; eBay is never in here)", () => {
  const base = { name: "Pitch Black Elite Trainer Box", path: "/au/p/pitch-black-etb", productType: "Elite Trainer Box", currency: "AUD", lowCents: 7995, highCents: 9995, offerCount: 6 };
  const plain = productJsonLd(base);
  assert.ok(!("description" in plain), "no description key when none is given");
  assert.equal(plain.offers.itemCondition, "https://schema.org/NewCondition");
  assert.equal(plain.offers.availability, "https://schema.org/InStock");
  const d = "At A$8.88 a pack this is the cheapest way to buy Pitch Black packs in Australia today.";
  const withD = productJsonLd({ ...base, description: d, preorder: true });
  assert.equal((withD as { description?: string }).description, d);
  assert.equal(withD.offers.availability, "https://schema.org/PreOrder");
  assert.equal(withD.offers.itemCondition, "https://schema.org/NewCondition");
  assert.ok(!("description" in productJsonLd({ ...base, description: null })));
});

test("articleJsonLd: headline, dates, mainEntityOfPage, and DexCompare (an Organization) as author and publisher", () => {
  const a = articleJsonLd({ title: "How many packs are in Pokémon products?", description: "Pack counts…", path: "/au/guides/how-many-packs-in-pokemon-products", published: "2026-10-14", updated: "2026-10-20" });
  assert.equal(a["@context"], "https://schema.org");
  assert.equal(a["@type"], "Article");
  assert.equal(a.headline, "How many packs are in Pokémon products?");
  assert.equal(a.description, "Pack counts…");
  assert.equal(a.url, `${SITE_URL}/au/guides/how-many-packs-in-pokemon-products`);
  assert.deepEqual(a.mainEntityOfPage, { "@type": "WebPage", "@id": `${SITE_URL}/au/guides/how-many-packs-in-pokemon-products` });
  assert.equal(a.datePublished, "2026-10-14");
  assert.equal(a.dateModified, "2026-10-20");
  assert.equal(a.image, `${SITE_URL}/opengraph-image`);
  for (const who of [a.author, a.publisher]) {
    assert.equal(who["@type"], "Organization", "never an invented person");
    assert.equal(who.name, SITE_NAME);
    assert.equal(who.url, SITE_URL);
  }
  assert.equal(a.publisher.logo.url, `${SITE_URL}/logo.svg`);
  assert.equal(articleJsonLd({ title: "t", description: "d", path: "/us/guides/x", published: "2026-01-01", updated: "2026-01-01", image: "https://www.dexcompare.app/x.png" }).image, "https://www.dexcompare.app/x.png");
});
