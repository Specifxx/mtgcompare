// Card image alt text: descriptive, keyword-aware, never empty (parity P42).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { cardImageAlt, FALLBACK_ALT } from "../src/lib/image-alt";

test("a plain printing names the card, set, code and collector number", () => {
  assert.equal(cardImageAlt({ name: "Lightning Bolt", setName: "Magic 2011", setCode: "m11", number: "149" }), "Lightning Bolt from Magic 2011 (M11) #149, Magic: The Gathering card");
});

test("treatment words and the foil finish are in the text", () => {
  const a = cardImageAlt({ name: "Sol Ring", variant: "Borderless · Serial Numbered", setName: "Commander Masters", setCode: "CMM", number: "270", finish: "F" });
  assert.match(a, /^Sol Ring \(Borderless, Serial Numbered\) from Commander Masters \(CMM\) #270, Foil/);
  assert.doesNotMatch(a, /·/);
});

test("an etched unit uses the caller's finish word; a non-foil says nothing about finish", () => {
  assert.match(cardImageAlt({ name: "The One Ring", setName: "The Lord of the Rings: Tales of Middle-earth", finish: "F", finishWord: "Foil Etched" }), /, Foil Etched,/);
  assert.doesNotMatch(cardImageAlt({ name: "Counterspell", setName: "Time Spiral Remastered", finish: "N" }), /Foil/);
});

test("the alt is never empty and no card image in the owned components is rendered without one", () => {
  assert.ok(FALLBACK_ALT.length > 10);
  for (const f of ["src/components/CardImage.tsx", "src/components/CardTileClient.tsx", "src/components/QuickView.tsx"]) {
    const src = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    for (const m of src.matchAll(/<img\b[^>]*>/g)) assert.match(m[0], /\balt=/, `${f}: ${m[0].slice(0, 80)}`);
  }
});
