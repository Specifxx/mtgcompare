// Crawlers stop finding the thin pages (DECISIONS.md, "Crawlers stop finding the thin pages", 2026-10-19): a THIN printing (outside the
// relevant quarter, which never reaches under INDEX_FLOOR_CENTS) is noindex and out of every sitemap already; list pages now draw it
// without an href, and a commander hub with no indexable printing and no deck leaves the map and the index too.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isIndexable } from "../src/lib/track";
import { PRICE_MASK } from "../src/lib/constants";
import { tileCard } from "../src/lib/tile";
import { checklistGuideRows } from "../src/lib/set-price-guide";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("a THIN printing is never a sitemap candidate (the cards section is exactly isIndexable)", () => {
  const L = PRICE_MASK.LISTED, T = PRICE_MASK.TRACKN;
  assert.equal(isIndexable(L | T, 0), true);
  assert.equal(isIndexable(L | T | PRICE_MASK.THIN, 0), false);
  assert.match(code(read("src/lib/import.ts")), /cards: section\("cards", indexable\.map\(\(r\) => r\.c\[1\]\)\)/);
});

test("CardAnchor: a thin card is a link for people (QuickView, Enter, a modified or middle click) with no href for crawlers", () => {
  const src = code(read("src/components/CardQuickLink.tsx"));
  const fn = src.slice(src.indexOf("export function CardAnchor"), src.indexOf("export default function CardQuickLink"));
  assert.match(fn, /if \(!thin\) return <Link href=\{href\}/);
  const thinBranch = fn.slice(fn.indexOf('role="link"') - 40);
  assert.doesNotMatch(thinBranch, /\shref=/, "the thin branch renders no href");
  assert.match(thinBranch, /tabIndex=\{0\}/);
  assert.match(thinBranch, /onKeyDown/);
  assert.match(thinBranch, /data-card-href=\{href\}/);
  assert.match(src, /<CardAnchor href=\{finish === "F" \? `\/card\/\$\{slug\}\?finish=foil` : `\/card\/\$\{slug\}`\} thin=\{thin\}/, "CardQuickLink routes through it");
});

test("every list surface hands the THIN bit to the link: tiles, the link grid, the set price guide, the price guide table", () => {
  assert.match(read("src/components/CardTileClient.tsx"), /<CardAnchor\s+href=\{`\/card\/\$\{card\.slug\}`\}\s+thin=\{card\.thin\}/);
  assert.doesNotMatch(code(read("src/components/CardTileClient.tsx")), /<Link\b/);
  assert.match(read("src/components/CardLinkGrid.tsx"), /<CardQuickLink key=\{card\.id\} slug=\{card\.slug\} thin=\{card\.thin\}/);
  assert.match(read("src/components/sets/SetPriceGuide.tsx"), /<CardQuickLink slug=\{r\.slug\} thin=\{r\.thin\}/);
  assert.match(read("src/app/price-guide/page.tsx"), /slug=\{x\.slug\}\s+thin=\{x\.thin\}/);
  // The bit survives the trims on the way to the browser.
  const base = { id: 1, slug: "a", name: "A", number: "1", rarity: "C", variant: null, printing: "standard", hasImage: true, marketUsd: 10, low: { US: null, AU: null, UK: null, SG: null, CA: null, EU: null }, stores: { US: 0, AU: 0, UK: 0, SG: 0, CA: 0, EU: 0 } } as unknown as Parameters<typeof tileCard>[0];
  assert.equal(tileCard({ ...base, thin: true }).thin, true);
  assert.equal("thin" in tileCard(base), false);
  const rows = checklistGuideRows([{ id: 1, slug: "a", name: "A", variant: null, rarity: "C", number: "1", minCents: null, stores: 0, otherSource: false, thin: true }, { id: 2, slug: "b", name: "B", variant: null, rarity: "C", number: "2", minCents: 100, stores: 1, otherSource: false }] as unknown as Parameters<typeof checklistGuideRows>[0]);
  assert.deepEqual(rows.map((r) => [r.slug, r.thin ?? false]).sort(), [["a", true], ["b", false]]);
});

test("a commander hub whose every printing is THIN and that has no deck is noindex and out of the commanders sitemap", () => {
  assert.match(code(read("src/lib/import.ts")), /commanders: section\("commanders", oracleSlugs\.filter\(\(o\) => o\.flags & ORACLE_FLAGS\.COMMANDER && o\.nPrint > 0 && idxOracles\.has\(o\.no\)\)/);
  assert.match(code(read("src/app/commanders/[slug]/page.tsx")), /\.\.\.\(c\.printings\.some\(\(p\) => !p\.thin\) \|\| c\.decks\.length \? \{\} : \{ robots: \{ index: false, follow: true \} \}\)/);
});
