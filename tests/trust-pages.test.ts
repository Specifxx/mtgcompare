// THE TRUST AND POLICY PAGES SAY WHAT THE CODE DOES (owner WP19, parity P08; ported from RiftCompare, whose trust pages were rewritten after a "low value content" rejection because several of their claims no longer
// matched the code). /about, /editorial-policy, /methodology, /privacy, /terms, /contact and /support are what a reviewer, a buyer and a rights holder read first. Magic adds three duties Riftbound did not have, and
// each is pinned to the CONSTANT that produces it, so a wording change happens once (src/lib/site.ts) and cannot drift between pages:
//   * Wizards of the Coast: the unofficial-fan-site notice and the Fan Content Policy sentence are the constants of site.ts, shown by the footer, /about and /terms; no page retypes them;
//   * Scryfall and TCGplayer: the data attribution their terms ask for, and no implied endorsement;
//   * the owner's contact address is ONE constant (CONTACT_EMAIL): no page types an address, because the real one is not chosen yet and the placeholder can never deliver.
// What the pages say about the cadence is quoted from schedule.ts and release-schedule.ts, never typed (an hour of the day in a page is a claim that goes stale).
// Each rule is a RATCHET per owner of the page file: the pages are still the One Piece text until WP17 rewrites them (wave 6), the footer is WP15's. RATCHET_STRICT=1 (M2) requires zero.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, ratchet, stripComments, summary } from "./helpers/ratchet";

const PAGES = { about: "src/app/about/page.tsx", policy: "src/app/editorial-policy/page.tsx", method: "src/app/methodology/page.tsx", privacy: "src/app/privacy/page.tsx", terms: "src/app/terms/page.tsx", contact: "src/app/contact/page.tsx", support: "src/app/support/page.tsx" } as const;
const FOOTERS = ["src/components/Footer.tsx", "src/components/FooterNav.tsx"];
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), "utf8");
const text = (p: string): string => stripComments(read(p)).replace(/\s+/g, " ");
const exists = (p: string): boolean => fs.existsSync(path.join(ROOT, p));

