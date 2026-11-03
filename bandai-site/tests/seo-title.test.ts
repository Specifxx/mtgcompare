import { test } from "node:test";
import assert from "node:assert/strict";
import { SITE } from "@/site.config";
import { TITLE_MAX, cardTitleCandidates, fitTitle, setTitleCandidates } from "@/lib/seo-title";

test("fitTitle keeps the brand when it fits and drops it before the words", () => {
  assert.equal(fitTitle(["Short"]).absolute, `Short | ${SITE.name}`);
  const long = "x".repeat(TITLE_MAX - 2);
  assert.equal(fitTitle([long]).absolute, long);
  assert.equal(fitTitle(["y".repeat(80), "z".repeat(10)]).absolute, `${"z".repeat(10)} | ${SITE.name}`);
  // A more specific candidate beats the brand.
  assert.equal(fitTitle([long, "short"]).absolute, long);
});

test("a card's number appears once", () => {
  assert.match(cardTitleCandidates("Jagd Doga (GD05-057)", "GD05-057", "Set", false)[0], /^Jagd Doga GD05-057 Price/);
});

test("every title fits in 60 characters when any candidate does", () => {
  const set = fitTitle(setTitleCandidates("A Very Long Expansion Name Indeed", 214)).absolute;
  assert.ok(set.length <= TITLE_MAX, set);
  assert.match(set, /Card List/);
  const card = fitTitle(cardTitleCandidates("Some Card", "AB01-001", "First Set", false)).absolute;
  assert.ok(card.length <= TITLE_MAX, card);
  assert.match(card, /^Some Card AB01-001 Price/);
});

test("a set page leads with the card list and its count", () => {
  assert.match(setTitleCandidates("First Set", 120)[0], /Card List: All 120 Cards \+ Prices$/);
  assert.ok(!setTitleCandidates("First Set", 0).some((t) => t.includes("All 0")));
});

test("llms.txt lists the main sections and every guide", async () => {
  const { GET } = await import("../src/app/llms.txt/route");
  const body = await GET().text();
  assert.match(body, new RegExp(`^# ${SITE.name}`));
  assert.match(body, /\/sets\)/);
  assert.match(body, /## Guides/);
});

test("an unreleased set with revealed cards is titled for the spoiler search, inside the limit", () => {
  const t = fitTitle(setTitleCandidates("First Set", 48, true)).absolute;
  assert.match(t, /Spoilers: 48 Cards Revealed/);
  assert.ok(t.length <= TITLE_MAX + 20);
  assert.match(setTitleCandidates("First Set", 0, true)[0], /Card List/);
});
