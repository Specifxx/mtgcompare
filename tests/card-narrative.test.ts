// The About narrative: emits only what the data supports, and is not one
// skeleton written thousands of times.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNarrative, tidy, type NarrativeInput, type NarrativeMarket } from "../src/lib/content/card-narrative";

const mk = (country: "US" | "AU" | "UK", currency: string, place: string, low: number | null, extra: Partial<NarrativeMarket> = {}): NarrativeMarket => ({
  country, place, currency, lowestCents: low, secondCents: low == null ? null : Math.round(low * 1.2), storeCount: low == null ? 0 : 3, listingCount: low == null ? 0 : 4, ...extra,
});

const base: NarrativeInput = {
  name: "Monkey.D.Luffy", variant: null, number: "OP05-060", printing: "standard", setName: "Awakening of the New Era", setCode: "OP05", setKind: "booster",
  releasedOn: "2024-03-01", today: "2026-10-04", rarity: "L", cardType: "Leader", colors: ["Purple"], cost: null, power: 5000, counter: null, life: 4,
  attribute: "Strike", subtypes: ["Straw Hat Crew"], keywords: ["Rush"], timings: ["Activate: Main"], hasText: true, marketUsd: 1200, change7d: 8.5, change30d: 14,
  high90Usd: 1500,
  baseline: mk("US", "USD", "the United States", 1250), markets: [mk("US", "USD", "the United States", 1250), mk("AU", "AUD", "Australia", 2400), mk("UK", "GBP", "the United Kingdom", 900)],
  printings: [{ label: "Parallel", marketUsd: 9000 }, { label: "Manga", marketUsd: 80000 }], setContext: { pricedInSet: 120, cheaperThan: 119, medianUsd: 90 },
  sameNameElsewhere: 14,
};

test("a fully priced card gets a long, multi-paragraph narrative", () => {
  const n = buildNarrative(base);
  assert.ok(n.paragraphs.length >= 5, `${n.paragraphs.length} paragraphs`);
  assert.ok(n.words >= 280, `${n.words} words`);
  const text = n.paragraphs.join(" ");
  assert.match(text, /Leader/);
  assert.match(text, /4 Life/);
  assert.match(text, /US\$12\.00/);
  assert.match(text, /90-day high/);
});

test("no claim without data: an unpriced card with no listings says nothing about prices", () => {
  const n = buildNarrative({
    ...base, marketUsd: null, change7d: null, change30d: null, high90Usd: null, printings: [], setContext: null, sameNameElsewhere: 0,
    baseline: mk("US", "USD", "the United States", null), markets: [mk("US", "USD", "the United States", null)],
  });
  const text = n.paragraphs.join(" ");
  assert.doesNotMatch(text, /US\$/);
  assert.doesNotMatch(text, /market price/);
  assert.doesNotMatch(text, /cheapest/i);
  assert.ok(n.paragraphs.length <= 3);
});

test("a single store is not described as stock depth", () => {
  const b = mk("US", "USD", "the United States", 500, { storeCount: 1, secondCents: null });
  const text = buildNarrative({ ...base, baseline: b, markets: [b] }).paragraphs.join(" ");
  assert.match(text, /Only one store/);
});

test("an upcoming set says it is not released", () => {
  const text = buildNarrative({ ...base, releasedOn: "2026-12-01" }).paragraphs.join(" ");
  assert.match(text, /has not been released yet/);
});

test("special printings open with the printing and compare with the standard print", () => {
  const n = buildNarrative({ ...base, printing: "manga", variant: "Manga · Alternate Art", rarity: "SEC", cardType: "Character", colors: ["Red"], marketUsd: 80000, printings: [{ label: "Standard", marketUsd: 500 }] });
  assert.match(n.paragraphs[0], /Manga printing of Monkey\.D\.Luffy/);
  assert.match(n.paragraphs.join(" "), /160x the standard print/);
  assert.doesNotMatch(n.paragraphs.join(" "), /Manga · Alternate Art/);
});

test("three different cards do not share a fixed skeleton", () => {
  const a = buildNarrative(base);
  const b = buildNarrative({
    ...base, name: "Nami", number: "OP01-016", cardType: "Character", colors: ["Red"], rarity: "R", cost: 1, power: 2000, counter: 1000, life: null, attribute: null,
    keywords: [], timings: ["Trigger", "On Play"], marketUsd: 40, change7d: -1, change30d: 0.5, printings: [], sameNameElsewhere: 0, setContext: { pricedInSet: 120, cheaperThan: 50, medianUsd: 60 },
    baseline: mk("US", "USD", "the United States", 35, { storeCount: 1, secondCents: null }), markets: [mk("US", "USD", "the United States", 35, { storeCount: 1, secondCents: null })],
  });
  const c = buildNarrative({
    ...base, name: "Gum-Gum Pistol", number: "OP01-029", cardType: "Event", colors: ["Blue"], rarity: "C", cost: 1, power: null, counter: 3000, life: null, attribute: null,
    keywords: [], timings: [], marketUsd: null, change7d: null, change30d: null, high90Usd: null, printings: [], sameNameElsewhere: 2, setContext: null,
    baseline: mk("US", "USD", "the United States", null), markets: [mk("US", "USD", "the United States", null)],
  });
  // Replace everything specific; what is left must still differ.
  const skeleton = (n: { paragraphs: string[] }) => n.paragraphs.map((p) => p.replace(/[A-Z][\w.!-]*(?: [A-Z][\w.!-]*)*|\d[\d,.%x]*|\(.*?\)/g, "_").replace(/\s+/g, " ")).join("|");
  assert.notEqual(skeleton(a), skeleton(b));
  assert.notEqual(skeleton(b), skeleton(c));
  assert.notEqual(skeleton(a), skeleton(c));
  assert.notEqual(a.paragraphs.length, c.paragraphs.length);
});

test("tidy removes doubled spaces and punctuation", () => {
  assert.equal(tidy("A  b , c.. d ."), "A b, c. d.");
});
