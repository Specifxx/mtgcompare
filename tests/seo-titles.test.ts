// lib/seo-titles.ts: every price page's <title> as a results page shows it is at most 60 characters (with " | MTG Compare" only when
// that still fits), every description at most 160, led by the query people search; and the route files use these builders.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findBannedCopy } from "../src/lib/copy-rules";
import { REGION_LIST, REGIONS } from "../src/lib/regions";
import { PRODUCT_TYPES } from "../src/lib/sealed-title";
import { SETS } from "../src/lib/sets";
import { fitDescription, seoCopy, shortName, shownTitle, type SeoTitle } from "../src/lib/seo-titles";

function rule(t: SeoTitle, label: string) {
  const shown = shownTitle(t);
  assert.ok(shown.length <= 60, `${label}: "${shown}" is ${shown.length}`);
  if (typeof t !== "string") assert.ok(t.absolute.length + " | MTG Compare".length > 60, `${label}: absolute for a title that fits the suffix`);
  assert.doesNotMatch(shown, /\bMTG\s+(?:MTG|Magic)\b/i, `${label}: double MTG`);
  assert.equal(findBannedCopy(shown), null, label);
}

test("region pages: home, deals, cheapest packs, this week, guides, stores, sets, releases fit 60 / 160 in every region", () => {
  for (const r of REGION_LIST) {
    for (const [k, t] of Object.entries({
      home: seoCopy.homeTitle(r, 114),
      deals: seoCopy.dealsTitle(r),
      packs: seoCopy.packsTitle(r),
      digest: seoCopy.digestTitle(r),
      guides: seoCopy.guidesTitle(r),
      stores: seoCopy.storesTitle(r, 114),
      sets: seoCopy.setsIndexTitle(r),
      releases: seoCopy.releasesTitle(r, 2026),
    }))
      rule(t, `${r.region} ${k}`);
    for (const d of [
      seoCopy.homeDescription(r, 114, 12345),
      seoCopy.dealsDescription(r, 120, 45),
      seoCopy.dealsDescription(r, 0, null),
      seoCopy.packsDescription(r, { name: "March of the Machine: The Aftermath Collector Booster Box", perPack: 12345 }),
      seoCopy.guidesDescription(r),
      seoCopy.storesDescription(r, 114),
    ])
      assert.ok(d.length <= 160, `${r.region}: ${d.length} "${d}"`);
  }
  assert.equal(shownTitle(seoCopy.homeTitle(REGIONS.us, 114)), "MTG booster box prices in the US: 114 stores compared");
  assert.equal(shownTitle(seoCopy.storesTitle(REGIONS.au, 60)), "Where to buy Magic sealed product in Australia: 60 stores");
});

test("type pages lead with '<type> prices in <region>', and keep the live from-price when it fits", () => {
  const pbb = PRODUCT_TYPES.find((t) => t.slug === "play-booster-boxes")!;
  assert.equal(shownTitle(seoCopy.typeTitle(pbb, REGIONS.us, 20, 9895)), "MTG Play Booster Box prices in the US: from $98.95");
  for (const t of PRODUCT_TYPES)
    for (const r of REGION_LIST)
      for (const [open, from] of [[0, null], [3, 999], [1234, 1234567]] as const) {
        rule(seoCopy.typeTitle(t, r, open, from), `${t.slug}/${r.region}`);
        assert.ok(seoCopy.typeDescription(t, r, { open, total: open + 40 }, from).length <= 160, `${t.slug}/${r.region} description`);
      }
});

test("set pages: pre-order wording and date while upcoming, never 'booster box' for a set sold without one, 60 for every set and region", () => {
  const trk = SETS.find((s) => s.code === "trk")!;
  assert.equal(shownTitle(seoCopy.setTitle(trk, REGIONS.au, { preorder: true, withoutBox: false, date: "13 Nov 2026" })), "MTG Star Trek pre-orders in Australia: out 13 Nov 2026", "the box wording drops first when it would pass 60");
  assert.equal(shownTitle(seoCopy.setTitle(trk, REGIONS.us, { preorder: false, withoutBox: false, date: "13 Nov 2026" })), "MTG Star Trek booster box & sealed prices in the US");
  for (const s of SETS)
    for (const r of REGION_LIST)
      for (const preorder of [true, false]) {
        const withoutBox = !s.boosters?.length;
        const t = seoCopy.setTitle(s, r, { preorder, withoutBox, date: "13 Nov 2026" });
        rule(t, `${s.slug}/${r.region}`);
        if (withoutBox) assert.doesNotMatch(shownTitle(t), /booster box/i, s.slug);
        if (preorder) assert.match(shownTitle(t), /pre-order/, s.slug);
      }
});

