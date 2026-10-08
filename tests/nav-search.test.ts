import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NAV_GROUPS, FOOTER_GROUPS } from "../src/components/nav-groups";
import { searchNav, stem, queryTokens, NAV_INDEX } from "../src/components/nav-search";

// ─────────────────────────────────────────────────────────────────────────────
// The "Explore" feature search.
// ─────────────────────────────────────────────────────────────────────────────
// Reported as: "the search bar is broken for the explore features. it should
// filter all the features not act like a normal search bar and search all the
// cards." Two distinct defects sat behind that sentence:
//
//   • the matcher compared the query to the LABEL ONLY, as a substring, so a
//     plural emptied the panel and half the site was unreachable by its own
//     name; and
//   • on a phone the only Explore surface (CinematicNavMenu) put the CARD search
//     directly above the feature grid, so typing there really did search cards.
//
// The first is pinned by the query table below, the second by the last test.
// ─────────────────────────────────────────────────────────────────────────────

const top = (q: string) => searchNav(q)[0]?.href;
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// Every one of these returned ZERO results before the fix. They are the words a
// visitor actually types, so a regression here is the bug coming back.
const MUST_FIND: [query: string, href: string][] = [
  // /deck since 2026-09-25: the Bulk Pricer (this row's old answer) folded
  // into the deck builder's list pricer, labelled "Deck Builder & Pricer".
  // 2026-10-02: "prices" now ranks the site-wide price guide ("Price Guide" in
  // the Prices group) first, by the owner's call; /deck stays pinned by "bulk".
  ["prices", "/price-guide"],
  ["price guide", "/price-guide"],
  ["bulk", "/deck"],
  ["deals", "/tools/deal-finder"],
  ["blog", "/blog"],
  ["alerts", "/alerts"],
  // No "sell" row. The /sell-cards buylist lander was retired (it advertised a
  // mail-in service around a placeholder postal address), and the peer-to-peer
  // marketplace's seller page (/marketplace/sell) was removed entirely (2026-08).
  // Nothing on the site sells cards now, so "sell" correctly matches nothing, and
  // asserting otherwise would force a fake destination into the index.
  ["set", "/sets"],
  ["sets", "/sets"],
  // MTG Compare: Commanders and colours stand where RiftCompare has champions and domains.
  ["commander", "/commanders"],
  ["commanders", "/commanders"],
  ["edh", "/commanders"],
  ["faq", "/support"],
  ["search", "/browse"],
  ["modern horizons", "/sets"],
  ["preorder", "/preorders"],
  ["embed", "/embed"],
  ["creators", "/creators"],
  ["borderless", "/cards"],
  ["movers", "/movers"],
  ["colour", "/colors"],
  ["color", "/colors"],
  ["keyword", "/keywords"],
  ["glossary", "/keywords"],
  // No games on MTG Compare (the owner: "drop the games") and no /learn yet.
  ["expected value", "/tools/box-ev"],
  ["bulk pricer", "/deck"],
  ["binder", "/portfolio"],
  // 2026-09-26: the two policies joined the Help group. Before, both were
  // footer-row links only and ⌘K answered "privacy" and "terms" with nothing.
  ["privacy", "/privacy"],
  ["terms", "/terms"],
];

test("every query that used to return nothing now finds its page", () => {
  const missing = MUST_FIND.filter(([q, href]) => !searchNav(q).some((l) => l.href === href)).map(
    ([q, href]) => `${q} → ${href}`
  );
  assert.deepEqual(missing, [], `queries that find nothing:\n  ${missing.join("\n  ")}`);
});

test("the best match ranks first, not merely somewhere in the list", () => {
  // A palette where Enter opens the top result has to get the top result right.
  const wrong = MUST_FIND.filter(([q, href]) => top(q) !== href).map(
    ([q, href]) => `${q} → got ${top(q)}, wanted ${href}`
  );
  assert.deepEqual(wrong, [], `mis-ranked:\n  ${wrong.join("\n  ")}`);
});

test("singular and plural are the same query", () => {
  // The specific complaint: "price" worked, "prices" showed nothing. Typing one
  // more letter of a correct word must never empty the panel.
  for (const [a, b] of [["price", "prices"], ["deal", "deals"], ["card", "cards"], ["tool", "tools"], ["set", "sets"]]) {
    assert.ok(searchNav(a).length > 0, `"${a}" finds nothing`);
    assert.ok(searchNav(b).length > 0, `"${b}" finds nothing`);
  }
  assert.equal(stem("prices"), stem("price"));
  assert.equal(stem("deals"), stem("deal"));
  // Length- and double-s-guarded, so short words and "class"-shaped words survive.
  assert.equal(stem("is"), "is");
  assert.equal(stem("loss"), "loss");
});

test("matching narrows as you type and never widens", () => {
  // Prefix matching, ANDed across tokens. Each extra character can only remove
  // results — a search that grows as you type is how you get a panel that
  // returns everything, which is as useless as one that returns nothing.
  let prev = Infinity;
  for (const q of ["d", "de", "dea", "deal", "deal f", "deal find"]) {
    const n = searchNav(q).length;
    assert.ok(n <= prev, `"${q}" returned ${n}, more than the shorter query's ${prev}`);
    prev = n;
  }
  assert.ok(searchNav("deal find").length >= 1);
});

test("nonsense finds nothing rather than everything", () => {
  for (const q of ["zzzz", "qqqqq", "asdfghjkl"]) {
    assert.equal(searchNav(q).length, 0, `"${q}" should match no feature`);
  }
});

