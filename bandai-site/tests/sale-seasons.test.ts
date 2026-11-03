import { test } from "node:test";
import assert from "node:assert/strict";
import { listRegions, saleDates, saleInSeason, saleIntro, salesInSeason, saleYear, zodiacAnimal, CORE_SALES } from "../src/lib/sale-seasons";

test("event dates", () => {
  assert.deepEqual(saleDates("boxing-day", 2026), { start: "2026-12-26", end: "2026-12-26" });
  assert.deepEqual(saleDates("january-sales", 2027), { start: "2027-01-01", end: "2027-01-31" });
  assert.equal(saleDates("lunar-new-year", 2027)?.start, "2027-02-06");
  assert.equal(saleDates("lunar-new-year", 2028)?.start, "2028-01-26");
  assert.equal(saleDates("lunar-new-year", 2041), null);
  assert.equal(saleDates("valentines-day", 2027)?.start, "2027-02-14");
  assert.equal(zodiacAnimal(2026), "Horse");
  assert.equal(zodiacAnimal(2027), "Goat");
});

test("each page is about the next event, and keeps the last one for a week", () => {
  assert.equal(saleYear("boxing-day", "2026-11-02"), 2026);
  assert.equal(saleYear("boxing-day", "2027-01-02"), 2026);
  assert.equal(saleYear("boxing-day", "2027-01-03"), 2027);
  assert.equal(saleYear("january-sales", "2026-11-02"), 2027);
  assert.equal(saleYear("january-sales", "2027-02-07"), 2027);
  assert.equal(saleYear("january-sales", "2027-02-08"), 2028);
  assert.equal(saleYear("lunar-new-year", "2026-11-02"), 2027);
  assert.equal(saleYear("valentines-day", "2026-11-02"), 2027);
});

test("the homepage links a page only in its run-up", () => {
  assert.equal(saleInSeason("boxing-day", "2026-11-30"), false);
  assert.equal(saleInSeason("boxing-day", "2026-12-01"), true);
  assert.equal(saleInSeason("boxing-day", "2026-12-28"), true);
  assert.equal(saleInSeason("boxing-day", "2026-12-29"), false);
  assert.equal(saleInSeason("january-sales", "2026-12-20"), true);
  assert.equal(saleInSeason("january-sales", "2027-02-03"), false);
  assert.equal(saleInSeason("lunar-new-year", "2027-01-09"), true);
  assert.equal(saleInSeason("lunar-new-year", "2027-01-08"), false);
  assert.deepEqual(salesInSeason(CORE_SALES, "2026-12-24").map((s) => s.slug), ["boxing-day", "january-sales"]);
  assert.deepEqual(salesInSeason(CORE_SALES, "2026-11-02"), []);
});

test("the wording names every region, never one country", () => {
  assert.equal(listRegions(["Australia", "the UK", "the US"]), "Australia, the UK and the US");
  const intro = saleIntro("boxing-day", 2026, "Australia and the UK");
  assert.match(intro, /Saturday 26 December 2026/);
  assert.match(intro, /across Australia and the UK/);
  assert.match(saleIntro("lunar-new-year", 2027, "Singapore"), /Saturday 6 February 2027.*Year of the Goat/);
  for (const s of ["boxing-day", "january-sales", "lunar-new-year", "valentines-day"] as const)
    assert.doesNotMatch(saleIntro(s, 2027, "x"), /\bwas\b|ends soon|limited time/i);
});
