import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { attrFacets, attrValues } from "@/lib/hubs";
import { SITE } from "@/site.config";

// Attribute hubs (SITE.cardHubs, /cards/<facet>/<slug>), 2026-11-01.
test("multi-valued attributes split and lose their brackets", () => {
  const trait = { facet: "trait", attr: "Trait", noun: ["trait", "traits"] as [string, string], split: "\\)\\s*\\(" };
  assert.deepEqual(attrValues(trait, "(Earth Federation) (White Base Team)"), ["Earth Federation", "White Base Team"]);
  assert.deepEqual(attrValues(trait, "(Zeon)"), ["Zeon"]);
  const ink = { facet: "ink", attr: "InkType", noun: ["ink", "inks"] as [string, string], split: ";" };
  assert.deepEqual(attrValues(ink, "Amethyst;Sapphire"), ["Amethyst", "Sapphire"]);
  const attr = { facet: "attribute", attr: "Attribute", noun: ["attribute", "attributes"] as [string, string], titleCase: true };
  assert.deepEqual(attrValues(attr, "DARK"), ["Dark"]);
  assert.deepEqual(attrValues(attr, undefined), []);
});

test("every hub has enough cards, a slug, and never takes the rarity segment", () => {
  for (const f of attrFacets()) {
    assert.notEqual(f.cfg.facet, "rarity");
    for (const h of f.hubs) {
      assert.ok(h.slug, `${f.cfg.facet} ${h.label}`);
      assert.ok(h.items.length >= (f.cfg.minItems ?? 12), `${f.cfg.facet}/${h.slug} is thin`);
    }
    assert.equal(new Set(f.hubs.map((h) => h.slug)).size, f.hubs.length, `${f.cfg.facet} slugs collide`);
  }
  assert.ok((SITE.cardHubs ?? []).every((c) => /^[a-z-]+$/.test(c.facet)));
});

test("hub pages are cached a day and never prerendered", () => {
  for (const f of ["src/app/cards/[facet]/page.tsx", "src/app/cards/[facet]/[slug]/page.tsx"]) {
    const src = fs.readFileSync(f, "utf8");
    assert.match(src, /revalidate = 86400/, f);
    assert.match(src, /generateStaticParams = \(\) => \[\]/, f);
  }
});
