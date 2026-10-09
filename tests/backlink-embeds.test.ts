// THE EMBED PAGE'S SNIPPETS WORK WHEN PASTED (owner WP20). /embed hands out iframe snippets for other people's sites; the card price badge's example named the card
// "lightning-bolt" until 2026-10-09, which is no card's slug (a slug is a function of TCGplayer's product text and carries the set and the number: lightning-bolt-m11-149),
// so every copied snippet showed "Not found" (the live /embed/card/lightning-bolt answered 404; /embed/card/counterspell-mh2-267 answers 200). The example is now
// EMBED_EXAMPLE_CARD (src/lib/embed-html.ts), and the badge is rendered for it here from the real products of tests/fixtures/magic-products.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { EMBED_EXAMPLE_CARD } from "../src/lib/embed-html";
import { resetPlaneForTests } from "../src/lib/data/plane/runtime";
import { realMiniTree, writePlaneDir } from "./helpers/data-source";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), "utf8");

async function overPlane<T>(dir: string, run: () => Promise<T>): Promise<T> {
  const was = process.env.PLANE_DIR;
  process.env.PLANE_DIR = dir; resetPlaneForTests();
  try { return await run(); } finally { if (was === undefined) delete process.env.PLANE_DIR; else process.env.PLANE_DIR = was; resetPlaneForTests(); }
}
const badge = async (key: string): Promise<Response> => {
  const { GET } = await import("../src/app/embed/card/[id]/route");
  return GET(new Request(`http://x.test/embed/card/${key}`), { params: { id: key } });
};

test("the example card is a real product's slug: Counterspell, Modern Horizons 2 #267, with a TCGplayer market price", () => {
  const fixture = JSON.parse(read("tests/fixtures/magic-products.json")) as { productId: number; name: string; group: string; tcgNumber: string | null; prices: Record<string, { market: number | null }>; expect: { slug: string } }[];
  const p = fixture.find((x) => x.expect.slug === EMBED_EXAMPLE_CARD);
  assert.ok(p, `${EMBED_EXAMPLE_CARD} is the slug of a product in the fixture`);
  assert.deepEqual([p.productId, p.name, p.group], [238617, "Counterspell", "Modern Horizons 2"]);
  assert.ok(p.prices.Normal?.market != null, "it has a market price, so the badge shows a figure, not 'no price'");
});

test("the badge renders for the example and links to its card page; the old example, a bare name, is not found", async () => {
  const dir = writePlaneDir(realMiniTree());
  try {
    await overPlane(dir, async () => {
      const ok = await badge(EMBED_EXAMPLE_CARD);
      assert.equal(ok.status, 200);
      const html = await ok.text();
      assert.match(html, /<strong>Counterspell<\/strong>/);
      assert.ok(html.includes('<div class="mut">MH2 267</div><div class="big">US$3.94</div>'), "its set, number and the fixture's market price (US$3.94 on 2026-10-07)");
      assert.match(html, /TCGplayer market price/);
      assert.match(html, /href="[^"]*\/card\/counterspell-mh2-267"/, "the badge links back to the card page");
      assert.equal((await badge("238617")).status, 200, "the product id works too");
      assert.equal((await badge("lightning-bolt")).status, 404, "a card name is not a slug: the snippet the page handed out until 2026-10-09");
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the page's snippet and its note use the example; no snippet names a bare card name", () => {
  const page = read("src/app/embed/page.tsx");
  assert.match(page, /import \{ EMBED_EXAMPLE_CARD \} from "@\/lib\/embed-html";/);
  assert.match(page, /frame\(`\/embed\/card\/\$\{EMBED_EXAMPLE_CARD\}`, 130\)/);
  assert.match(page, /note: `Replace \$\{EMBED_EXAMPLE_CARD\} with the last part of any card page's address/);
  assert.doesNotMatch(page, /lightning-bolt/);
});

// The production catalogue, when the dataset of `npm run import:bootstrap` is in .data (skipped without it): the example resolves there too.
const SAMPLE = path.join(ROOT, ".data");
test("THE REAL CATALOGUE (skipped without a dataset): the example card's badge renders", { skip: !fs.existsSync(path.join(SAMPLE, "latest.json")) }, async () => {
  await overPlane(SAMPLE, async () => {
    const r = await badge(EMBED_EXAMPLE_CARD);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /<strong>Counterspell<\/strong>/);
    assert.equal((await badge("lightning-bolt")).status, 404);
  });
});
