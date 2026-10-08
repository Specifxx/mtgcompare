import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseAddBody, parseCardId, parsePatchBody } from "../src/lib/collection-server";

// The /api/collection bodies, validated by hand (the site carries no zod).
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("an add body defaults to one Near Mint copy and leaves the finish to the owner (Normal unless the product has only a Foil)", () => {
  assert.deepEqual(parseAddBody({ cardId: 454665 }), { cardId: 454665, condition: "NM", quantity: 1, costBasisCents: undefined, note: undefined });
  assert.equal(parseAddBody({ cardId: "454665" })?.cardId, 454665, "a numeric string id is accepted");
  assert.deepEqual(parseAddBody({ cardId: 1, condition: "LP", quantity: 3, isFoil: true, costBasisCents: 500, costBasisIsTotal: true, note: " pulled " }), {
    cardId: 1, condition: "LP", quantity: 3, isFoil: true, costBasisCents: 500, costBasisIsTotal: true, note: "pulled",
  });
});

test("an add body refuses what zod refused", () => {
  for (const bad of [null, {}, { cardId: 0 }, { cardId: -1 }, { cardId: "abc" }, { cardId: 1, condition: "Mint" }, { cardId: 1, quantity: 0 }, { cardId: 1, quantity: 1000 },
    { cardId: 1, quantity: 1.5 }, { cardId: 1, isFoil: "yes" }, { cardId: 1, costBasisCents: -1 }, { cardId: 1, costBasisCents: 100_000_001 }, { cardId: 1, note: "x".repeat(121) }]) {
    assert.equal(parseAddBody(bad), null, JSON.stringify(bad));
  }
  assert.equal(parseCardId(1.5), null);
  assert.equal(parseCardId("12345678901"), null);
});

test("a patch body allows quantity 0 (delete) and an explicit null cost or note", () => {
  assert.deepEqual(parsePatchBody({ quantity: 0 }), { quantity: 0 });
  assert.deepEqual(parsePatchBody({ costBasisCents: null, note: null }), { costBasisCents: null, note: null });
  assert.deepEqual(parsePatchBody({ condition: "DMG", costBasisIsTotal: false }), { condition: "DMG", costBasisIsTotal: false });
  assert.equal(parsePatchBody({ quantity: 1000 }), null);
  assert.equal(parsePatchBody({ condition: "mint" }), null);
});

test("the routes are thin: same-origin writes, the session read, no database import", () => {
  for (const f of ["src/app/api/collection/route.ts", "src/app/api/collection/[id]/route.ts", "src/app/api/collection/import/route.ts", "src/app/api/collection/share/route.ts"]) {
    const src = read(f);
    assert.match(src, /sameOrigin\(req\)/, f);
    assert.match(src, /getCurrentUser\(\)/, f);
    assert.doesNotMatch(src, /@\/lib\/db"/, f);
  }
  const get = read("src/app/api/collection/route.ts");
  assert.match(get, /collectionItems\(user\.id\)/);
  const lib = read("src/lib/collection-server.ts");
  assert.match(lib, /COLLECTION_TAKE = 2000/);
  assert.match(lib, /const isFoil = normalizeFoil\(\{ mask: maskOfCard\(card\) \}, d\.isFoil \?\? false\)/, "the finish is the owner's pick, forced to the only finish a product has");
  assert.match(lib, /collectionRowStore\(prisma, \{ userId: account\.id, cardId: card\.id, condition: d\.condition, isFoil \}, d\.note, card\.setId\)/, "the row's set is written from the published data");
});
