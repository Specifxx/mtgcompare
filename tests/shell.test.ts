// The site's shell: the header (one 60px row, search at every width, the site's ONE navigation since 2026-11-13), the phone menu,
// the region footer, the root layout's fonts, the landing page's metadata, breadcrumbs, the product card and the empty state.
// Rendered on the server as a crawler sees them.
import { test } from "node:test";
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
import { Header, HEADER_NAV, headerNavItems } from "../src/components/Header";
import { openPreorderGuides } from "../src/lib/preorder-guides";
import { MENU_ROWS, MenuSheet } from "../src/components/MobileMenu";
import { navGroups, retargetGroups, retargetHref } from "../src/lib/nav";
import { isActivePath } from "../src/components/NavLink";
import { cardStockLabel, cardStockShort, ProductCard } from "../src/components/ProductCard";
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

test("Footer on a region page: Shop, Latest sets, Explore and MTG Compare, then the regions; every link internal", () => {
  const html = render(React.createElement(Footer, { region: "au" }));
  for (const t of ["Shop", "Latest sets", "Explore", "MTG Compare"]) assert.match(html, new RegExp(`<h2 class="eyebrow mb-2">${t}</h2>`), t);
  const links = hrefs(html);
  for (const h of [
    "/au/type/play-booster-boxes",
    "/au/type/collector-booster-boxes",
    "/au/type/bundles",
    "/au/type/commander-decks",
    "/au/type/secret-lair",
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
  // every link is internal now: the sister sites are listed once on /our-sites (2026-11-08)
  for (const h of links) if (h !== "mailto:compareempire@gmail.com") assert.match(h, /^\//, `${h} is internal`);
  assert.ok(links.includes("/our-sites"));
  assert.equal(footerColumns("au").length, 5); // Shop, Latest sets, Explore, Guides (every guide: no orphans), MTG Compare
});

test("Footer: the family inbox beside /contact (owner, 2026-11-01), the two-line disclosure, and no 'operated by MTG Compare'", () => {
  for (const region of ["us", null] as const) {
    const html = render(React.createElement(Footer, { region }));
    assert.match(html, /href="mailto:compareempire@gmail\.com"/);
    assert.match(html, /href="\/contact"/);
    assert.doesNotMatch(html, /@[a-z0-9.-]*riftcompare|riftcompare[a-z0-9.-]*@/i, "another brand's email address never shows in the chrome (the RiftCompare sister-site link may)");
    assert.match(html, /eBay and TCGplayer links are affiliate links and are marked where they appear\.<br\/>No store pays to be listed or to rank\./);
    assert.match(html, /How we make money/);
    assert.match(html, /Prices and stock are read from each store about twice a day; the store’s own page is final\./);
    // the footer links the history-backed /back-in-stock page by its name; nothing else history-backed is allowed
    assert.equal(findBannedCopy(html.replace(/<[^>]+>/g, " "), { history: true }), null);
    assert.equal(findBannedCopy(html.replace(/<a [^>]*href="\/[a-z]{2}\/back-in-stock"[^>]*>Back in stock<\/a>/g, " ").replace(/<[^>]+>/g, " ")), null);
    if (OPERATOR === SITE_NAME) assert.doesNotMatch(html, /operated by/i, "never the circular 'MTG Compare is operated by MTG Compare'");
  }
  assert.match(src("components/Footer.tsx"), /OPERATOR !== SITE_NAME && ` Operated by \$\{OPERATOR\}\.`/);
});

test("Footer with no region: Regions and MTG Compare columns only, and no region-scoped link", () => {
  const html = render(React.createElement(Footer, { region: null }));
  assert.deepEqual(
    footerColumns(null).map((c) => c.title),
    ["Regions", "MTG Compare"],
  );
  assert.doesNotMatch(html, /Latest sets|>Shop<|>Explore</);
  const links = hrefs(html);
  for (const r of REGION_LIST) assert.ok(links.includes(`/${r.region}`), r.region);
  assert.ok(!links.some((h) => /^\/[a-z]{2}\//.test(h)), "nothing under a region");
});

test("the footer is drawn by each layout after its <main> (and by the 404 and error pages), not by the root layout", () => {
  // Directly after <main> since 2026-11-13: there is no sidebar, so no row around the sidebar and the page.
  assert.match(src("app/[region]/layout.tsx"), /<\/main>\s*<Footer region=\{r\.region\}( listed=\{listed\})? \/>/);
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
  // On the page's own ground, blurred; its line fades in once the page scrolls under it (globals.css .hdr).
  assert.match(html, /^<header class="hdr sticky top-0 z-40 h-\[var\(--hdr\)\] border-b border-line bg-bg\/80 backdrop-blur-xl">/);
  assert.match(html, /^<header[^>]*><div class="page flex h-full items-center gap-2 sm:gap-3 xl:gap-4">/, "the header's row is the page's column");
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

test("Header nav (lg and up): four sections, Deals · All sealed · Sets · Guides, each to its region path with its menu", () => {
  // Four and no more (the minimal look, 2026-11-13): the row had seven entries with the seasonal sale, Stores and eBay's link.
  // Stores is in the Guides menu; the sale pages lead the Deals menu in season.
  assert.deepEqual(
    HEADER_NAV.map((n) => n.label),
    ["Deals", "All sealed", "Sets", "Guides"],
  );
  assert.ok(headerNavItems("uk").every((n) => n.menu && n.menu.length > 0), "every section opens a menu");
  const html = render(React.createElement(Header, { region: "uk" }));
  const nav = /<nav class="hidden items-center gap-0\.5 lg:flex" aria-label="Main">([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? "";
  // While a set is on pre-order its hub leads the Deals menu; the release calendar is there too.
  const pre = openPreorderGuides()[0];
  for (const [href, label] of [
    ["/uk/deals", "Deals"],
    ["/uk/sealed", "All sealed"],
    ["/uk/sets", "Sets"],
    pre ? [`/uk/preorders/${pre.set.slug}`, `${pre.set.name} pre-orders`] : ["/uk/releases", "Release calendar"],
    ["/uk/guides", "Guides"],
    ["/uk/stores", "Stores we compare"],
    ["/uk/guides/mtg-booster-box-prices", "Booster box prices"],
  ])
    assert.match(nav, new RegExp(`href="${href}"[^>]*>${label}</a>`), label);
  // No ad in the navigation: eBay's labelled search link left the row (ads are in the page, labelled, never in the menu row).
  assert.doesNotMatch(html, /data-ad="header"|ebay/i, "no eBay link in the header");
  assert.doesNotMatch(src("components/Ebay.tsx"), /EbayNavLink/);
});

test("Header with no region: the whole header, built for the default region (the browser moves it to the visitor's)", () => {
  const html = render(React.createElement(Header, { region: null }));
  assert.match(html, /role="search"/, "search from the first page");
  const nav = /<nav class="hidden items-center gap-0\.5 lg:flex" aria-label="Main">([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? "";
  const pre = openPreorderGuides()[0];
  for (const h of ["/us/deals", "/us/sealed", "/us/sets", pre ? `/us/preorders/${pre.set.slug}` : "/us/releases", "/us/guides", "/us/stores", "/blog"]) assert.match(nav, new RegExp(`href="${h}"`), h);
  assert.doesNotMatch(html, /data-ad="header"/, "no ad in the header");
  assert.match(html, /aria-label="Menu"/);
  assert.match(html, /aria-label="Region: United States\. Change region"/);
  assert.doesNotMatch(html, /Continue to|Choose your region/);
});

test("the menu's groups: product types, sets, deals and the rest, every link a real region path; no sidebar draws them any more", () => {
  const groups = navGroups("au", "2026-10-28");
  assert.deepEqual(groups.map((g) => g.title), ["Shop by product", "Sets", "Sets by series", "Deals & stock", "More"]);
  for (const l of groups.flatMap((g) => g.links)) assert.match(l.href, /^\/au\/|^\/blog$|^\/creators$|^\/forum$/, l.href);
  assert.deepEqual(groups[1].links[0], { href: "/au/preorders/star-trek", label: "Star Trek pre-orders" }, "an open pre-order hub leads the sets");
  // Every open pre-order hub leads (sets found by the import included: lib/set-discovery.ts), then the newest released set.
  const firstSet = (g: typeof groups) => g[1].links.find((l) => !l.href.includes("/preorders/"))!;
  assert.equal(firstSet(groups).label, "Reality Fracture", "then the newest released set");
  const releaseDay = navGroups("au", "2026-11-13")[1].links;
  assert.ok(!releaseDay.some((l) => l.href === "/au/preorders/star-trek"), "the hub is gone on release day");
  assert.equal(firstSet(navGroups("au", "2026-11-13")).label, "Star Trek", "the set leads as the newest released");
  assert.equal(groups[1].links.at(-1)!.href, "/au/sets");
  // By series (era): each to its block on the sets page.
  assert.ok(groups[2].links.length >= 3 && groups[2].links.every((l) => /^\/au\/sets#[a-z0-9-]+$/.test(l.href)), "series links");
  assert.ok(navGroups("us", "2026-11-25")[3].links.some((l) => l.label === "Black Friday"), "Black Friday in season");
  assert.ok(!groups[3].links.some((l) => l.label === "Black Friday"));
  // ONE navigation (owner, 2026-11-13: "we're making things too complicated"): the desktop sidebar that repeated the header's menus
  // down the left of every page is gone. The phone menu draws these groups; the header's mega menus and the footer carry the links
  // on a desktop.
  assert.ok(!existsSync(new URL("../src/components/SideNav.tsx", import.meta.url)), "no sidebar component");
  for (const f of ["app/[region]/layout.tsx", "app/(site)/layout.tsx"]) {
    assert.doesNotMatch(src(f), /<SideNav|<SoftSideNav|<aside/, `${f}: no sidebar`);
    assert.match(src(f), /<main id="main" className="min-w-0 flex-1">/, `${f}: the page is the whole row`);
  }
  assert.match(src("components/Header.tsx"), /<MobileMenu region=\{region\} groups=\{groups\} built=\{built\} className="lg:hidden" \/>/, "the menu button's sheet, below lg");
  // What only the sidebar linked on a desktop is in the header's menus now.
  const menus = headerNavItems("au", "2026-10-28").flatMap((n) => [n.href, ...(n.menu ?? []).flatMap((c) => c.links.map((l) => l.href))]);
  for (const h of ["/au/type/commander-decks", "/au/type/secret-lair", "/au/sets", "/au/deals", "/au/back-in-stock", "/au/price-moves", "/au/out-of-print", "/au/cheapest-packs", "/au/this-week", "/au/releases", "/au/guides", "/au/guides/mtg-booster-box-prices", "/au/tools", "/au/stores", "/blog", "/forum", "/creators"])
    assert.ok(menus.includes(h), `${h} is in a header menu`);
  // the same links in another region; a link outside a region stays put
  assert.equal(retargetHref("/us/type/bundles", "nz"), "/nz/type/bundles");
  assert.equal(retargetHref("/us", "nz"), "/nz");
  assert.equal(retargetHref("/blog", "nz"), "/blog");
  assert.equal(retargetHref("/usx/a", "nz"), "/usx/a");
  assert.deepEqual(retargetGroups(navGroups("us", "2026-10-28"), "au"), groups);
});

test("NavLink's current-section logic (aria-current='page'): whole segments, and the paths a section also covers", () => {
  assert.equal(isActivePath("/us/sets", "/us/sets"), true);
  assert.equal(isActivePath("/us/sets/bloomburrow", "/us/sets"), true);
  assert.equal(isActivePath("/us/sets/", "/us/sets"), true);
  assert.equal(isActivePath("/us/setsx", "/us/sets"), false);
  assert.equal(isActivePath("/us", "/us/sets"), false);
  assert.equal(isActivePath("/us/sealed/page/2", "/us/sealed"), true);
  assert.equal(isActivePath("/us/type/secret-lair", "/us/sealed", ["/us/type"]), true);
  assert.equal(isActivePath("/us/sealed?q=cbb", "/us/sealed"), true);
  assert.equal(isActivePath(null, "/us/sealed"), false);
  assert.equal(isActivePath("/au/sets", "/us/sets"), false);
});

test("the phone menu: every group of lib/nav.ts under the region, then the regions, which switch to the same page", () => {
  assert.ok(MENU_ROWS.length >= 10, "the 404's tiles");
  // The sheet's contents render on the first open: the header's server HTML has the empty <dialog> only.
  assert.match(render(React.createElement(Header, { region: "ca" })), /<dialog id="site-menu" data-menu="" aria-label="Menu" class="menu-sheet [^"]*"><\/dialog>/);
  const groups = navGroups("ca", "2026-10-28");
  const sheet = render(React.createElement(MenuSheet, { region: "ca", groups, pathname: "/ca/stores", onClose() {} }));
  assert.match(sheet, /aria-current="page"[^>]*href="\/ca\/stores"|href="\/ca\/stores"[^>]*aria-current="page"/, "the current section is marked");
  for (const t of ["Shop by product", "Sets", "Sets by series", "Deals &amp; stock", "More"]) assert.match(sheet, new RegExp(`>${t}</h2>`), t);
  for (const l of groups.flatMap((g) => g.links)) assert.ok(hrefs(sheet).includes(l.href), l.href);
  for (const p of ["/deals", "/this-week", "/back-in-stock", "/price-moves", "/out-of-print", "/sealed", "/type/play-booster-boxes", "/type/collector-booster-boxes", "/type/bundles", "/type/commander-decks", "/cheapest-packs", "/sets", "/releases", "/guides", "/tools", "/stores"])
    assert.ok(hrefs(sheet).includes(`/ca${p}`), p);
  assert.equal(sheet.match(/class="flag text-2xl"/g)?.length, 7, "seven flag tiles");
  assert.ok(hrefs(sheet).includes("/uk/stores"), "a region tile goes to the same page there");
  // a soft sheet (a page with no region): every tile to the region's home
  const soft = render(React.createElement(MenuSheet, { region: "au", groups: navGroups("au", "2026-10-28"), pathname: "/about", onClose() {}, soft: true }));
  for (const r of REGION_LIST) assert.ok(hrefs(soft).includes(`/${r.region}`), r.region);
  assert.equal(pathAfterRegion("/au/sets/bloomburrow"), "/sets/bloomburrow");
  assert.equal(regionSwitchHref("/au/sets/bloomburrow", "uk", "au"), "/uk/sets/bloomburrow");
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

test("landing page: per request behind the CDN, short: a hero of words and a search, the region's ten, one ad block, nothing else", () => {
  const page = src("app/(site)/page.tsx");
  assert.match(page, /^export const dynamic = "force-dynamic";/m);
  assert.doesNotMatch(page, /prisma|@\/lib\/db|@\/lib\/data"/, "no database");
  // The hero (components/home/Hero.tsx, owner 2026-11-13: "get rid of the products on the hero"): the headline, one line, the search,
  // the region row and six ways in. No product, no photo, no card and no ad in it.
  assert.match(page, /<h1 className="hero-h1 hero-h1-long rise-solid">\s*MTG booster box, bundle &amp; Commander deck prices, <span className="text-brand">cheapest first\.<\/span>/);
  const hero = page.slice(page.indexOf("<Hero>"), page.indexOf("</Hero>"));
  assert.ok(hero.length > 0, "the hero");
  assert.doesNotMatch(hero, /HeroCards|SoftHeroCards|ProductCard|ProductGrid|HomeRegionGrid|LandingAds|<img|\{initialPicks\}/, "no products and no ad in the hero");
  for (const f of ["components/home/HeroCards.tsx", "components/home/SoftHeroCards.tsx"]) assert.ok(!existsSync(new URL(`../src/${f}`, import.meta.url)), `${f} is gone`);
  // No "Continue to <region>" step (owner, 2026-10-28): the search, then the shortcuts in the visitor's region.
  assert.match(page, /<form\s+id="landing-search"\s+action=\{`\/\$\{X_DEFAULT_REGION\}\/sealed`\}\s+method="get"/);
  assert.match(page, /<\/form>[\s\S]*<RegionChips [^>]*\/>\s*<SoftWaysIn formId="landing-search" links=\{HERO_LINKS\} \/>/);
  // Six ways in: four product types, deals and pre-orders. The "Coming soon" block that sat on this page left on 2026-11-13 (the owner
  // had asked for it short, not unreachable): pre-orders are the sixth tile, one tap from the hero.
  const ways = page.slice(page.indexOf("const HERO_LINKS"), page.indexOf("];", page.indexOf("const HERO_LINKS")));
  assert.deepEqual(
    [...ways.matchAll(/sectionHref\(X_DEFAULT_REGION, "(\w+)"\), label: "([^"]+)", icon: "(\w+)"/g)].map((m) => m.slice(1)),
    [
      ["boosterBoxes", "Play booster boxes", "box"],
      ["collectorBoxes", "Collector boxes", "collector"],
      ["commanderDecks", "Commander decks", "deck"],
      ["bundles", "Bundles", "bundle"],
      ["deals", "Deals", "tag"],
      ["releases", "Pre-orders", "calendar"],
    ],
  );
  // The products straight under the hero, then the page's ONE ad block (the eBay + TCGplayer banner sat between the hero and them).
  assert.match(page, /<HomeRegionGrid initial=\{initialPicks\} \/>/);
  assert.ok(page.indexOf("</Hero>") < page.indexOf("<HomeRegionGrid"), "the products come after the hero, not in it");
  assert.ok(page.indexOf("<HomeRegionGrid") < page.indexOf("<LandingAds"), "the ad block is under the products");
  assert.equal((page.match(/<LandingAds/g) ?? []).length, 1, "one ad block");
  // What moved to /about, the guides index and the region homes stays off the landing page.
  assert.doesNotMatch(page, /FAQPage|faqJsonLd|GuideCard|MarketReport|SuggestedTypeLinks|EbayStrip|AdSlot/);
  // The minimal look (2026-11-13): no paragraph on how stores are ranked (the footer of every page says it and links /about), no
  // "Coming soon" block, no Halloween dressing in the hero.
  assert.doesNotMatch(page, /ComingSoon|fair-h|How it works|HalloweenDecor|InnistradComing/);
  assert.match(render(React.createElement(Footer, { region: null })), /No store pays to be listed or to rank\./, "the footer still says how stores are ranked");
  for (const f of ["components/ComingSoon.tsx", "components/ComingSoonSwitch.tsx", "lib/coming-soon.ts", "lib/coming-soon-data.ts"]) assert.ok(!existsSync(new URL(`../src/${f}`, import.meta.url)), `${f} is gone`);
  assert.equal((page.match(/<section/g) ?? []).length, 0, "the hero and the grid are their own components' sections");
  assert.match(src("components/home/Hero.tsx"), /<section className="hero">/);
  // The hero's ways in and the search move to the visitor's region in the browser (components/home/SoftWaysIn.tsx).
  const soft = src("components/home/SoftWaysIn.tsx");
  assert.match(soft, /^"use client";/);
  assert.doesNotMatch(soft, /> Continue to \{|Choose your region <span/);
  assert.match(soft, /setAttribute\("action", `\/\$\{region\}\/sealed`\)/);
  assert.match(soft, /retargetHref\(l\.href, region\)/);
  const suggest = src("components/RegionSuggest.tsx");
  assert.doesNotMatch(suggest, /> Continue to \{|Choose your region <span/);
  assert.match(suggest, /href=\{`\/\$\{to\}\/type\/\$\{t\.slug\}`\}/);
});

test("/about carries what the landing page used to: the FAQ with its FAQPage JSON-LD, what we compare, the regions", () => {
  const about = src("app/(site)/about/page.tsx");
  assert.match(about, /<h3 className="font-semibold">\{f\.q\}<\/h3>/, "FAQ questions are real h3s");
  assert.match(about, /jsonLd\(faqJsonLd\(FAQ\)\)/, "the FAQPage markup only where the answers are shown");
  assert.match(about, /<SuggestedTypeLinks types=\{PRODUCT_TYPES/);
  assert.match(about, /COUNTRY_GUIDE\.path/);
  assert.match(about, /href=\{`\/\$\{r\.region\}\/stores`\}/);
  assert.doesNotMatch(about, /one on the landing page/, "the landing page carries no eBay strip now");
});

test("the share card exists as a route, with its bundled OFL face, and says the registry's numbers", () => {
  const og = src("app/opengraph-image.tsx");
  for (const f of ["BricolageGrotesque-ExtraBold.ttf", "BricolageGrotesque-SemiBold.ttf", "OFL.txt"]) assert.ok(existsSync(new URL(`../src/app/fonts/${f}`, import.meta.url)), f);
  const card = src("lib/og-card.tsx");
  assert.match(og, /ogCard\(/, "drawn by lib/og-card.tsx");
  assert.match(card, /fonts: \[/);
  assert.match(card, /weight: 800/);
  assert.doesNotMatch(card, /fetch\(|prisma|@\/lib\/db/, "no remote fetch, no database");
  assert.match(og, /Compare Magic[\s\S]*sealed prices across[\s\S]*\$\{STORES\.length\} stores[\s\S]*in \$\{REGION_LIST\.length\} regions/);
  assert.doesNotMatch(og, /fetch\(|prisma|@\/lib\/db/, "no remote fetch, no database");
  assert.equal(DEFAULT_OG_IMAGE.url, `${SITE_URL}/opengraph-image`);
});

// ─── Breadcrumbs ─────────────────────────────────────────────────────────────

test("Breadcrumbs: one '← parent' link below sm, the trail from sm, and the BreadcrumbList JSON-LD once", () => {
  const items = [{ href: "/us", label: "United States" }, { href: "/us/sets", label: "Sets" }, { label: "Bloomburrow" }];
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
  slug: "edge-of-eternities-collector-booster-box",
  name: "Edge of Eternities Collector Booster Box",
  productType: "Collector Booster Box",
  setCode: "eoe",
  imageUrl: "https://cdn.shopify.com/s/files/1/0001/products/eoe.jpg",
  lowestPriceCents: 5750,
  inStockStores: 12,
  listedStores: 19,
  marketplaceOpen: true,
  medianOpenCents: null,
  releaseDate: "2026-07-17",
  ...o,
});

test("ProductCard: a photo on its plate, the name, one stock line and the price; one badge at most; no pill, cue or second line", () => {
  // The minimal card (owner, 2026-11-13: "cull … all the display aesthetics"). Short classes (globals.css .pc-*); the CSS is pinned below.
  const html = render(React.createElement(ProductCard, { p: card(), region: "us" }));
  assert.match(html, /^<div class="flex flex-col"><a [^>]*class="group pc-link" href="\/us\/p\/edge-of-eternities-collector-booster-box">/, "the whole card is one link to the product page");
  // A plain click opens the quick view: every attribute it reads is still on the link.
  assert.match(html, /<a data-qv="edge-of-eternities-collector-booster-box" data-qv-region="us" data-qv-name="Edge of Eternities Collector Booster Box" data-qv-sub="Collector Booster Box" data-qv-img="[^"]+"/);
  assert.match(html, /class="plate pc-plate"/);
  assert.match(html, /class="pc-img"/);
  assert.match(html, /<h3 class="pc-name">Edge of Eternities Collector Booster Box<\/h3>/);
  assert.match(html, /<span class="text-xs font-medium text-muted">From<\/span><span class="pc-price">\$57\.50<\/span>/);
  assert.doesNotMatch(html, /uppercase tracking-wide text-faint">From|Last listed/);
  // One stock line: where it can be bought and at how many stores. The whole sentence is the line's title.
  assert.match(html, />In stock · 12<span class="stock-unit"> stores<\/span><\/span>/);
  assert.match(html, /<p class="pc-stock" title="In stock at 12 of 19 stores and on TCGplayer">/);
  // stock first: the pill comes before the price in the markup
  assert.ok(html.indexOf("In stock · 12") < html.indexOf(">From<"), "stock before price");
  // The price per pack, where the product line fixes a pack count (a Collector Booster Box holds 12).
  assert.match(html, /<span class="pc-per">\$4\.79 \/ pack<\/span>/);
  // What the card no longer carries: the type pill (the name says the type), "+ TCGplayer" and the "Compare N prices" cue.
  assert.doesNotMatch(html, /pc-type|pc-cue|pc-save|pc-msrp|pc-tcg|Compare \d+ prices|See the offer|See alternatives|>\+ TCGplayer</);
  // One badge at most, on the photo, and only for a real signal: none here (no median, and Wizards published no MSRP for this box).
  assert.equal((html.match(/pc-badge/g) ?? []).length, 0, "no badge without a real signal");
  // The saving against the median of the stores that have it (10% or more, three stores or more).
  const deal = render(React.createElement(ProductCard, { p: card({ medianOpenCents: 7000 }), region: "us" }));
  assert.match(deal, /<span class="pc-badge" title="18% below the median of 12 stores">−18%<\/span>/);
  assert.equal((deal.match(/pc-badge/g) ?? []).length, 1);
  // US only: under Wizards' published MSRP (lib/rrp.ts: a Star Trek Bundle is $69.99). Elsewhere, and at or over MSRP, none.
  const bundle = { slug: "star-trek-bundle", name: "Star Trek Bundle", productType: "Bundle", setCode: "trk" };
  assert.match(render(React.createElement(ProductCard, { p: card(bundle), region: "us" })), /<span class="pc-badge">Below MSRP<\/span>/);
  assert.equal((render(React.createElement(ProductCard, { p: card(bundle), region: "au" })).match(/pc-badge/g) ?? []).length, 0, "no MSRP outside the US");
  assert.equal((render(React.createElement(ProductCard, { p: card({ ...bundle, lowestPriceCents: 7999 }), region: "us" })).match(/pc-badge/g) ?? []).length, 0, "over MSRP is not a badge");
  // The median saving comes before the MSRP badge: still one badge.
  const both = render(React.createElement(ProductCard, { p: card({ ...bundle, medianOpenCents: 7000 }), region: "us" }));
  assert.match(both, /<span class="pc-badge" title="18% below the median of 12 stores">−18%<\/span>/);
  assert.equal((both.match(/pc-badge/g) ?? []).length, 1);
  const css = src("app/globals.css");
  assert.match(css, /\.pc-plate \{\s*@apply relative aspect-square rounded-2xl /, "a square plate, no frame around the card");
  assert.match(css, /\.pc-img \{\s*@apply [^;]*mix-blend-multiply/);
  // A phone's two-column card stacks the price and the price per pack (side by side they ran into each other); from sm they share a line.
  assert.match(css, /\.pc-row \{\s*@apply [^;]*\bflex-col\b[^;]*\bsm:flex-row\b[^;]*\bsm:flex-wrap\b/);
  assert.doesNotMatch(css, /\.pc-cue|\.pc-type|\.pc-save|\.pc-msrp|\.pc-tcg/);
  assert.doesNotMatch(html, /ebay|tcgplayer\.com|data-ad/i, "no paid link inside a card");
  assert.equal(findBannedCopy(html.replace(/<[^>]+>/g, " ")), null);
});

test("ProductCard labels: the short stock line, and the whole sentence it stands for", () => {
  assert.deepEqual(cardStockShort(card(), false), ["In stock · 12", " stores"]);
  assert.deepEqual(cardStockShort(card({ inStockStores: 1 }), false), ["In stock · 1", " store"]);
  assert.deepEqual(cardStockShort(card(), true), ["Pre-order · 12", " stores"]);
  assert.deepEqual(cardStockShort(card({ inStockStores: 0 }), false), ["On TCGplayer", ""]);
  assert.deepEqual(cardStockShort(card({ inStockStores: 0, marketplaceOpen: false, listedStores: 3 }), false), ["Sold out", ""]);
  assert.deepEqual(cardStockShort(card({ inStockStores: 0, marketplaceOpen: false, listedStores: 0 }), false), ["Not in stock", ""]);
  // The line's title: the sentence the old card printed.
  assert.deepEqual(cardStockLabel(card({ inStockStores: 1 }), false), ["In stock at 1 of 19", " stores"]);
  assert.deepEqual(cardStockLabel(card(), true), ["Pre-order at 12 of 19", " stores"]);
  assert.deepEqual(cardStockLabel(card({ inStockStores: 0 }), false), ["On TCGplayer", ""]);
  assert.deepEqual(cardStockLabel(card({ inStockStores: 0, marketplaceOpen: false, listedStores: 3 }), false), ["Sold out at all 3", " stores"]);
  assert.deepEqual(cardStockLabel(card({ inStockStores: 0, marketplaceOpen: false, listedStores: 0 }), false), ["Not in stock", ""]);
  assert.deepEqual(cardStockLabel(card({ inStockStores: 0, marketplaceOpen: false, listedStores: 1 }), false), ["Sold out at 1", " store"]);
  const sold = render(React.createElement(ProductCard, { p: card({ inStockStores: 0, marketplaceOpen: false, listedStores: 3 }), region: "au" }));
  assert.match(sold, /<p class="pc-stock" title="Sold out at all 3 stores">/);
  assert.match(sold, />Sold out<\/span>/);
  assert.match(sold, /No price while sold out/);
  assert.doesNotMatch(sold, />From</);
});

// ─── Empty states ────────────────────────────────────────────────────────────

test("Empty with actions: a designed state, each action a chip with an icon beside its link; without actions, unchanged", () => {
  const html = render(
    React.createElement(Empty, { actions: [{ href: "/au/type/play-booster-boxes", label: "All booster boxes" }, { href: "/au/releases", label: "Pre-orders" }], children: "Nothing in stock right now." }),
  );
  assert.match(html, /<li class="empty-action"><svg [^>]*>[\s\S]*?<\/svg><a class="chip min-h-10" href="\/au\/type\/play-booster-boxes">All booster boxes<\/a><\/li>/);
  assert.equal(html.match(/<svg /g)?.length, 3, "the state's icon and one per chip");
  assert.equal(emptyActionIcon("/au/releases"), "calendar");
  assert.equal(emptyActionIcon("/au/deals"), "tag");
  assert.equal(emptyActionIcon("/au/stores"), "store");
  assert.equal(emptyActionIcon("/au/sealed?q=cbb"), "search");
  assert.equal(emptyActionIcon("/nz"), "arrow-right");
  assert.equal(render(React.createElement(Empty, { children: "Nothing." })), '<div class="card px-6 py-10 text-center text-muted">Nothing.</div>');
});
