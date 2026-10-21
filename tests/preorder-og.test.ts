// The pre-order pages' share card (app/og/preorders/[set]): drawn from the registry and committed art, no price, CDN-cached, and the
// page's og:image.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PREORDER_GUIDES } from "../src/lib/preorder-guides";
import { PREORDER_OG_ART, preorderOgPath } from "../src/lib/preorder-og";
import { SET_BY_CODE } from "../src/lib/sets";
import React from "react";
import { GET } from "../src/app/og/preorders/[set]/route";

// tsx compiles the route's JSX to React.createElement (Next uses the automatic runtime).
(globalThis as { React?: unknown }).React = React;

const ROUTE = readFileSync(join(process.cwd(), "src/app/og/preorders/[set]/route.tsx"), "utf8").replace(/^\s*\/\/.*$/gm, "");

test("every art file the card names is committed", () => {
  for (const [slug, files] of Object.entries(PREORDER_OG_ART)) {
    assert.ok(files.length <= 4, slug);
    for (const f of files) assert.ok(existsSync(join(process.cwd(), "public/preorders", slug, f)), `${slug}/${f}`);
  }
});

test("each pre-order set draws a PNG with a day of CDN cache; an unknown set is a 404", async () => {
  for (const g of PREORDER_GUIDES) {
    const slug = SET_BY_CODE.get(g.setCode)!.slug;
    const res = GET(new Request(`https://x${preorderOgPath(slug)}`), { params: { set: slug } });
    assert.equal(res.status, 200, slug);
    assert.equal(res.headers.get("content-type"), "image/png");
    assert.match(res.headers.get("vercel-cdn-cache-control") ?? "", /s-maxage=86400/);
    const png = Buffer.from(await res.arrayBuffer());
    assert.equal(png.subarray(1, 4).toString(), "PNG");
  }
  assert.equal(GET(new Request("https://x/og/preorders/nope"), { params: { set: "nope" } }).status, 404);
});

test("the card is not prerendered, reads no data or network, and shows no price", () => {
  assert.doesNotMatch(ROUTE, /generateStaticParams|export const revalidate|@\/lib\/(data|db)|fetch\(|money\(|priceCents/);
  assert.match(ROUTE, /export const dynamic = "force-dynamic"/);
});

test("the pre-order page's og:image is the card", () => {
  const page = readFileSync(join(process.cwd(), "src/app/[region]/preorders/[set]/page.tsx"), "utf8");
  assert.match(page, /image: `\$\{SITE_URL\}\$\{preorderOgPath\(set\.slug\)\}`/);
});
