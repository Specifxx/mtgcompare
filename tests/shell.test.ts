// The site's shell: the header (one 60px row, search at every width), the phone menu, the region footer, the root layout's
// fonts, the landing page's metadata, breadcrumbs, the product card and the empty state. Rendered on the server as a crawler sees them.
import { test } from "node:test";
import { SISTER_SITES } from "../src/lib/site";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ProductCardData } from "../src/lib/data";
import { IMPACT_SITE_VERIFICATIONS } from "../src/lib/affiliate";
import { REGION_LIST } from "../src/lib/regions";
import { SETS } from "../src/lib/sets";
import { OPERATOR, SITE_NAME, SITE_URL } from "../src/lib/site";
import { DEFAULT_OG_IMAGE } from "../src/lib/seo";
import { findBannedCopy } from "../src/lib/copy-rules";
import { Breadcrumbs, parentCrumb } from "../src/components/Breadcrumbs";
import { Footer, footerColumns } from "../src/components/Footer";
import { Header, HEADER_NAV } from "../src/components/Header";
import { MENU_ROWS, MenuSheet } from "../src/components/MobileMenu";
import { isActivePath } from "../src/components/NavLink";
import { cardCompareLabel, cardStockLabel, ProductCard, shortTypeLabel } from "../src/components/ProductCard";
import { pathAfterRegion, regionSwitchHref } from "../src/components/RegionSwitcher";
import { Empty, emptyActionIcon } from "../src/components/Section";
import { metadata as landingMetadata } from "../src/app/(site)/page";

// The components are compiled with the classic JSX runtime here (tsconfig "jsx": "preserve"; Next uses its own).
(globalThis as unknown as { React: typeof React }).React = React;

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

/** Server markup inside a stub app router (SearchBox calls useRouter), without React's server-only warnings. */
function render(el: React.ReactElement): string {
  const router = { push() {}, replace() {}, refresh() {}, prefetch() {}, back() {}, forward() {} };
  const err = console.error;
  console.error = () => {};
  try {
    return renderToStaticMarkup(React.createElement(AppRouterContext.Provider, { value: router as never }, el));
  } finally {
    console.error = err;
  }
}

const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));

// ─── Footer ──────────────────────────────────────────────────────────────────

