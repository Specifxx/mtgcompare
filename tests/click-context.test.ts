import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { rowContext } from "../src/components/OutboundLink";
import { staticSitemap } from "../src/lib/sitemap";
import { footerColumns } from "../src/components/Footer";

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// A just-enough DOM: rows in a list, each with an optional data-cents.
function list(cents: (number | null)[]) {
  const rows: { attrs: Record<string, string>; parentElement: unknown; hasAttribute: (n: string) => boolean; getAttribute: (n: string) => string | null; closest: (s: string) => unknown }[] = [];
  const parent = { children: rows };
  for (const c of cents) {
    const attrs: Record<string, string> = { "data-offer-row": "" };
    if (c != null) attrs["data-cents"] = String(c);
    const row = {
      attrs,
      parentElement: parent,
      hasAttribute: (n: string) => n in attrs,
      getAttribute: (n: string) => attrs[n] ?? null,
      closest: (): unknown => row,
    };
    rows.push(row);
  }
  return rows;
}

test("rowContext: position, price rank and the gap to the cheapest, from the row's own list", () => {
  const rows = list([null, 5000, 4000, 4000, 4400]);
  assert.deepEqual(rowContext(rows[1] as unknown as Element), { pos: 2, rank: 4, gap_pct: 25 });
  assert.deepEqual(rowContext(rows[2] as unknown as Element), { pos: 3, rank: 1, gap_pct: 0 });
  assert.deepEqual(rowContext(rows[3] as unknown as Element), { pos: 4, rank: 1, gap_pct: 0 });
  assert.deepEqual(rowContext(rows[4] as unknown as Element), { pos: 5, rank: 3, gap_pct: 10 });
  // a row with no price (a search row) has a position and nothing else
  assert.deepEqual(rowContext(rows[0] as unknown as Element), { pos: 1 });
  // a link outside any row sends nothing
  assert.deepEqual(rowContext({ closest: () => null } as unknown as Element), {});
  assert.deepEqual(rowContext(null), {});
});

test("the click log's fields reach GA4 only, and Vercel's buy_click keeps its three properties", () => {
  const src = read("src/components/OutboundLink.tsx");
  assert.match(src, /track\("buy_click", \{ retailer: [^}]*placement: [^}]*link_type: [^}]*\}\)/);
  assert.match(src, /paid: paid \? 1 : 0/);
  assert.match(src, /\.\.\.rowContext\(el\)/);
});

test("rows carry data-cents only for an open, priced row in the region's currency", () => {
  const rows = read("src/components/OfferRows.tsx");
  assert.match(rows, /d\.open && !d\.search && d\.comparable !== false && d\.cents > 0/);
  assert.match(read("src/components/EbayStrip.tsx"), /data-cents=\{item && cents != null/);
});

test("/methodology exists, is in the sitemap and the footer; the footer says it is not affiliated", () => {
  assert.ok(fs.existsSync(new URL("../src/app/(site)/methodology/page.tsx", import.meta.url)));
  assert.ok(staticSitemap({}).some((u) => u.url.endsWith("/methodology")));
  assert.ok(footerColumns(null).some((c) => c.links.some((l) => l.href === "/methodology")));
  assert.match(read("src/components/Footer.tsx"), /not affiliated with Wizards of the Coast, Hasbro/);
});

test("the product page says when its prices were checked", () => {
  const page = read("src/app/[region]/p/[slug]/page.tsx");
  assert.match(page, /Prices checked <Ago iso=\{newestCheck\}/);
});
