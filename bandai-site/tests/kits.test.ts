import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gradeOf, isKitTitle, janFromItemCode, janOf, jansIn, keepConsistent, kitCore, kitName, scaleOf, validEan13, type KitListing } from "@/lib/import/kits";

// Real shop titles and SKUs from the 2026-10-28 store probe.
const BANDAI = ["4573102", "4549660", "4543112"];

test("EAN-13 check digits", () => {
  assert.ok(validEan13("4573102630308")); // HG Gundam Aerial
  assert.ok(validEan13("4573102582225")); // MG Gundam Barbatos
  assert.ok(!validEan13("4573102630309"));
  assert.deepEqual(jansIn("rg-4573102589255", BANDAI), ["4573102589255"]); // Gundam Planet's SKU
  assert.deepEqual(jansIn("Aoshima 4905083206348", BANDAI), []); // another maker
});

test("Bandai item numbers map to the JAN, in every way shops write them", () => {
  const aerial = "4573102630308";
  for (const sku of ["5063030", "G5063030", "MK63030", "BANMK63030", "BAN630308"]) assert.equal(janFromItemCode(sku, "4573102"), aerial, sku);
  assert.equal(janFromItemCode("H1-MG-BARBATOS-5058222", "4573102"), "4573102582225");
  assert.equal(janFromItemCode("220277 BANMK65322", "4573102"), "4573102653222"); // Zone Gunpla: Calibarn
  // Not Bandai item numbers: Bandai America's own codes, other shops' codes.
  for (const sku of ["2478111", "BNDAI-2795248", "G50589251", "ZM35076", "210000751642", "BAN630309"]) assert.equal(janFromItemCode(sku, "4573102"), null, sku);
});

test("a printed barcode wins over an item number; two different barcodes mean none", () => {
  assert.deepEqual(janOf({ title: "x", sku: "4573102630308" }, BANDAI, "4573102"), { jan: "4573102630308", derived: false });
  assert.deepEqual(janOf({ title: "x", sku: "G5063030" }, BANDAI, "4573102"), { jan: "4573102630308", derived: true });
  assert.deepEqual(janOf({ title: "x", sku: "PLAMO", body: "<p>JAN: 4573102630308</p>" }, BANDAI, "4573102"), { jan: "4573102630308", derived: false });
  assert.equal(janOf({ title: "x", body: "4573102630308 and 4573102582225" }, BANDAI), null);
  assert.equal(janOf({ title: "x", sku: "PLAMO" }, BANDAI, "4573102"), null);
});

test("grades and scales from shop titles", () => {
  const cases: [string, string | null, string | null][] = [
    ["Bandai: Gunpla - HGTWFM - #03 Gundam Aerial 1/144", "HG", "1/144"],
    ["Gundam 1/144 HG WFM #03 XVX-016 Gundam Aerial Model Kit", "HG", "1/144"],
    ["Bandai HGUC 1/144 #241 MS-06 Zaku II Model Kit | Mobile Suit Gundam", "HG", "1/144"],
    ["Bandai: Gunpla - Full Mechanics - #03 XVX-016 Gundam Aerial 1/100", "FM", "1/100"],
    ["MGSD Gundam Barbatos Model Kit", "MGSD", null],
    ["Bandai Spirits - MGEX 1/100 Strike Freedom Gundam (Gundam Seed Destiny)", "MGEX", "1/100"],
    ["Gunpla Model Kit: 1/144 RX-78-2 Gundam: Entry Grade (EG)", "EG", "1/144"],
    ["SD GUNDAM EX-STANDARD WING GUNDAM ZERO EW", "SD", null],
    ["MG 1/100 ASW-G-08 Gundam Barbatos (4th Form)", "MG", "1/100"],
    ["RG 40 RX-78-2 Gundam Ver. 2.0 1/144", "RG", "1/144"],
    ["1/100 (RE/100): Mobile Suit Gundam 0083: Stardust Memory - #03 RX78GP04 Gundam GP04G Gerbera", "RE/100", "1/100"],
  ];
  for (const [t, g, s] of cases) {
    assert.equal(gradeOf(t), g, t);
    assert.equal(scaleOf(t), s, t);
  }
});

test("tools, paint, toys and built models are not kits", () => {
  for (const t of ["Gundam Marker GM01 Black", "Mr Hobby GT134, Mr Flexible Clips, Painting Clips", "Display Stand Action Base 5 (Clear)", "Figure-rise Standard Goku", "HG Aerial built and painted", "Gundam Card Game Booster Box"]) assert.ok(!isKitTitle(t), t);
  for (const t of ["HG 1/144 Gundam Aerial", "RG Hi-Nu Gundam 1/144 Model Kit", "Bandai MG 1/100 Gundam Barbatos Model Kit"]) assert.ok(isKitTitle(t), t);
});

test("a kit's name: the shops' common words behind the grade and scale", () => {
  assert.equal(kitCore("Bandai HG 1/144 #03 Gundam Aerial \"The Witch from Mercury\" [PRE-ORDER]"), "Gundam Aerial");
  const n = kitName(["HG Gundam Aerial 1/144 Model Kit", "Hg 1/144 Gundam Aerial", "Bandai: Gunpla - HGTWFM - #03 Gundam Aerial 1/144", "HG 1/144 GUNDAM AERIAL"]);
  assert.equal(n.grade, "HG");
  assert.equal(n.scale, "1/144");
  assert.equal(n.name, "HG 1/144 Gundam Aerial");
});

