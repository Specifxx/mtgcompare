// The pre-order hub's links (components/PreorderBanner.tsx): from the region home, the landing page and the set's product pages,
// generic over lib/preorder-guides.ts, gone on release day; the hub itself stays in the sitemap until then.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PreorderBanner, PreorderRegionLinks } from "../src/components/PreorderBanner";
import { openPreorderGuides } from "../src/lib/preorder-guides";
import { REGION_LIST } from "../src/lib/regions";

(globalThis as unknown as { React: typeof React }).React = React;

test("before release: the Star Trek banner links the region's hub, with the date and how far off it is", () => {
  const html = renderToStaticMarkup(React.createElement(PreorderBanner, { region: "au", today: "2026-10-22" }));
  assert.match(html, /href="\/au\/preorders\/star-trek"/);
  assert.match(html, /out 13 November 2026/);
  assert.match(html, /releases in 22 days/);
  assert.doesNotMatch(html, /\$|£|€/, "no price in a cached banner");
});

test("the landing page links the hub in all seven regions", () => {
  const html = renderToStaticMarkup(React.createElement(PreorderRegionLinks, { today: "2026-10-22" }));
  for (const r of REGION_LIST) assert.match(html, new RegExp(`href="/${r.region}/preorders/star-trek"`), r.region);
});

test("on and after release day: no banner (the registry retires it)", () => {
  assert.equal(renderToStaticMarkup(React.createElement(PreorderBanner, { region: "au", today: "2026-11-13" })), "");
  assert.equal(renderToStaticMarkup(React.createElement(PreorderRegionLinks, { today: "2026-11-13" })), "");
  assert.equal(openPreorderGuides("2026-11-13").length, 0);
});