test("stop words are dropped so a typed question still resolves", () => {
  assert.deepEqual(queryTokens("how do i sell my cards"), ["sell", "card"]);
  // Resolution is checked on a different sentence: the tokeniser assertion above
  // stands on its own, but the destination for "sell" was /sell-cards, which has
  // been retired. This phrase exercises the same stop-word path ("how", "do",
  // "i", "my" all dropped) against a page that isn't feature-flagged.
  assert.deepEqual(queryTokens("how do i track my collection"), ["track", "collection"]);
  assert.ok(searchNav("how do i track my collection").some((l) => l.href === "/watching"));
  // …but a query that is ENTIRELY stop words keeps them, so it narrows to
  // something instead of silently returning the whole index.
  assert.notEqual(searchNav("what is the").length, NAV_INDEX.length);
});

test("the launcher indexes every nav link exactly once", () => {
  const navCount = NAV_GROUPS.reduce((n, g) => n + g.links.length, 0);
  assert.equal(NAV_INDEX.length, navCount);
  assert.equal(new Set(NAV_INDEX.map((l) => l.href)).size, navCount, "duplicate href in NAV_GROUPS");
});

test("the phone Explore overlay's one input searches BOTH features and the card/sealed database", () => {
  // CinematicNavMenu is the ONLY Explore surface on a phone (the launcher's
  // button is hidden below sm and Cmd-K needs a keyboard), so its single input
  // is the search box phone visitors find. It has been reported broken in BOTH
  // directions, which is why this test now pins both halves:
  //
  //   1. It began as the card SearchBar, reported as "it acts like a normal
  //      search bar and searches all the cards" — a card search sitting directly
  //      above a grid of features it did not filter.
  //   2. Made a pure feature filter, it was then reported as searching "only
  //      features and pages" when a visitor typed a card name into it.
  //
  // Satisfying either report alone re-opens the other. The input must keep
  // narrowing the feature grid AND return real database matches.
  const src = read("src/components/CinematicNavMenu.tsx");

  // (1) still fixed: the grid narrows via the shared matcher, and the card
  // SearchBar component (with its own dropdown and focus behaviour) is still
  // not mounted inside this overlay's focus trap.
  assert.ok(src.includes("searchNav"), "the phone overlay must filter with the shared feature matcher");
  assert.doesNotMatch(src, /<SearchBar\b/, "the card SearchBar must not be the phone Explore overlay's input");
  assert.doesNotMatch(src, /\{NAV_GROUPS\.map\(/, "the overlay must render the FILTERED sections, not NAV_GROUPS directly");

  // (2) now fixed: the same box queries the database and renders both kinds of
  // hit. /api/search is the existing navbar-dropdown route and returns
  // MTG Compare's route answers { hits: [{ kind: "card" | "sealed", … }] }, which
  // the overlay splits — a second consumer, not a second query.
  assert.match(src, /\/api\/search\?q=/, "the overlay must query the card/sealed search route");
  assert.match(src, /cardHits/, "card matches must be rendered");
  assert.match(src, /sealedHits/, "sealed matches must be rendered");
  assert.match(src, /href=\{`\/card\/\$\{c\.slug\}`\}/, "a card hit must link to that card's page");
  assert.match(src, /href=\{`\/sealed\/\$\{s2\.slug\}`\}/, "a sealed hit must link to that product's page");
  // Debounce + abort: without the abort a fast typist's earlier, slower response
  // can land last and show results for a query they already replaced.
  assert.match(src, /AbortController/, "in-flight searches must be abortable");
  assert.match(src, /setTimeout\(/, "keystrokes must be debounced, not fired per character");
  // Never fetch behind a closed overlay.
  assert.match(src, /if \(!open \|\| q\.length < 2\)/, "a closed overlay, or a 1-char query, must not hit the route");
});

test("the overlay's card rows show no price, because it cannot localise one", () => {
  // /api/search returns cardTileSelect's SIX market price columns and SearchBar
  // resolves the right one client-side (useCountry). This overlay deliberately
  // renders name + set + number only: a nav row showing one of those columns
  // raw would show some visitors another market's currency, which is worse than
  // showing no price at all. The card page it links to has the localised figure.
  const src = read("src/components/CinematicNavMenu.tsx");
  const iface = src.slice(src.indexOf("interface CardHit"), src.indexOf("}", src.indexOf("interface CardHit")));
  assert.doesNotMatch(iface, /lowestPrice|priceCents/, "no price field on the overlay's card row type");
  assert.match(iface, /setCode/);
  assert.match(iface, /collectorNumber/);
});

test("footer columns stay within a readable spread of each other", () => {
  // FOOTER_GROUPS is derived from NAV_GROUPS, so adding launcher entries silently
  // grows the footer. Its own comment is the contract: four columns, none of them
  // towering over its neighbours.
  const counts = FOOTER_GROUPS.map((g) => g.links.length);
  assert.equal(counts.length, 4, "the footer grid is sm:grid-cols-4");
  for (const n of counts) assert.ok(n >= 4, `a footer column has only ${n} links`);
  assert.ok(
    Math.max(...counts) <= Math.min(...counts) * 2,
    `footer columns are lopsided: ${counts.join(" / ")}`
  );
});

test("hideInFooter keeps launcher-only links out of the footer but in the launcher", () => {
  const hidden = NAV_GROUPS.flatMap((g) => g.links).filter((l) => l.hideInFooter);
  assert.ok(hidden.length > 0, "expected launcher-only links (the policies)");
  const footerHrefs = new Set(FOOTER_GROUPS.flatMap((g) => g.links).map((l) => l.href));
  for (const l of hidden) {
    assert.ok(!footerHrefs.has(l.href), `${l.href} is flagged hideInFooter but still renders in the footer`);
    assert.ok(NAV_INDEX.some((i) => i.href === l.href), `${l.href} must still be searchable in the launcher`);
  }
});