export interface Rule { id: string; why: string; files: string[]; ok: (t: string, raw: string, file: string) => boolean }
export const RULES: Rule[] = [
  { id: "fan-notice", why: "carries the unofficial-fan-site notice from site.ts (UNOFFICIAL_FAN_SITE_NOTICE or FAN_CONTENT_DISCLAIMER), not a typed copy", files: [PAGES.about, PAGES.terms, ...FOOTERS.slice(0, 1)], ok: (t) => /\b(?:UNOFFICIAL_FAN_SITE_NOTICE|FAN_CONTENT_DISCLAIMER)\b/.test(t) },
  { id: "attribution", why: "names Scryfall and TCGplayer as the sources (DATA_ATTRIBUTION, or both names with a Scryfall link)", files: [PAGES.about, PAGES.method], ok: (t) => /\bDATA_ATTRIBUTION\b/.test(t) || (/Scryfall/.test(t) && /TCGplayer/.test(t) && /(?:SCRYFALL_URL|scryfall\.com)/.test(t)) },
  { id: "contact-constant", why: "shows the contact address through CONTACT_EMAIL", files: [PAGES.contact], ok: (t) => /\bCONTACT_EMAIL\b/.test(t) },
  { id: "no-typed-address", why: "types no e-mail address (CONTACT_EMAIL is the one)", files: Object.values(PAGES), ok: (t) => !/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/.test(t) },
  { id: "revenue-disclosure", why: "names every way the site earns: eBay Partner Network, TCGplayer's affiliate programme, and the subscriptions", files: [PAGES.policy], ok: (t) => /eBay Partner Network/.test(t) && /TCGplayer/.test(t) && /affiliate/i.test(t) && /(?:Plus|Premium|subscription)/i.test(t) },
  { id: "links-the-explanations", why: "links /editorial-policy and /methodology", files: [PAGES.about], ok: (t) => /href="\/editorial-policy"/.test(t) && /href="\/methodology"/.test(t) },
  { id: "cadence-not-typed", why: "types no hour of the day unless it imports the schedule it comes from", files: [PAGES.method, PAGES.policy, PAGES.about, PAGES.terms, PAGES.privacy], ok: (t) => !/\b\d{1,2}:\d{2}\s*UTC\b/.test(t) || /@\/lib\/(?:release-)?schedule/.test(t) },
  { id: "metadata", why: "has a title, a description, a canonical and openGraph: pageOg(...)", files: Object.values(PAGES), ok: (t) => /\btitle:/.test(t) && /\bdescription:/.test(t) && /canonical:/.test(t) && /pageOg(?:OwnImage)?\(/.test(t) },
  { id: "footer-links", why: "links every trust page", files: FOOTERS, ok: (_t, raw, f) => f.endsWith("Footer.tsx") ? ["/about", "/privacy", "/terms", "/contact", "/methodology", "/editorial-policy"].every((h) => raw.includes(`"${h}"`) || raw.includes(`'${h}'`)) || /FooterNav/.test(raw) : ["/about", "/privacy", "/terms", "/contact", "/methodology", "/editorial-policy"].every((h) => raw.includes(`"${h}"`) || raw.includes(`'${h}'`)) },
];
/** The Fan Content Policy sentence exists once; a page that retypes it will not follow a change of wording. */
export const FAN_SENTENCE = /Portions of the materials used are property of Wizards of the Coast/;

test("the seven trust pages exist, and so does the site module the rules read", () => {
  for (const [k, f] of Object.entries(PAGES)) assert.ok(exists(f), `${k}: ${f}`);
  assert.ok(exists("src/lib/site.ts"));
  const site = read("src/lib/site.ts");
  for (const c of ["UNOFFICIAL_FAN_SITE_NOTICE", "FAN_CONTENT_DISCLAIMER", "DATA_ATTRIBUTION", "CONTACT_EMAIL", "SCRYFALL_URL"]) assert.match(site, new RegExp(`export const ${c}\\b`), `${c} is defined once, in site.ts`);
});
test("the rules can fail", () => {
  const r = (id: string): Rule => RULES.find((x) => x.id === id)!;
  assert.equal(r("fan-notice").ok("<p>{UNOFFICIAL_FAN_SITE_NOTICE}</p>", "", "x"), true);
  assert.equal(r("fan-notice").ok("<p>This is a fan site.</p>", "", "x"), false);
  assert.equal(r("no-typed-address").ok("write to someone@gmail.com", "", "x"), false);
  assert.equal(r("no-typed-address").ok("write to {CONTACT_EMAIL}", "", "x"), true);
  assert.equal(r("cadence-not-typed").ok("prices land at 21:30 UTC", "", "x"), false);
  assert.equal(r("cadence-not-typed").ok('import { IMPORT } from "@/lib/schedule"; prices land at 21:30 UTC', "", "x"), true);
  assert.equal(r("revenue-disclosure").ok("eBay Partner Network, TCGplayer affiliate links and Premium subscriptions", "", "x"), true);
  assert.equal(r("revenue-disclosure").ok("we run ads", "", "x"), false);
  assert.equal(r("attribution").ok("Card data and images: Scryfall. Prices: TCGplayer. https://scryfall.com", "", "x"), true);
  assert.equal(r("attribution").ok("{DATA_ATTRIBUTION}", "", "x"), true);
  assert.equal(r("attribution").ok("prices from stores", "", "x"), false);
});
for (const rule of RULES) {
  test(`RATCHET: ${rule.id}: the page ${rule.why}`, () => {
    const offenders = rule.files.filter((f) => exists(f) && !rule.ok(text(f), read(f), f));
    const r = ratchet(`trust-pages:${rule.id}`, offenders);
    if (offenders.length) console.log(`trust-pages ${rule.id}: ${summary(r)}: ${offenders.join(", ")}`);
    assert.ok(r.ok, r.failures.join("\n"));
  });
}
test("RATCHET: the Fan Content Policy sentence is typed in site.ts alone", () => {
  const files = ["src/app", "src/components", "src/lib"].flatMap((d) => (function walk(dir: string): string[] { const abs = path.join(ROOT, dir); return fs.existsSync(abs) ? fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])) : []; })(d))
    .filter((f) => /\.tsx?$/.test(f) && f !== "src/lib/site.ts" && FAN_SENTENCE.test(read(f)));
  const r = ratchet("trust-pages:fan-sentence-typed", files);
  if (files.length) console.log(`trust-pages fan sentence: ${summary(r)}: ${files.join(", ")}`);
  assert.ok(r.ok, r.failures.join("\n"));
  assert.match(read("src/lib/site.ts"), FAN_SENTENCE, "and it is in site.ts, verbatim");
});
test("the unofficial notice says what it must: independent, unofficial, not endorsed by Wizards of the Coast, Hasbro or Scryfall; and the disclaimer carries Wizards' own sentence", async () => {
  const { UNOFFICIAL_FAN_SITE_NOTICE, FAN_CONTENT_DISCLAIMER, DATA_ATTRIBUTION, FAN_CONTENT_POLICY_URL, SCRYFALL_URL } = await import("../src/lib/site");
  assert.match(UNOFFICIAL_FAN_SITE_NOTICE, /independent, unofficial fan site/);
  assert.match(UNOFFICIAL_FAN_SITE_NOTICE, /not endorsed, sponsored or approved by Wizards of the Coast, Hasbro or Scryfall/);
  assert.match(FAN_CONTENT_DISCLAIMER, FAN_SENTENCE);
  assert.match(FAN_CONTENT_DISCLAIMER, /Fan Content Policy/);
  assert.match(DATA_ATTRIBUTION, /Scryfall/); assert.match(DATA_ATTRIBUTION, /TCGplayer/); assert.match(DATA_ATTRIBUTION, /does not endorse/);
  assert.equal(FAN_CONTENT_POLICY_URL, "https://company.wizards.com/en/legal/fancontentpolicy");
  assert.equal(SCRYFALL_URL, "https://scryfall.com");
});