test("product titles: '<name> price in <region>: from <price>' while it fits; a long store title is tidied and cut at a word", () => {
  assert.equal(shownTitle(seoCopy.productTitle({ name: "Bloomburrow Bundle", market: "US", inName: "the US", cheapestCents: 4499 })), "MTG Bloomburrow Bundle price in the US: from $44.99");
  assert.equal(shownTitle(seoCopy.productTitle({ name: "Edge of Eternities Collector Booster Box", market: "US", inName: "the US", cheapestCents: null })), "MTG Edge of Eternities Collector Booster Box price in the US");
  const long = "Secret Lair Drop Secret Lair x Hatsune Miku Electric Entourage EN Rainbow Foil Edition";
  const t = shownTitle(seoCopy.productTitle({ name: long, market: "US", inName: "the US", cheapestCents: 3999 }));
  assert.ok(t.length <= 60, t);
  assert.match(t, /^MTG Secret Lair x Hatsune Miku/);
  for (const w of shortName(long, 54).split(" ")) assert.ok(long.includes(w), `"${w}" is the store's own word`);
  const products = JSON.parse(readFileSync("data/public/products.json", "utf8")) as { name: string }[];
  for (const p of products.slice(0, 3000)) rule(seoCopy.productTitle({ name: p.name, market: "NZ", inName: "New Zealand", cheapestCents: 123456 }), p.name);
});

test("fitDescription: the first that fits, else cut at a word with an ellipsis", () => {
  assert.equal(fitDescription("a".repeat(170), "short"), "short");
  const cut = fitDescription(`${"word ".repeat(50)}end`);
  assert.ok(cut.length <= 160 && cut.endsWith("…"), cut);
});

test("the route files build their <title>s with lib/seo-titles.ts", () => {
  const src = (p: string) => readFileSync(`src/app/[region]/${p}`, "utf8");
  for (const [p, fn] of [
    ["page.tsx", "homeTitle"],
    ["deals/page.tsx", "dealsTitle"],
    ["cheapest-packs/page.tsx", "packsTitle"],
    ["this-week/page.tsx", "digestTitle"],
    ["guides/page.tsx", "guidesTitle"],
    ["stores/page.tsx", "storesTitle"],
    ["sets/page.tsx", "setsIndexTitle"],
    ["releases/page.tsx", "releasesTitle"],
    ["type/[type]/page.tsx", "typeTitle"],
    ["sets/[set]/page.tsx", "setTitle"],
    ["p/[slug]/page.tsx", "productTitle"],
    ["stores/[store]/StoreListing.tsx", "storeTitle"],
  ])
    assert.match(src(p), new RegExp(`seoCopy\\.${fn}\\(`), p);
});

test("product titles keep the region and the product type, so siblings and regions never share a title (2026-10-26 audit)", () => {
  const t = (name: string, productType: string, market: string, inName: string, setCode: string | null) =>
    shownTitle(seoCopy.productTitle({ name, productType, market, inName, cheapestCents: null, setCode }));
  const box = t("Commander Legends: Battle for Baldur's Gate Collector Booster Box", "Collector Booster Box", "AU", "Australia", "clb");
  const pack = t("Commander Legends: Battle for Baldur's Gate Collector Booster Pack", "Collector Booster Pack", "AU", "Australia", "clb");
  assert.notEqual(box, pack);
  assert.ok(box.length <= 60 && pack.length <= 60, `${box} / ${pack}`);
  const decks = ["Aura of Courage", "Draconic Rage", "Dungeons of Death", "Planar Portal"].map((d) =>
    t(`Adventures in the Forgotten Realms Commander Deck - ${d}`, "Commander Deck", "US", "the US", "afr"));
  assert.equal(new Set(decks).size, 4, decks.join(" / "));
  const au = t("Bloomburrow Commander Deck - Animated Army", "Commander Deck", "AU", "Australia", "blb");
  const ca = t("Bloomburrow Commander Deck - Animated Army", "Commander Deck", "CA", "Canada", "blb");
  assert.notEqual(au, ca);
  const sl = ["I", "II"].map((n) => t(`Dungeons & Dragons®: Death is In the Eyes of the Beholder ${n} MTG Secret Lair`, "Secret Lair Drop", "US", "the US", null));
  assert.notEqual(sl[0], sl[1]);
});
