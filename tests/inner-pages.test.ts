// Every page that is not a home page, in the home page's voice (DECISIONS.md, 2026-11-14, "The other pages in the home page's
// voice"). Each test pins one shared rule so a new page or a later edit cannot quietly drift from it. Nothing here touches a paid
// row, an ad block, a URL or metadata.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../src/", import.meta.url).pathname;
const read = (p: string) => readFileSync(join(root, p), "utf8");
const css = read("app/globals.css");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    const rel = join(dir, name);
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out);
    else if (rel.endsWith(".tsx")) out.push(rel);
  }
  return out;
}

// The h1s that keep their own voice: the two home heroes, the product page (a long product name is set a size down), the forum
// (its own stylesheet), and two components other sites share with inline styles.
const OWN_H1 = [/^app\/\(site\)\/page\.tsx$/, /^app\/\[region\]\/page\.tsx$/, /^app\/\[region\]\/p\/\[slug\]\/page\.tsx$/, /^components\/forum\//, /^components\/(HowWePickStores|ListYourStore)\.tsx$/];

test("every other page's h1 is the one page title (one size, not 24 to 48px by page)", () => {
  const files = [...walk("app"), ...walk("components")].filter((f) => !OWN_H1.some((re) => re.test(f)));
  const bad: string[] = [];
  let seen = 0;
  for (const f of files) {
    for (const m of read(f).matchAll(/<h1\b[^>]*>/g)) {
      seen++;
      if (!/className="[^"]*\bpage-title\b/.test(m[0])) bad.push(`${f}: ${m[0]}`);
    }
  }
  assert.ok(seen >= 30, `found ${seen} h1s`);
  assert.deepEqual(bad, []);
  assert.match(css, /\.page-title \{[^}]*font-size: clamp\(/, "one fluid size");
  assert.match(css, /\.page-lead \{[^}]*max-width: 65ch/, "the lead on a reading measure");
});

test("the page glow is a background on <main>, never on a home page and never an element", () => {
  assert.match(css, /#main:not\(:has\(\.hero\)\) \{\s*background-image: radial-gradient\(/);
});

test("an article reads on a measure, its tables scroll in their own box", () => {
  assert.match(css, /\.prose-dex > :where\(p, ul, ol, h2, h3, blockquote\) \{\s*max-width: 68ch;/);
  assert.match(css, /\.prose-dex table \{[^}]*overflow-x-auto/);
});

test("calm palette: no tinted boxes left on the set, sets, releases and product pages", () => {
  const set = read("app/[region]/sets/[set]/page.tsx");
  assert.doesNotMatch(set, /rounded-xl bg-open-soft px-4/, "the cheapest way in is a plain card");
  assert.doesNotMatch(set, /bg-pre-soft\/40/, "the pre-order link is a plain card");
  assert.doesNotMatch(read("app/[region]/sets/page.tsx"), /rounded-2xl bg-pre-soft/, "the next set is a plain pill");
  assert.doesNotMatch(read("app/[region]/releases/page.tsx"), /border-pre\/25 bg-pre-soft/, "the next set is a plain card");
  assert.doesNotMatch(read("app/[region]/p/[slug]/page.tsx"), /bg-open-soft\/50/, "the value check is not a tinted row");
  assert.doesNotMatch(read("content/guides/kit.tsx"), /bg-open-soft\/50/, "a guide table's pick is marked like the price table's best row");
});

test("a guide card's cover shows from sm only: on a phone the guides are a list of words", () => {
  assert.match(read("content/guides/kit.tsx"), /className="hidden aspect-\[1200\/630\][^"]*sm:block"/);
});

test("link cards rise only when motion is welcome", () => {
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{\s*\.lift:hover \{\s*transform: translateY\(-2px\);/);
  assert.doesNotMatch(css, /\.lift \{[^}]*translate/, "no transform outside the media query");
});

test("link cards and their icons animate nothing for a visitor who turned motion off", () => {
  // .lift and .tile-icon come after the "Motion." reduce block, so a transition declared outside a no-preference query would
  // beat its "transition: none" (same weight, later in the file) and still fade for that visitor.
  assert.doesNotMatch(css, /^\.lift \{[^}]*transition/m, ".lift's transition only under no-preference");
  assert.doesNotMatch(css, /^\.tile-icon \{[^}]*transition/m, ".tile-icon's transition only under no-preference");
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{\s*\.lift:hover \{[^}]*\}\s*\.lift \{\s*transition: transform 200ms/);
});
