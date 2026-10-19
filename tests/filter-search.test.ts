// tests/filter-search.test.ts (owner WP07): the search box of the card filter panel (BrowseFilters, 2026-10-19). The owner asked for a search INSIDE the filters, on
// desktop and in the phone filter sheet, so a visitor need not use the header search. The box writes the same `q` the header does, ANDed with every other filter.
// What the words narrow on each page is pinned in tests/search.test.ts; the URL the box writes in tests/filter-chips.test.ts (withSearch, canonical).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { BrowseFilters } from "../src/components/BrowseFilters";
import { parseBrowse, type SearchParams } from "../src/lib/browse";

// The components are compiled with the classic JSX transform here (tsconfig "jsx": "preserve"), which wants React in scope.
(globalThis as { React?: unknown }).React = React;

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const NOOP_ROUTER = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };

/** The panel's server render for a URL, inside the two contexts next/navigation reads (the app router and the search params). */
function panel(query: string, props: { action?: string; hide?: string[] } = {}): string {
  const sp = new URLSearchParams(query), raw: SearchParams = {};
  for (const k of new Set(sp.keys())) { const v = sp.getAll(k); raw[k] = v.length > 1 ? v : v[0]; }
  const tree = createElement(BrowseFilters, { q: parseBrowse(raw), sets: [], country: "US", ...props });
  return renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: NOOP_ROUTER as never }, createElement(SearchParamsContext.Provider, { value: sp as never }, tree)));
}
const count = (html: string, re: RegExp): number => (html.match(new RegExp(re.source, "g")) ?? []).length;
const searchBox = (html: string): string | undefined => /<input[^>]*id="filters-q"[^>]*>/.exec(html)?.[0];

test("the card panel opens with a labelled search box that IS the form's `q` field: type=search, Enter says search, the words from the URL, no hidden copy", () => {
  const html = panel("q=sol+ring&color=red");
  const box = searchBox(html);
  assert.ok(box, "the box renders");
  assert.match(html, /<label[^>]*for="filters-q"[^>]*>Search<\/label>/, "a real label, \"Search\": not \"Keyword\", which is the keyword-ability filter (?keyword=flying)");
  assert.match(box!, /type="search"/);
  assert.match(box!, /name="q"/, "a named field of the GET form: without JavaScript the bottom button submits the words with the filters");
  assert.match(box!, /value="sol ring"/);
  assert.match(box!, /enterKeyHint="search"/i);
  assert.match(box!, /maxLength="80"/i, "parseBrowse reads no more than 80 characters");
  assert.match(box!, /aria-describedby="filters-q-hint"/);
  assert.match(box!, /class="input w-full"/, "the panel's own field style");
  assert.equal(count(html, /name="q"/), 1, "the old hidden `q` input is gone: one field, so a submit never sends the words twice");
  assert.ok(html.indexOf("filters-q") > html.indexOf('<form id="filters" action="/browse" method="get"') && html.indexOf("filters-q") < html.indexOf("Market price"), "inside the form, at the top of the panel, above the first section");
  assert.match(html, /Clear \(2\)/, "the words count as a filter of the panel (with the colour)");
  assert.doesNotMatch(html, /keyword/i, "the box is the free-text search; the keyword-ability filter is another key");
});

test("the box promises only what the planner matches: names (or part of one), set codes, a set and number; a set's page promises names in that set; never rules text", () => {
  const all = searchBox(panel(""))!;
  assert.match(all, /placeholder="Card name, set or “mh3 6”"/);
  assert.match(all, /value=""/);
  assert.match(panel(""), /A name or part of one, a set code, or a set and number\. Not rules text\./);
  const set = panel("", { action: "/sets/mh3-modern-horizons-3", hide: ["set"] });
  assert.match(searchBox(set)!, /placeholder="Card name"/, "on one set's page another set's code or number finds nothing, so it is not offered");
  assert.match(set, /A name in this set, or part of one\. Not rules text\./);
  assert.match(set, /<form id="filters" action="\/sets\/mh3-modern-horizons-3" method="get"/);
  // what the planner reads (data/search.ts, lib/search.ts parseSearch): names, faces, printed names, nicknames, set codes, a set and number, finish and treatment words; no oracle text
  const planner = read("src/lib/data/search.ts") + read("src/lib/search.ts");
  assert.doesNotMatch(planner, /oracleText|oracle_text|typeLine/, "the planner reads no rules text and no type line: the hint says so");
});

