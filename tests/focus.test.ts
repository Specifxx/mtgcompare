// The low-traction cull (lib/focus.ts, owner 2026-11-07): what reaches data/public/, and where a culled URL goes.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { demandSlugs, focusCatalog } from "../src/lib/focus";
import { SETS } from "../src/lib/sets";

const now = new Date();
const today = now.toISOString().slice(0, 10);
const UPCOMING = SETS.find((s) => s.releaseDate > today)?.code ?? null;
const RECENT = SETS.find((s) => s.releaseDate <= today && Date.parse(today) - Date.parse(s.releaseDate) < 60 * 86_400_000)?.code ?? null;
const P = (id: string, productType: string, setCode: string | null = null) => ({ id, slug: id, productType, setCode });
const O = (productId: string, store: string, market: string, inStock = true) => ({ productId, store, market, inStock });

test("Secret Lairs, precons and other multi-set products need two in-stock sources in one market", () => {
  const products = [P("tin-two", "Secret Lair Drop"), P("tin-split", "Secret Lair Drop"), P("tin-one", "Secret Lair Drop"), P("deck-none", "Deck")];
  const offers = [O("tin-two", "a", "AU"), O("tin-two", "b", "AU"), O("tin-split", "a", "AU"), O("tin-split", "b", "US"), O("tin-one", "a", "AU")];
  const { keep, culled } = focusCatalog(products, offers, new Set(), now);
  assert.deepEqual([...keep], ["tin-two"]);
  assert.deepEqual(culled, { "tin-split": "secret-lair", "tin-one": "secret-lair", "deck-none": "decks" });
});

test("core products stay with any listing, even sold out; nothing listed at all is culled", () => {
  const products = [P("box-sold-out", "Play Booster Box"), P("box-never", "Play Booster Box")];
  const { keep } = focusCatalog(products, [O("box-sold-out", "a", "US", false)], new Set(), now);
  assert.deepEqual([...keep], ["box-sold-out"]);
});

test("search demand and new or upcoming sets override the rule", () => {
  const products = [P("searched-tin", "Secret Lair Drop"), P("new-blister", "Scene Box", RECENT), P("future-deck", "Deck", UPCOMING)];
  const { keep } = focusCatalog(products, [], new Set(["searched-tin"]), now);
  assert.deepEqual([...keep].sort(), ["future-deck", "new-blister", "searched-tin"]);
});

test("demand is a click or ten impressions on a product page in any region", () => {
  const s = demandSlugs({ "/au/p/a": [1, 1, 5], "/us/p/b": [0, 10, 9], "/uk/p/c": [0, 9, 9], "/au/type/decks": [9, 99, 1] });
  assert.deepEqual([...s].sort(), ["a", "b"]);
});

test("the exporter applies it and the product page 301s a culled slug", () => {
  const ex = fs.readFileSync("scripts/export-public-data.ts", "utf8");
  assert.match(ex, /focusCatalog\(/);
  assert.match(ex, /CULLED_FILE = "culled\.json"/);
  const page = fs.readFileSync("src/app/[region]/p/[slug]/page.tsx", "utf8");
  assert.match(page, /culledTarget\(slug, r\.region\)/);
  assert.match(page, /permanentRedirect\(to\)/);
});
