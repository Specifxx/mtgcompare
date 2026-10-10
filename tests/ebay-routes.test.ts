// The two public eBay routes (src/app/api/ebay/panel/[productId], src/app/api/ebay/chase) and the islands that fetch them (EbayCardPanel, EbayChaseStrip).
// Until 2026-10-10 neither route existed: both islands got a 404 and showed plain search links whatever Neon held, and no test noticed, so the last test here
// checks every "/api/..." path a page or component names against the route files.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { EBAY_ROUTE_CACHE, chasePayload, panelPayload, panelProductId } from "../src/lib/listing-panel";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const codeOnly = (s: string) => s.replace(/^\s*\/\/.*$/gm, "");
const PANEL = "src/app/api/ebay/panel/[productId]/route.ts";
const CHASE = "src/app/api/ebay/chase/route.ts";

test("each island's endpoint is a route file", () => {
  assert.match(read("src/components/EbayCardPanel.tsx"), /PANEL_ENDPOINT = "\/api\/ebay\/panel"/);
  assert.match(read("src/components/EbayCardPanel.tsx"), /fetch\(`\$\{PANEL_ENDPOINT\}\/\$\{productId\}`/);
  assert.ok(fs.existsSync(path.join(ROOT, PANEL)), PANEL);
  assert.match(read("src/components/EbayChaseStrip.tsx"), /CHASE_ENDPOINT = "\/api\/ebay\/chase"/);
  assert.ok(fs.existsSync(path.join(ROOT, CHASE)), CHASE);
});

test("both routes are force-dynamic GETs that read Neon only through the self-caching loaders of @/lib/data", () => {
  for (const f of [PANEL, CHASE]) {
    const src = codeOnly(read(f));
    assert.match(src, /export const dynamic = "force-dynamic";/, f);
    assert.deepEqual([...src.matchAll(/^export (?:const|async function|function) (\w+)/gm)].map((m) => m[1]).sort(), ["GET", "dynamic"], `${f}: a route file exports only what Next accepts`);
    assert.doesNotMatch(src, /revalidate|unstable_cache|@\/lib\/db|prisma|from "@\/lib\/ebay/, `${f}: no second cache, no direct query, no eBay API module`);
    assert.match(src, /from "@\/lib\/data"/, f);
    assert.match(src, /EBAY_ROUTE_CACHE\.(rows|missing|none)/, `${f}: Cache-Control from EBAY_ROUTE_CACHE`);
  }
  assert.match(codeOnly(read(CHASE)), /await getChaseBanner\(\)/);
});

test("the panel route asks Neon only for a product the pass can have searched: a tracked single or a published sealed product", () => {
  const src = codeOnly(read(PANEL));
  const gate = src.indexOf("card.cls === 0 && card.tracked !== 0"), sealed = src.indexOf("sealedExists([id])"), neon = src.indexOf("getEbayPanel(id)");
  assert.ok(gate > 0 && sealed > 0 && neon > 0, "the gate, the sealed check and the read are all there");
  assert.ok(neon > gate && neon > sealed, "getEbayPanel comes after the gate");
  assert.match(src, /if \(!searched\) return NextResponse\.json\(EMPTY, \{ headers: \{ "Cache-Control": failed \? EBAY_ROUTE_CACHE\.missing : EBAY_ROUTE_CACHE\.none \} \}\)/, "a failed plane read is a five-minute answer, a real 'not searched' an hour");
  assert.match(src, /if \(id == null\) return NextResponse\.json\(\{ error: "not found" \}, \{ status: 404/);
});

test("panelProductId takes a positive integer id and nothing else", () => {
  assert.equal(panelProductId("487805"), 487805);
  assert.equal(panelProductId("1"), 1);
  assert.equal(panelProductId("2147483647"), 2147483647);
  for (const bad of ["0", "-1", "01", "1.5", "1e5", "", " 1", "abc", "2147483648", "99999999999", "1;drop"]) assert.equal(panelProductId(bad), null, bad);
});

test("the payloads: the panel drops EbayBest, the chase strip always gets v1 with a tiles array", () => {
  const listing = { market: "US", finish: "N", rank: 0, priceCents: 1999, shippingCents: 0, currency: "USD", itemId: "v1|1|0", title: "x", imageUrl: null, checkedAt: "2026-10-10T00:00:00Z" } as const;
  const bundle = { best: [{ finish: "N", market: "US", priceCents: 1999, shipCents: 0, itemId: "v1|1|0", checkedAt: "2026-10-10T00:00:00Z" }], listings: [listing], graded: [] };
  assert.deepEqual(Object.keys(panelPayload(bundle)).sort(), ["graded", "listings"]);
  assert.deepEqual(panelPayload(bundle).listings, [listing]);
  assert.deepEqual(chasePayload(null), { v: 1, tiles: [] });
  assert.deepEqual(chasePayload({ tiles: [1, 2] }), { v: 1, tiles: [1, 2] });
  for (const v of Object.values(EBAY_ROUTE_CACHE)) assert.match(v, /^public, s-maxage=\d+/);
});

// Every "/api/..." path a page or component names (a fetch, an href, an endpoint constant) resolves to a route file; `${...}` is one dynamic segment, and a
// constant that a fetch extends with one more segment ("/api/ebay/panel" + "/<id>") counts when that longer path resolves.
test("every /api path a page or component names has a route", () => {
  const files = (dir: string): string[] => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : /\.(tsx?|jsx?)$/.test(e.name) ? [path.join(dir, e.name)] : []));
  const routes = files("src/app/api").filter((f) => /\/route\.tsx?$/.test(f)).map((f) => path.dirname(path.relative(path.join(ROOT, "src/app"), path.join(ROOT, f))).split(path.sep));
  const resolves = (segs: string[]): boolean => routes.some((r) => (r.some((s) => s.startsWith("[...") || s.startsWith("[[...")) ? r.slice(0, r.findIndex((s) => s.startsWith("[..") || s.startsWith("[[.."))).every((s, i) => s.startsWith("[") || s === segs[i]) : r.length === segs.length && r.every((s, i) => s.startsWith("[") || s === segs[i])));
  const missing: string[] = [];
  for (const f of [...files("src/components"), ...files("src/app").filter((x) => !x.startsWith(path.join("src", "app", "api")) && !/robots\.ts$/.test(x))]) {
    for (const m of read(f).matchAll(/["'`](\/api\/[A-Za-z0-9_\-/.${}]*)/g)) {
      const p = m[1]!.replace(/([^/])\$\{.*$/, "$1").replace(/\$\{[^}]*\}?/g, "X").replace(/\/+$/, "");   // "/api/basket${q}" is a query suffix, "/api/x/${id}" a segment
      const segs = p.split("/").filter(Boolean);
      if (!resolves(segs) && !resolves([...segs, "X"])) missing.push(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});
