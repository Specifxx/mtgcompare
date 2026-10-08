import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCardFaqs, cardMetaDescription, cardTitle, TITLE_MAX } from "../src/lib/card-seo";

const t = (over: Partial<Parameters<typeof cardTitle>[0]> = {}) =>
  cardTitle({ name: "Lightning Bolt", variant: null, number: "141", setName: "Magic 2011", setCode: "M11", printing: "standard", hasPrice: true, ...over });

test("a short card keeps the set name and is within 60", () => {
  const s = t({ name: "Sol Ring", number: "270" });
  assert.match(s, /Sol Ring 270 Price/);
  assert.ok(s.length <= TITLE_MAX, s);
});

test("the set name is dropped first, the number and printing word never", () => {
  const s = t({ name: "The One Ring", variant: "Borderless · Serial Numbered", number: "0246", printing: "borderless", setName: "Universes Beyond: The Lord of the Rings: Tales of Middle-earth" });
  assert.ok(s.length <= TITLE_MAX, `${s} (${s.length})`);
  assert.match(s, /0246/);
  assert.match(s, /Borderless/);
  assert.doesNotMatch(s, /Universes Beyond/);
});

test("titles of a Borderless and its standard print differ", () => {
  const a = t({ name: "Sol Ring", number: "270", variant: "Borderless", printing: "borderless", setName: "Commander Masters" });
  const b = t({ name: "Sol Ring", number: "270", variant: null, printing: "standard", setName: "Commander Masters" });
  assert.notEqual(a, b);
  assert.match(a, /Borderless/);
});

test("when nothing fits the shortest rung ships", () => {
  const s = t({ name: "Sakashima the Impostor Reflecting Pool of the Ancients", variant: "Borderless · Extended Art", number: "0399", printing: "borderless" });
  assert.match(s, /0399/);
  assert.ok(!s.includes("Extended Art"));
});

test("an unpriced card advertises the card, not a price", () => {
  assert.doesNotMatch(t({ hasPrice: false }), /Price/);
});

test("the description carries the printing, text and price", () => {
  const d = cardMetaDescription({
    displayName: "Sol Ring (Borderless) 270", number: "270", setName: "Commander Masters", setCode: "CMM", printing: "borderless", rarity: "U", cardType: "Artifact",
    colors: [], textBit: "{T}: Add {C}{C}.", marketUsd: 12000, lowUsCents: 11000,
  });
  assert.match(d, /borderless printing/);
  assert.match(d, /US\$120/);
  assert.match(d, /Add \{C\}/);
});

const faqBase = {
  name: "Lightning Bolt", displayName: "Lightning Bolt (Borderless) 141", number: "141", setName: "Magic 2011", setCode: "M11", rarity: "C", cardType: "Instant", colors: ["Red"],
  printing: "borderless", country: "US" as const, lowest: 4500, stores: 3, printingCount: 1, marketUsd: 5000, baseMarketUsd: 300, currencyAnswer: "US$45.00 in the United States and A$80.00 in Australia", preRelease: false,
};

test("FAQ: printing question only for specials, currency question only with an answer, no empty answers", () => {
  const f = buildCardFaqs(faqBase);
  assert.ok(f.some((x) => /worth it/.test(x.q)));
  assert.ok(f.some((x) => /other currencies/.test(x.q)));
  const g = buildCardFaqs({ ...faqBase, printing: "standard", currencyAnswer: null, printingCount: 0 });
  assert.ok(!g.some((x) => /worth it|other currencies|other printings/.test(x.q)));
  assert.ok(g.every((x) => x.a.length > 0));
});

test("FAQ: no claim about a price when there is none, and pre-release is honest", () => {
  const f = buildCardFaqs({ ...faqBase, lowest: null, stores: 0, marketUsd: null, baseMarketUsd: null, preRelease: true });
  assert.match(f[0].a, /not been released/);
  assert.doesNotMatch(f[0].a, /US\$/);
  assert.ok(!f.some((x) => /worth it/.test(x.q)));
});
