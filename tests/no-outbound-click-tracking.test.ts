import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Owner's call (2026-10-05): outbound shop clicks are not recorded any more, so
// no click costs a database write. GA's buy_click (client-side, to Google) is
// the only count. The Plus/Premium interest beacon is a separate, low-volume
// thing and stays.
const src = new URL("../src", import.meta.url);
const files = fs.readdirSync(src, { recursive: true }).map(String).filter((f) => /\.(ts|tsx)$/.test(f));
const read = (f: string) => fs.readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("no code writes or reads the ClickEvent table", () => {
  for (const f of files) assert.doesNotMatch(read(f).replace(/\/\/.*$/gm, ""), /clickEvent\./, f);
});

test("the outbound-click route, listener and admin page are gone", () => {
  for (const p of ["app/api/click/route.ts", "components/OutboundBeacon.tsx", "app/admin/clicks/page.tsx", "lib/click-event.ts"]) {
    assert.equal(fs.existsSync(new URL(`../src/${p}`, import.meta.url)), false, p);
  }
  assert.doesNotMatch(read("app/layout.tsx"), /OutboundBeacon/);
  assert.doesNotMatch(read("components/admin/AdminNav.tsx"), /admin\/clicks/);
  assert.doesNotMatch(read("app/admin/page.tsx"), /admin\/clicks/);
});

test("no page, script or component posts to /api/click", () => {
  for (const f of files) assert.doesNotMatch(read(f), /["'`]\/api\/click["'`]/, f);
});

test("the plan-interest beacon stays", () => {
  assert.ok(fs.existsSync(new URL("../src/app/api/premium/click/route.ts", import.meta.url)));
  assert.match(read("lib/beacons.ts"), /premiumClick\.create/);
});
