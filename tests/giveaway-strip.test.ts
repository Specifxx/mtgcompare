import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The giveaway strip on the home and product pages (owner, 2026-11-26): inline, no ads, the rules' own numbers, the invite link.
const read = (f: string) => readFileSync(f, "utf8");
// The code without its comments (they name what the strip must never be).
const strip = read("src/components/giveaway/GiveawayStrip.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the strip shows the rules' own numbers, never its own", () => {
  assert.match(strip, /ENTRY_POINTS \+ BONUS_POINTS/);
  assert.match(strip, /CHECKIN_POINTS/);
  assert.match(strip, /REFERRAL_POINTS/);
  assert.doesNotMatch(strip, /\+(5|25|40|50)\b/, "point values come from lib/giveaway.ts");
  const lib = read("src/lib/giveaway.ts");
  assert.match(lib, /ENTRY_POINTS = 10;/);
  assert.match(lib, /BONUS_POINTS = 40;/);
  assert.match(lib, /CHECKIN_POINTS = 5;/);
  assert.match(lib, /REFERRAL_POINTS = 25;/);
});

test("the strip is inline: no ad, no pop-up, no overlay, nothing once the giveaway closes", () => {
  assert.doesNotMatch(strip, /ebay|amazon|adsbygoogle|AdSlot|InlineAds|window\.open|position:\s*fixed|\bfixed\b|<dialog/i);
  assert.match(strip, /if \(!open\) return <>\{fallback\}<\/>/);
  assert.match(strip, /giveawayState\(\) === "open"/);
});

test("the strip offers the daily check-in and a clear invite link, through the giveaway's own call", () => {
  assert.match(strip, /giveawayCall\(\{ action, ref \}\)/);
  assert.match(strip, /"checkin"/);
  assert.match(strip, /inviteUrl/);
  assert.match(strip, /Get your invite link/);
  assert.match(strip, /\/giveaway#invite/);
  assert.match(read("src/components/giveaway/GiveawayPanel.tsx"), /id="invite"/);
  // Signed-in reads are held 10 minutes a tab, so product pages don't call RiftCompare on every view.
  assert.match(strip, /sessionStorage/);
});

test("the product page carries the strip under the price table, after the community questions", () => {
  const page = read("src/app/[region]/p/[slug]/page.tsx");
  const pulse = page.indexOf("<CollectorPulse");
  const gw = page.indexOf('<GiveawayStrip surface="product"');
  assert.ok(pulse > 0 && gw > pulse, "strip sits after the collector pulse");
  assert.equal((page.match(/<GiveawayStrip/g) ?? []).length, 1);
});
