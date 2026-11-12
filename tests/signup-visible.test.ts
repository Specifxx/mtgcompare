import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { weeklyBoxLive, WEEKLY_BOX_FROM } from "../src/lib/weekly-box";

// DECISIONS.md, "a sign-up people can see" (2026-11-12).

const read = (p: string) => fs.readFileSync(p, "utf8");

test("the price alert is a button under the best price, once per product page, and opens only on a tap", () => {
  const page = read("src/app/[region]/p/[slug]/page.tsx");
  assert.equal(page.match(/<PriceAlertForm/g)?.length, 1, "one form per page (its field ids are the product's)");
  assert.ok(page.indexOf("<PriceAlertForm") < page.indexOf("<MiniSealedAds"), "above the ad pair and the price table");
  assert.ok(page.indexOf("<PriceAlertForm") > page.indexOf('id="best"'));
  assert.match(page.slice(page.indexOf("<PriceAlertForm")), /^<PriceAlertForm[^>]*\bprominent\b/s);
  const form = read("src/components/PriceAlertForm.tsx");
  assert.match(form, /useState\(false\)/, "closed until the visitor opens it");
  assert.ok(!/useEffect|setTimeout|IntersectionObserver/.test(form), "nothing opens it by itself");
});

test("the weekly-drops box asks for an address only, on the hub pages, never on a product page, and is no pop-up", () => {
  const box = read("src/components/WeeklyDropsBox.tsx");
  assert.match(box, /JSON\.stringify\(\{ site, region, email: [^}]*kind: "weekly" \}\)/);
  assert.ok(!/localStorage|document\.cookie|position: "fixed"|<dialog|<h[1-6]/.test(box), "no storage, no overlay, no heading");
  assert.ok(!/useEffect|setTimeout/.test(box));
  assert.match(box, /name="website"/, "the honeypot stays");
  for (const p of ["page.tsx", "deals/page.tsx", "sets/[set]/page.tsx", "price-moves/page.tsx", "this-week/page.tsx"]) {
    const src = read(`src/app/[region]/${p}`);
    assert.equal(src.match(/<WeeklyDropsBox/g)?.length, 1, p);
    assert.match(src, /\{weeklyBoxLive\(\) && <WeeklyDropsBox site=\{ALERT_SITE_KEY\} region=\{r\.market\}/, `${p}: drawn by the server, behind the date`);
  }
  assert.ok(!read("src/app/[region]/p/[slug]/page.tsx").includes("WeeklyDropsBox"));
});

test("the box waits for the alert service's release", () => {
  assert.equal(weeklyBoxLive(new Date("2026-11-13T23:59:00Z")), false);
  assert.equal(weeklyBoxLive(new Date(WEEKLY_BOX_FROM)), true);
  assert.ok(!read("src/lib/weekly-box.ts").includes("use client"), "decided on the server: nothing is added in the browser");
});
