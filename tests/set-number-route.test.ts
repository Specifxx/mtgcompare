// The set + number door: /card/[slug]/[number] where [slug] holds the Scryfall set code.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { setNumberOutcome } from "../src/lib/card-seo";

const CARD_DIR = path.join(__dirname, "..", "src", "app", "card");

test("every dynamic directory beside /card/[slug] is named [slug] (a different name makes next build throw)", () => {
  const dyn = fs.readdirSync(CARD_DIR).filter((d) => d.startsWith("["));
  assert.deepEqual(dyn, ["[slug]"]);
  const inner = fs.readdirSync(path.join(CARD_DIR, "[slug]")).filter((d) => d.startsWith("["));
  assert.deepEqual(inner, ["[number]"]);
  assert.ok(fs.existsSync(path.join(CARD_DIR, "[slug]", "[number]", "page.tsx")));
});

test("no card on the pair is a 404, one is a permanent redirect, several are listed", () => {
  assert.deepEqual(setNumberOutcome([]), { kind: "missing" });
  assert.deepEqual(setNumberOutcome(undefined), { kind: "missing" });
  assert.deepEqual(setNumberOutcome([{ slug: "cmm-sol-ring-270" }]), { kind: "redirect", to: "/card/cmm-sol-ring-270" });
  // 7th Edition shares one product for 213 and 213 star: a second row with the same pair is shown, never picked.
  const two = [{ slug: "cmm-sol-ring-270" }, { slug: "cmm-sol-ring-270-borderless" }];
  const o = setNumberOutcome(two);
  assert.equal(o.kind, "choose");
  assert.equal(o.kind === "choose" ? o.cards.length : 0, 2);
});

test("the door reads the published data and never a database", () => {
  const src = fs.readFileSync(path.join(CARD_DIR, "[slug]", "[number]", "page.tsx"), "utf8");
  assert.doesNotMatch(src, /@\/lib\/db"/);
  assert.match(src, /resolveBySetNumber/);
  assert.match(src, /force-dynamic/);
  assert.doesNotMatch(src, /generateStaticParams/);
});