test("Footer on a region page: Shop, Latest sets, Explore and DexCompare, then the regions; every link internal", () => {
  const html = render(React.createElement(Footer, { region: "au" }));
  for (const t of ["Shop", "Latest sets", "Explore", "DexCompare"]) assert.match(html, new RegExp(`<h2 class="eyebrow mb-2">${t}</h2>`), t);
  const links = hrefs(html);
  for (const h of [
    "/au/type/booster-boxes",
    "/au/type/elite-trainer-boxes",
    "/au/type/booster-bundles",
    "/au/type/ultra-premium-collections",
    "/au/type/tins",
    "/au/cheapest-packs",
    "/au/deals",
    "/au/this-week",
    "/au/releases",
    "/au/guides",
    "/au/stores",
    "/au/sealed",
    "/about",
    "/about#stores",
    "/contact",
    "/terms",
    "/privacy",
    "/about#money",
  ])
    assert.ok(links.includes(h), `links to ${h}`);
  // Latest sets: the first six of SETS, each to its set page in this region.
  for (const s of SETS.slice(0, 6)) assert.ok(links.includes(`/au/sets/${s.slug}`), s.slug);
  assert.ok(!links.includes(`/au/sets/${SETS[6].slug}`), "six, not seven");
  // The flag row: every region's home, this one marked.
  for (const r of REGION_LIST) assert.ok(links.includes(`/${r.region}`), r.region);
  assert.match(html, /aria-current="true" class="chip min-h-10 chip-on" href="\/au">/);
  // every link is internal but the owner's sister sites ("Also from us", tests/footer.test.ts)
  const sisters = new Set<string>(SISTER_SITES.map((s) => s.url));
  for (const h of links) if (!sisters.has(h)) assert.match(h, /^\//, `${h} is internal`);
  assert.equal(footerColumns("au").length, 4);
});

test("Footer: no mailto (Contact goes to /contact), the two-line disclosure, and no 'operated by DexCompare'", () => {
  for (const region of ["us", null] as const) {
    const html = render(React.createElement(Footer, { region }));
    assert.doesNotMatch(html, /mailto:/i);
    assert.doesNotMatch(html, /@[a-z0-9.-]*riftcompare|riftcompare[a-z0-9.-]*@/i, "another brand's email address never shows in the chrome (the RiftCompare sister-site link may)");
    assert.match(html, /eBay and TCGplayer links are affiliate links and are marked where they appear\.<br\/>No store pays to be listed or to rank\./);
    assert.match(html, /How we make money/);
    assert.match(html, /Prices and stock are read from each store about twice a day; the store’s own page is final\./);
    assert.equal(findBannedCopy(html.replace(/<[^>]+>/g, " ")), null);
    if (OPERATOR === SITE_NAME) assert.doesNotMatch(html, /operated by/i, "never the circular 'DexCompare is operated by DexCompare'");
  }
  assert.match(src("components/Footer.tsx"), /OPERATOR !== SITE_NAME && ` Operated by \$\{OPERATOR\}\.`/);
});

test("Footer with no region: Regions and DexCompare columns only, and no region-scoped link", () => {
  const html = render(React.createElement(Footer, { region: null }));
  assert.deepEqual(
    footerColumns(null).map((c) => c.title),
    ["Regions", "DexCompare"],
  );
  assert.doesNotMatch(html, /Latest sets|>Shop<|>Explore</);
  const links = hrefs(html);
  for (const r of REGION_LIST) assert.ok(links.includes(`/${r.region}`), r.region);
  assert.ok(!links.some((h) => /^\/[a-z]{2}\//.test(h)), "nothing under a region");
});

test("the footer is drawn by each layout after its <main> (and by the 404 and error pages), not by the root layout", () => {
  assert.match(src("app/[region]/layout.tsx"), /<\/main>\s*<Footer region=\{r\.region\} \/>/);
  assert.match(src("app/(site)/layout.tsx"), /<\/main>\s*<Footer region=\{null\} \/>/);
  assert.match(src("app/not-found.tsx"), /<\/main>\s*<Footer region=\{null\} \/>/);
  assert.match(src("app/error.tsx"), /<\/main>\s*<Footer region=\{region\?\.region \?\? null\} \/>/);
  assert.doesNotMatch(src("app/layout.tsx"), /<Footer|components\/Footer/);
  // Static: the footer reads no database.
  assert.doesNotMatch(src("components/Footer.tsx"), /prisma|@\/lib\/db|data"/);
});

// ─── Header and menu ─────────────────────────────────────────────────────────

test("Header on a region page: search at every width (never in a hidden wrapper), the menu button, a compact region button", () => {
  const html = render(React.createElement(Header, { region: "us" }));
  assert.match(html, /^<header class="sticky top-0 z-40 h-\[var\(--hdr\)\] border-b border-line bg-surface\/90 backdrop-blur-md">/);
  const form = html.indexOf('role="search"');
  assert.ok(form > 0, "the search form is in the header");
  const wrapper = html.lastIndexOf("<div", form);
  const cls = /class="([^"]*)"/.exec(html.slice(wrapper, form))?.[1] ?? "";
  assert.match(cls, /\bhdr-search min-w-0 flex-1\b/);
  assert.doesNotMatch(cls, /(^|\s)hidden(\s|$)/, "visible below md");
  assert.doesNotMatch(html, /hidden[^"]*md:block[^>]*>\s*<form[^>]*role="search"/);
  assert.match(html, /aria-label="Menu" aria-haspopup="dialog" aria-expanded="false" aria-controls="site-menu"/);
  assert.match(html, /<dialog id="site-menu"/);
  assert.match(html, /aria-label="Region: United States\. Change region"[^>]*class="chip [^"]*h-11 w-11/);
  assert.doesNotMatch(html, /aria-label="Sections"[^>]*class="page flex gap-1 overflow-x-auto/, "the second chip row is gone");
});

test("Header nav (lg and up): Deals · All sealed · Sets · Releases · Guides · Stores, each to its region path", () => {
  assert.deepEqual(
    HEADER_NAV.map((n) => n.label),
    ["Deals", "All sealed", "Sets", "Releases", "Guides", "Stores"],
  );
  const html = render(React.createElement(Header, { region: "uk" }));
  const nav = /<nav class="hidden items-center gap-0\.5 lg:flex" aria-label="Main">([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? "";
  for (const [href, label] of [
    ["/uk/deals", "Deals"],
    ["/uk/sealed", "All sealed"],
    ["/uk/sets", "Sets"],
    ["/uk/releases", "Releases"],
    ["/uk/guides", "Guides"],
    ["/uk/stores", "Stores"],
  ])
    assert.match(nav, new RegExp(`href="${href}"[^>]*>${label}</a>`), label);
  assert.match(nav, /data-ad="header"/, "eBay's labelled link stays (xl)");
});

test("Header with no region: logo, 'Choose region' and the menu; no search, no section nav", () => {
  const html = render(React.createElement(Header, { region: null }));
  assert.match(html, /Choose region/);
  assert.match(html, /aria-label="Menu"/);
  assert.doesNotMatch(html, /role="search"/);
  assert.doesNotMatch(html, /aria-label="Main"/);
});

test("NavLink's current-section logic (aria-current='page'): whole segments, and the paths a section also covers", () => {
  assert.equal(isActivePath("/us/sets", "/us/sets"), true);
  assert.equal(isActivePath("/us/sets/pitch-black", "/us/sets"), true);
  assert.equal(isActivePath("/us/sets/", "/us/sets"), true);
  assert.equal(isActivePath("/us/setsx", "/us/sets"), false);
  assert.equal(isActivePath("/us", "/us/sets"), false);
  assert.equal(isActivePath("/us/sealed/page/2", "/us/sealed"), true);
  assert.equal(isActivePath("/us/type/tins", "/us/sealed", ["/us/type"]), true);
  assert.equal(isActivePath("/us/sealed?q=etb", "/us/sealed"), true);
  assert.equal(isActivePath(null, "/us/sealed"), false);
  assert.equal(isActivePath("/au/sets", "/us/sets"), false);
});

test("the phone menu: the eleven sections in order, under the region; the regions switch to the same page", () => {
  assert.deepEqual(
    MENU_ROWS.map((r) => r.label),
    ["Deals", "This week", "All sealed", "Booster boxes", "ETBs", "Booster bundles", "Cheapest per pack", "Sets", "Releases", "Guides", "Where to buy"],
  );
  // The sheet's contents render on the first open: the header's server HTML has the empty <dialog> only.
  assert.match(render(React.createElement(Header, { region: "ca" })), /<dialog id="site-menu" data-menu="" aria-label="Menu" class="menu-sheet [^"]*"><\/dialog>/);
  const sheet = render(React.createElement(MenuSheet, { region: "ca", pathname: "/ca/stores", onClose() {} }));
  assert.match(sheet, /aria-current="page"[^>]*href="\/ca\/stores"|href="\/ca\/stores"[^>]*aria-current="page"/, "the current section is marked");
  for (const p of ["/deals", "/this-week", "/sealed", "/type/booster-boxes", "/type/elite-trainer-boxes", "/type/booster-bundles", "/cheapest-packs", "/sets", "/releases", "/guides", "/stores"])
    assert.ok(hrefs(sheet).includes(`/ca${p}`), p);
  assert.equal(sheet.match(/class="text-2xl leading-none" aria-hidden="true">/g)?.length, 7, "seven flag tiles");
  assert.equal(pathAfterRegion("/au/sets/pitch-black"), "/sets/pitch-black");
  assert.equal(regionSwitchHref("/au/sets/pitch-black", "uk", "au"), "/uk/sets/pitch-black");
  assert.equal(regionSwitchHref("/about", "uk", null), "/uk", "a page with no region goes to the region's home, not /uk/about");
  assert.equal(regionSwitchHref("/au/p/nope", "uk", null), "/uk", "a 404 under a region: the home, not another 404");
});

// ─── Root layout ─────────────────────────────────────────────────────────────

test("root layout: both faces use display 'optional' (no font-swap layout shift), and the Impact meta block is unchanged", () => {
  const layout = src("app/layout.tsx");
  assert.equal(layout.match(/display: "optional"/g)?.length, 2);
  assert.match(layout, /Inter\(\{[^}]*display: "optional"/);
  assert.match(layout, /Bricolage_Grotesque\(\{[^}]*display: "optional"/);
  assert.doesNotMatch(layout, /display: "swap"/);
  // The same pins as tests/affiliate.test.ts.
  assert.match(layout, /IMPACT_SITE_VERIFICATIONS\.map\(\(value\) =>[\s\S]*name: "impact-site-verification", value/);
  assert.ok(layout.indexOf("impact-site-verification") > layout.indexOf("<head>") && layout.indexOf("impact-site-verification") < layout.indexOf("</head>"));
  assert.ok(IMPACT_SITE_VERIFICATIONS.length >= 2);
});

// ─── Landing page ────────────────────────────────────────────────────────────

test("landing metadata: hreflang for the seven region homes plus x-default '/', a short description, the site's share card", () => {
  const langs = landingMetadata.alternates?.languages as Record<string, string>;
  assert.equal(Object.keys(langs).length, 8);
  for (const r of REGION_LIST) assert.equal(langs[r.hreflang], `${SITE_URL}/${r.region}`);
  assert.equal(langs["x-default"], `${SITE_URL}/`);
  const d = String(landingMetadata.description);
  assert.ok(d.length <= 155, `${d.length} characters`);
  assert.equal(findBannedCopy(d), null);
  assert.deepEqual((landingMetadata.openGraph as { images: unknown[] }).images, [DEFAULT_OG_IMAGE]);
  assert.equal((landingMetadata.twitter as { card: string }).card, "summary_large_image");
  const title = (landingMetadata.title as { absolute: string }).absolute;
  assert.ok(title.length <= 65, title);
});

test("landing page: static, a never-empty CTA box, a GET search form, real type links, the strip by suggested region", () => {
  const page = src("app/(site)/page.tsx");
  assert.doesNotMatch(page, /prisma|@\/lib\/db|@\/lib\/data"/, "no database");
  assert.match(page, /text-4xl[^"]*sm:text-6xl/);
  assert.match(page, /Pokémon sealed, in stock, <span className="text-brand">cheapest first\.<\/span>/);
  assert.match(page, /<div className="mt-6 flex h-12 justify-center sm:mt-8">\s*<RegionSuggest formId="landing-search" \/>/);
  assert.match(page, /<form\s+id="landing-search"\s+action=\{`\/\$\{X_DEFAULT_REGION\}\/sealed`\}\s+method="get"/);
  assert.match(page, /lg:grid-cols-7/);
  const suggest = src("components/RegionSuggest.tsx");
  assert.match(suggest, /Choose your region <span aria-hidden="true">↓<\/span>/);
  assert.match(suggest, /setAttribute\("action", `\/\$\{region \?\? X_DEFAULT_REGION\}\/sealed`\)/);
  assert.match(suggest, /placement="listings-landing"[\s\S]*regionKnown=\{false\}/);
  assert.match(suggest, /href=\{`\/\$\{to\}\/type\/\$\{t\.slug\}`\}/);
});

test("the share card exists as a route, with its bundled OFL face, and says the registry's numbers", () => {
  const og = src("app/opengraph-image.tsx");
  for (const f of ["BricolageGrotesque-ExtraBold.ttf", "BricolageGrotesque-SemiBold.ttf", "OFL.txt"]) assert.ok(existsSync(new URL(`../src/app/fonts/${f}`, import.meta.url)), f);
  const card = src("lib/og-card.tsx");
  assert.match(og, /ogCard\(/, "drawn by lib/og-card.tsx");
  assert.match(card, /fonts: \[/);
  assert.match(card, /weight: 800/);
  assert.doesNotMatch(card, /fetch\(|prisma|@\/lib\/db/, "no remote fetch, no database");
  assert.match(og, /Compare Pokémon[\s\S]*sealed prices across[\s\S]*\$\{STORES\.length\} stores[\s\S]*in \$\{REGION_LIST\.length\} regions/);
  assert.doesNotMatch(og, /fetch\(|prisma|@\/lib\/db/, "no remote fetch, no database");
  assert.equal(DEFAULT_OG_IMAGE.url, `${SITE_URL}/opengraph-image`);
});

// ─── Breadcrumbs ─────────────────────────────────────────────────────────────

test("Breadcrumbs: one '← parent' link below sm, the trail from sm, and the BreadcrumbList JSON-LD once", () => {
  const items = [{ href: "/us", label: "United States" }, { href: "/us/sets", label: "Sets" }, { label: "Pitch Black" }];
  assert.deepEqual(parentCrumb(items), { href: "/us/sets", label: "Sets" });
  assert.equal(parentCrumb([{ label: "Only" }]), null);
  const html = render(React.createElement(Breadcrumbs, { items }));
  assert.match(html, /<a class="-ml-1 inline-flex min-h-10 [^"]*sm:hidden" href="\/us\/sets"><span aria-hidden="true">←<\/span><span class="truncate">Sets<\/span><\/a>/);
  assert.match(html, /<ol class="hidden sm:flex /);
  assert.equal(html.match(/application\/ld\+json/g)?.length, 1);
  const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1]);
  assert.equal(ld["@type"], "BreadcrumbList");
  assert.equal(ld.itemListElement.length, 3);
  assert.equal(ld.itemListElement[1].item, `${SITE_URL}/us/sets`);
  assert.match(src("components/Breadcrumbs.tsx"), /breadcrumbJsonLd\(items\)/, "seo.ts's builder, not a copy");
});

// ─── Product card ────────────────────────────────────────────────────────────

const card = (o: Partial<ProductCardData> = {}): ProductCardData => ({
  slug: "pitch-black-elite-trainer-box",
  name: "Pitch Black Elite Trainer Box",
  productType: "Pokémon Center Elite Trainer Box",
  setCode: "me5",
  imageUrl: "https://cdn.shopify.com/s/files/1/0001/products/pb.jpg",
  lowestPriceCents: 5750,
  inStockStores: 12,
  listedStores: 19,
  marketplaceOpen: true,
  medianOpenCents: null,
  releaseDate: "2026-07-17",
  ...o,
});

test("ProductCard: photo on a plate, short type pill, sentence-case 'From' before the price, stock with its unit, the compare line", () => {
  const html = render(React.createElement(ProductCard, { p: card(), region: "us" }));
  assert.match(html, /class="plate relative m-2 aspect-square lg:mb-0 lg:aspect-\[8\/7\]"/);
  assert.match(html, /mix-blend-multiply/);
  assert.match(html, /max-w-\[calc\(100%-1\.5rem\)\] truncate[^"]*">PC ETB<\/span>/);
  assert.match(html, /<span class="text-xs font-medium text-muted">From<\/span><span class="tabular [^"]*">\$57\.50<\/span>/);
  assert.doesNotMatch(html, /uppercase tracking-wide text-faint">From|Last listed/);
  assert.match(html, />In stock · 12<span class="stock-unit"> stores<\/span><\/span>/);
  assert.match(html, /\+ TCGplayer/);
  assert.match(html, /Compare 20 prices&nbsp;→|Compare 20 prices →/);
  assert.match(html, /lg:opacity-0[^"]*lg:group-hover:opacity-100[^"]*lg:group-focus-visible:opacity-100/);
  assert.doesNotMatch(html, /ebay|tcgplayer\.com|data-ad/i, "no paid link inside a card");
  assert.equal(findBannedCopy(html.replace(/<[^>]+>/g, " ")), null);
});

test("ProductCard labels: short types, stock in words, and what the click opens", () => {
  assert.equal(shortTypeLabel("Pokémon Center Elite Trainer Box"), "PC ETB");
  assert.equal(shortTypeLabel("Elite Trainer Box"), "ETB");
  assert.equal(shortTypeLabel("Ultra-Premium Collection"), "UPC");
  assert.equal(shortTypeLabel("Build & Battle Box"), "B&B Box");
  assert.equal(shortTypeLabel("Build & Battle Stadium"), "B&B Stadium");
  assert.equal(shortTypeLabel("Booster Bundle"), "Bundle");
  assert.equal(shortTypeLabel("Booster Box"), "Booster Box");
  assert.deepEqual(cardStockLabel(card({ inStockStores: 1 }), false), ["In stock · 1", " store"]);
  assert.deepEqual(cardStockLabel(card(), true), ["Pre-order · 12", " stores"]);
  assert.deepEqual(cardStockLabel(card({ inStockStores: 0 }), false), ["On TCGplayer", ""]);
  assert.deepEqual(cardStockLabel(card({ inStockStores: 0, marketplaceOpen: false, listedStores: 3 }), false), ["Listed at 3", " stores"]);
  assert.deepEqual(cardStockLabel(card({ inStockStores: 0, marketplaceOpen: false, listedStores: 0 }), false), ["Not in stock", ""]);
  assert.equal(cardCompareLabel(card({ marketplaceOpen: false })), "Compare 19 prices");
  assert.equal(cardCompareLabel(card({ inStockStores: 1, listedStores: 1, marketplaceOpen: false })), "See the offer");
  assert.equal(cardCompareLabel(card({ inStockStores: 0, marketplaceOpen: false })), "See alternatives");
  const sold = render(React.createElement(ProductCard, { p: card({ inStockStores: 0, marketplaceOpen: false, listedStores: 3 }), region: "au" }));
  assert.match(sold, /text-faint">Sold out<\/span>/);
  assert.doesNotMatch(sold, />From</);
});

// ─── Empty states ────────────────────────────────────────────────────────────

test("Empty with actions: a designed state, each action a chip with an icon beside its link; without actions, unchanged", () => {
  const html = render(
    React.createElement(Empty, { actions: [{ href: "/au/type/booster-boxes", label: "All booster boxes" }, { href: "/au/releases", label: "Pre-orders" }], children: "Nothing in stock right now." }),
  );
  assert.match(html, /<li class="empty-action"><svg [^>]*>[\s\S]*?<\/svg><a class="chip min-h-10" href="\/au\/type\/booster-boxes">All booster boxes<\/a><\/li>/);
  assert.equal(html.match(/<svg /g)?.length, 3, "the state's icon and one per chip");
  assert.equal(emptyActionIcon("/au/releases"), "calendar");
  assert.equal(emptyActionIcon("/au/deals"), "tag");
  assert.equal(emptyActionIcon("/au/stores"), "store");
  assert.equal(emptyActionIcon("/au/sealed?q=etb"), "search");
  assert.equal(emptyActionIcon("/nz"), "arrow-right");
  assert.equal(render(React.createElement(Empty, { children: "Nothing." })), '<div class="card px-6 py-10 text-center text-muted">Nothing.</div>');
});