const listing = (over: Partial<KitListing>): KitListing => ({ jan: "4573102630308", derived: false, title: "", grade: "HG", image: null, source: "a", market: "US", cents: 2000, inStock: true, ref: "x", ...over });

test("an item number that lands on another grade, or a wild price, is dropped", () => {
  const ls = [listing({ source: "a" }), listing({ source: "b", cents: 2200 }), listing({ source: "c", derived: true, grade: "MG", cents: 2100 }), listing({ source: "d", derived: true, cents: 9900 })];
  assert.deepEqual(keepConsistent(ls, { USD: 1 }).map((l) => l.source), ["a", "b"]);
});

test("kit pages cache a day and prerender nothing", () => {
  for (const f of ["src/app/kit/[slug]/page.tsx", "src/app/kits/grade/[grade]/page.tsx", "src/app/kits/page.tsx"]) {
    const src = fs.readFileSync(f, "utf8");
    assert.match(src, /export const revalidate = 86400;/, f);
    if (f.includes("[")) assert.match(src, /export const generateStaticParams = \(\) => \[\];/, f);
  }
});

test("shouting shop titles are tidied, model codes kept", () => {
  assert.equal(kitName(["30MM BEXM-21 VERDENOVA (NAVY)", "Bandai 30MM BEXM-21 VERDENOVA (NAVY) 1/144"]).name, "1/144 30MM BEXM-21 Verdenova (Navy)");
  assert.equal(kitName(["HG 1/144 GUNDAM AERIAL", "Hg 1/144 Gundam Aerial"]).name, "HG 1/144 Gundam Aerial");
  assert.equal(kitName(["30MM bEXM-14T CIELNOVA", "Bandai 30MM bEXM-14T CIELNOVA 1/144"]).name, "1/144 30MM bEXM-14T Cielnova");
  assert.equal(kitName(["MG 1/100 GUNDAM SEED ASTRAY RED FRAME"]).name, "MG 1/100 Gundam SEED Astray Red Frame");
  assert.equal(gradeOf("1/144 FG Char's Zaku"), "FG");
});

test("two listings far apart: the item-number one goes", () => {
  const ls = [listing({ source: "a", cents: 16000 }), listing({ source: "b", derived: true, cents: 2200 })];
  assert.deepEqual(keepConsistent(ls, { USD: 1 }).map((l) => l.source), ["a"]);
});

test("a Neto category card: item number, title, price, currency and stock sign", async () => {
  const { parseNetoCategory } = await import("@/lib/import/kits-neto");
  const card = (sku: string, title: string, price: string, sign: string) => `<article class="col-8 mm_cate-pro" role="article">
	<div class="card thumbnail card-body">
		<meta itemprop="brand" content="Bandai"/>
		<meta itemprop="mpn" content="${sku}"/>
		<a href="https://www.frontlinehobbies.com.au/bandai-${sku}" class="thumbnail-image pb-2">
			<img src="/assets/thumb/${sku}.webp?20260328164827" itemprop="image" class="product-image img-fluid" alt="x">
		</a>
		<p class="card-title h4" itemprop="name"><a href="https://www.frontlinehobbies.com.au/bandai-${sku}">${title}</a></p>
		<p class="price"><span itemprop="price" content="${price}">$${price}</span><meta itemprop="priceCurrency" content="AUD"></p>
		<!-- In stock / Out of Stock Sign -->
		<span class="label label-success">${sign}</span>
	</div></article>`;
  const html = card("G5066295", "Bandai Gundam HG 1/144 Black Knight Squad Shi-Ve.A", "44.99", "In Stock - Broadmeadow") + card("G5063137", "Bandai Gundam HG 1/144 Full Armor Gundam &amp; Co", "30.00", "Out of Stock") + `<a href="?pgnum=2">2</a><a href="?pgnum=7">7</a>`;
  const { cards, lastPage } = parseNetoCategory(html);
  assert.equal(lastPage, 7);
  assert.deepEqual(cards[0], { sku: "G5066295", title: "Bandai Gundam HG 1/144 Black Knight Squad Shi-Ve.A", cents: 4499, currency: "AUD", inStock: true, path: "bandai-G5066295", image: "/assets/thumb/G5066295.webp" });
  assert.equal(cards[1].inStock, false);
  assert.equal(cards[1].title, "Bandai Gundam HG 1/144 Full Armor Gundam & Co");
  assert.equal(janFromItemCode(cards[0].sku, "4573102"), "4573102662958");
});

test("a pre-order's ETA and '(Tentative)' stay out of the kit's name", () => {
  assert.equal(kitCore("(Pre-Order)  ETA Mar-Apr 2027 HG 1/144 STRIKE FREEDOM GUNDAM SEED FREEDOM ZERO Ver. (Tentative)"), "STRIKE FREEDOM GUNDAM SEED FREEDOM ZERO Ver.");
  assert.equal(kitCore("(Pre-Order)  ETA June-July 2027 HG 1/144 GUNDAM ZERO"), "GUNDAM ZERO");
});