test("a panel whose page has its own search box (the price guide's toolbar) carries the words as a hidden field instead, and its Clear leaves them alone", () => {
  const html = panel("q=sol+ring&color=red", { action: "/price-guide", hide: ["q"] });
  assert.equal(searchBox(html), undefined);
  assert.doesNotMatch(html, /type="search"/);
  assert.match(html, /<input type="hidden" name="q" value="sol ring"\/>/);
  assert.match(html, /Clear \(1\)/, "only the colour: the words are the toolbar's");
  assert.equal(count(panel("color=red", { hide: ["q"] }), /name="q"/), 0);
});

test("the pages: /browse and every set page show the box (desktop and the phone sheet are one copy of the panel); the price guide hides it beside its toolbar's", () => {
  const tag = (file: string): string => { const m = /<BrowseFilters\b[^>]*\/>/.exec(read(file)); assert.ok(m, `${file} renders BrowseFilters`); return m[0]; };
  const browse = tag("src/app/browse/page.tsx"), set = tag("src/app/sets/[slug]/page.tsx"), guide = tag("src/app/price-guide/page.tsx");
  assert.doesNotMatch(browse, /hide=/);
  assert.match(set, /hide=\{\["set"\]\}/);
  assert.doesNotMatch(set, /"q"/);
  assert.match(guide, /hide=\{\["q"\]\}/);
  assert.match(read("src/components/price-guide/PriceGuideToolbar.tsx"), /<input type="search" name="q"/, "the guide keeps one search box: its toolbar's");
  // one copy of the panel on every width: the phone sheet is the same element behind a CSS toggle, so the box is in both
  for (const [file, toggle] of [["src/app/browse/page.tsx", "filters-toggle"], ["src/app/sets/[slug]/page.tsx", "set-filters-toggle"]] as const) {
    const src = read(file);
    assert.equal(count(src, /<BrowseFilters\b/), 1, `${file}: one panel`);
    assert.match(src, new RegExp(`id="${toggle}"[\\s\\S]*peer-checked:block lg:mt-0 lg:block[\\s\\S]*<BrowseFilters`), `${file}: the panel is the phone sheet and the desktop column`);
  }
});

test("the box writes its URL through withSearch and the panel's one canonical query (never a raw copy of the request's query, which may carry the CDN's _mk)", () => {
  const src = read("src/components/BrowseFilters.tsx");
  assert.match(src, /go\(withSearch\(cur, words\), replace\)/, "the words go through withSearch (trimmed, other filters kept)");
  assert.match(src, /const qs = canonical\(next\)\.toString\(\)/, "and go() writes canonical(): page and _mk dropped");
  assert.doesNotMatch(src, /params\.toString\(\)\s*\)/, "no URL is built from the raw search params");
  assert.match(src, /SEARCH_DEBOUNCE_MS = 350/, "applies after a pause, like the sealed panel's search");
  assert.match(src, /if \(e\.key !== "Enter"\) return;\s*e\.preventDefault\(\);\s*applySearch\(e\.currentTarget\.value, "commit"\)/, "Enter applies at once");
  assert.match(src, /onBlur=\{\(e\) => applySearch\(e\.currentTarget\.value, "commit"\)\}/, "and so does leaving the box");
  assert.match(src, /useEffect\(\(\) => \{\s*if \(sent\.current !== null && urlQ === sent\.current\)/, "the box follows the URL's words when they change elsewhere (a chip, Clear, the header search, Back)");
  assert.match(read("src/components/FilterChips.tsx"), /canonical\(next\)/, "the chips write the same canonical query");
});
