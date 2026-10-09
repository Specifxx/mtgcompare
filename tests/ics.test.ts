import { test } from "node:test";
import assert from "node:assert/strict";
import { addDaysCompact, foldLine, icsEscape, releaseIcs } from "../src/lib/ics";

test("TEXT escaping: backslash, semicolon, comma and newline only", () => {
  assert.equal(icsEscape("a\\b;c,d\ne"), "a\\\\b\;c\\,d\\ne");
  assert.equal(icsEscape("plain: text"), "plain: text");
});

test("folding: lines over 75 octets fold with CRLF + space and unfold back losslessly", () => {
  const long = `DESCRIPTION:${"x".repeat(200)}`;
  const folded = foldLine(long);
  assert.ok(folded.includes("\r\n "));
  for (const part of folded.split("\r\n")) assert.ok(new TextEncoder().encode(part).length <= 75);
  assert.equal(folded.replace(/\r\n /g, ""), long);
  assert.equal(foldLine("short"), "short");
});

test("folding never splits a multi-byte character", () => {
  const line = `SUMMARY:${"é".repeat(60)}`;
  const folded = foldLine(line);
  for (const part of folded.split("\r\n")) assert.ok(new TextEncoder().encode(part).length <= 75);
  assert.equal(folded.replace(/\r\n /g, ""), line);
});

test("DTEND of an all-day event is the next day, across month and year ends", () => {
  assert.equal(addDaysCompact("2026-10-04", 1), "20261005");
  assert.equal(addDaysCompact("2026-10-31", 1), "20261101");
  assert.equal(addDaysCompact("2026-12-31", 1), "20270101");
  assert.equal(addDaysCompact("2028-02-28", 1), "20280229");
});

test("the calendar is a CRLF VCALENDAR with one all-day VEVENT and escaped text", () => {
  const ics = releaseIcs({ date: "2026-12-05", name: "Wings, Swords; & More", code: "MH3", slug: "modern-horizons-3" }, new Date("2026-10-04T10:00:00Z"));
  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 1);
  assert.match(ics, /DTSTART;VALUE=DATE:20261205\r\n/);
  assert.match(ics, /DTEND;VALUE=DATE:20261206\r\n/);
  assert.match(ics, /DTSTAMP:20261004T100000Z\r\n/);
  assert.match(ics, /SUMMARY:Magic: The Gathering Wings\\, Swords\; & More \(MH3\) releases/);
  assert.match(ics, /UID:magic-release-mh3-2026-12-05@mtgcompare\.app/);
  assert.ok(!/\n(?<!\r\n)/.test(ics.replace(/\r\n/g, "")));
});
