import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BF_MODE, bfModeOn } from "../src/lib/bf-mode";
import { TCG_OFFER_COPY, TCGPLAYER_STANDING, activeEvent, offerCalendarOn, offerPhase } from "../src/lib/offer-calendar";

test("the offer calendar takes over the moment TCGplayer's sale ends, with no gap and no overlap", () => {
  const end = BF_MODE.end;
  assert.equal(bfModeOn(end - 1), true);
  assert.equal(offerCalendarOn(end - 1), false);
  assert.equal(bfModeOn(end), false);
  assert.equal(offerCalendarOn(end), true);
  assert.equal(offerPhase(end), "christmas");
});

test("the season follows New York's calendar every year", () => {
  assert.equal(offerPhase(Date.parse("2026-12-05T12:00:00Z")), "christmas");
  assert.equal(offerPhase(Date.parse("2026-12-14T12:00:00Z")), "lastOrders");
  assert.equal(offerPhase(Date.parse("2026-12-26T04:59:00Z")), "lastOrders");
  assert.equal(offerPhase(Date.parse("2026-12-26T05:00:00Z")), "afterChristmas");
  assert.equal(offerPhase(Date.parse("2027-01-03T12:00:00Z")), "newYear");
  assert.equal(offerPhase(Date.parse("2027-01-08T06:00:00Z")), "everyday");
  assert.equal(offerPhase(Date.parse("2027-06-01T12:00:00Z")), "everyday");
  assert.equal(offerPhase(Date.parse("2027-12-02T12:00:00Z")), "christmas");
});

test("an event runs only inside its own dates", () => {
  const ev = [{ from: "2026-12-13T00:00:00Z", to: "2027-01-22T00:00:00Z", label: "x", title: "x", href: "/x" }];
  assert.equal(activeEvent(ev, Date.parse("2026-12-12T23:59:59Z")), null);
  assert.equal(activeEvent(ev, Date.parse("2026-12-13T00:00:00Z"))?.href, "/x");
  assert.equal(activeEvent(ev, Date.parse("2027-01-22T00:00:00Z")), null);
  assert.equal(activeEvent(undefined, Date.now()), null);
});

test("the copy claims only TCGplayer's standing offer: no invented discount, code, credit or countdown", () => {
  const all = [TCGPLAYER_STANDING.short, TCGPLAYER_STANDING.long, ...Object.values(TCG_OFFER_COPY).flatMap((c) => [c.head, c.line])].join(" ");
  assert.doesNotMatch(all, /\d+\s*%|store credit|promo code|coupon|ends (soon|in)|hurry|only \d/i);
  assert.match(TCGPLAYER_STANDING.short, /US/);
});

test("the card and the bar keep their UX rules after the sale", () => {
  const popup = readFileSync("src/components/TcgSalePopup.tsx", "utf8");
  assert.match(popup, /SHOWN_KEY\) === "1"\) return false/, "once a visit");
  assert.match(popup, /typingTarget\(document\.activeElement\)/, "never while typing");
  assert.match(popup, /OFFER_CLOSE_DAYS/);
  assert.doesNotMatch(popup, /window\.open\(/);
  const bar = readFileSync("src/components/BfModeBar.tsx", "utf8");
  assert.match(bar, /offerCalendarOn\(now\)/);
  assert.doesNotMatch(bar, /position:\s*["']?fixed|className="[^"]*\bfixed\b|window\.open|<dialog/);
});
