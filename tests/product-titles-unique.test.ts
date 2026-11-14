// Product page <title>s are unique within a region (seo-titles.ts productTitle with titleSiblings, 2026-11-14). The short title keeps
// a long name's LAST words, so in the US four Warhammer 40,000 Collector's Edition Commander decks were all "MTG 40K … Commander Deck
// (Collector's Edition) price, US": the decks' own names were cut. Pinned on the committed data files: every region's product pages
// have distinct titles (two products whose names are the same word for word excepted: nothing in the name tells them apart), each at
// most 60 characters, and only a title that was shared changed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.PUBLIC_DATA_MODE = "files";

interface Product { id: string; slug: string; name: string; productType: string; setCode: string | null }
interface Stat { productId: string; market: string; lowestPriceCents: number | null }
const products = JSON.parse(readFileSync("data/public/products.json", "utf8")) as Product[];
const stats = JSON.parse(readFileSync("data/public/product-stats.json", "utf8")) as Stat[];
const byId = new Map(products.map((p) => [p.id, p]));

async function titles() {
  const { REGION_LIST } = await import("../src/lib/regions");
  const { seoCopy, shownTitle } = await import("../src/lib/seo-titles");
  const { titleSiblings } = await import("../src/lib/product-data");
  const out: { region: string; slug: string; name: string; title: string; before: string }[] = [];
  for (const r of REGION_LIST) {
    const memo = new Map<string, Awaited<ReturnType<typeof titleSiblings>>>();
    for (const s of stats) {
      const p = s.market === r.market ? byId.get(s.productId) : undefined;
      if (!p) continue;
      const key = p.setCode ?? "";
      if (!memo.has(key)) memo.set(key, await titleSiblings(r.market, p.setCode ?? null));
      const sib = memo.get(key)!;
      const o = { name: p.name, market: r.market, inName: r.inName, cheapestCents: s.lowestPriceCents, productType: p.productType, setCode: p.setCode };
      out.push({ region: r.region, slug: p.slug, name: p.name, title: shownTitle(seoCopy.productTitle(o, sib.here, sib.all)), before: shownTitle(seoCopy.productTitle(o)) });
    }
  }
  return out;
}

test("no two product pages of a region share a <title>, and each is at most 60 characters", async () => {
  const all = await titles();
  assert.ok(all.length > 1000, "the data files have product pages");
  const groups = new Map<string, typeof all>();
  for (const t of all) {
    assert.ok(t.title.length <= 60, `${t.region}/${t.slug}: "${t.title}" is ${t.title.length}`);
    const k = `${t.region}|${t.title}`;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  for (const [k, g] of groups) {
    if (g.length < 2) continue;
    assert.equal(new Set(g.map((t) => t.name)).size, 1, `${k} is the title of ${g.map((t) => t.slug).join(", ")}`);
  }
  // Only a title another page of its region had too is changed.
  const before = new Map<string, number>();
  for (const t of all) before.set(`${t.region}|${t.before}`, (before.get(`${t.region}|${t.before}`) ?? 0) + 1);
  for (const t of all) if (t.title !== t.before) assert.ok(before.get(`${t.region}|${t.before}`)! > 1, `${t.region}/${t.slug}: "${t.before}" was not shared`);
});

test("the Warhammer 40,000 Collector's Edition decks keep their own names", async () => {
  const { seoCopy, shownTitle } = await import("../src/lib/seo-titles");
  const decks = ["Necron Dynasties", "Tyranid Swarm", "The Ruinous Powers", "Forces of the Imperium"];
  const names = decks.flatMap((d) => [`Warhammer 40,000 - ${d} Commander Deck`, `Warhammer 40,000 - ${d} Commander Deck (Collector's Edition)`]);
  const sibs = names.map((name) => ({ name, productType: "Commander Deck", setCode: "40k" }));
  const shown = names.map((name) => shownTitle(seoCopy.productTitle({ name, market: "US", inName: "the US", cheapestCents: null, productType: "Commander Deck", setCode: "40k" }, sibs)));
  assert.equal(new Set(shown).size, names.length, shown.join(" / "));
  decks.forEach((d, i) => {
    const first = d.split(" ").find((w) => w !== "The")!;
    assert.match(shown[i * 2 + 1], new RegExp(first), shown[i * 2 + 1]);
    assert.match(shown[i * 2 + 1], /Collector's/, shown[i * 2 + 1]);
    assert.ok(shown[i * 2 + 1].length <= 60, shown[i * 2 + 1]);
  });
  // Without siblings (the database mode), the title is the one it always was.
  assert.equal(
    shownTitle(seoCopy.productTitle({ name: names[1], market: "US", inName: "the US", cheapestCents: null, productType: "Commander Deck", setCode: "40k" })),
    "MTG 40K … Commander Deck (Collector's Edition) price, US",
  );
});

test("the product page passes the set's products to its title", () => {
  const src = readFileSync("src/app/[region]/p/[slug]/page.tsx", "utf8");
  assert.match(src, /titleSiblings\(r\.market, p\.setCode \?\? null\)/);
  assert.match(src, /seoCopy\.productTitle\([^;]*siblings\.here, siblings\.all\)/);
});
