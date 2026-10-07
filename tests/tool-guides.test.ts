import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { POSTS } from "../src/lib/blog";
import { TOOL_GUIDES, TOOL_ROUTES, guidesForTool, toolsForArticle } from "../src/lib/content/tool-guides";
import { HUB_INTROS, hubIntro } from "../src/lib/content/hub-intros";
import { plainIntroText } from "../src/components/HubIntro";

// Tool and guide links (RiftCompare's tests/tool-guides.test.ts, for OP
// Compare): one map read both ways, so a tool page links the guides that
// explain it and each of those guides links the tool back.

const ROOT = process.cwd();
const published = new Map(POSTS.map((p) => [p.slug, p]));
const redirectSources = new Set([...readFileSync(join(ROOT, "next.config.js"), "utf8").matchAll(/source:\s*"(\/[^"]*)"/g)].map((m) => m[1]));

test("every route in the map is a real page", () => {
  for (const route of TOOL_ROUTES) assert.ok(existsSync(join(ROOT, "src/app", route, "page.tsx")), `${route} has no page.tsx`);
});

test("every guide in the map is published, reachable (no redirect shadows it) and at most three per tool", () => {
  for (const route of TOOL_ROUTES) {
    const guides = TOOL_GUIDES[route].guides;
    assert.ok(guides.length >= 1 && guides.length <= 3, `${route}: 1-3 guides`);
    assert.equal(new Set(guides.map((g) => g.slug)).size, guides.length, `${route}: a guide listed twice`);
    for (const g of guides) {
      assert.ok(published.get(g.slug), `${route} -> ${g.slug} is not a published post`);
      assert.ok(!redirectSources.has(`/blog/${g.slug}`), `/blog/${g.slug} is shadowed by a next.config.js redirect`);
    }
    assert.equal(guidesForTool(route).length, guides.length, `${route}: every listed guide resolves`);
  }
});

test("reasons describe the guide, with no invest/flip framing and no retired tool", () => {
  for (const route of TOOL_ROUTES) {
    for (const g of TOOL_GUIDES[route].guides) {
      assert.ok(g.reason.length >= 20 && g.reason.length <= 110, `${route} -> ${g.slug}: reason length ${g.reason.length}`);
      assert.doesNotMatch(g.reason, /\b(invest|flip|scalp|profit|predict|will rise|ahead of the market)/i, `${route} -> ${g.slug}`);
      assert.doesNotMatch(g.reason, /buy list planner|box value|bulk pricer/i, `${route} -> ${g.slug}`);
    }
  }
});

test("toolsForArticle is the inverse of the map, minus the excluded link, capped at three", () => {
  for (const route of TOOL_ROUTES) {
    for (const g of TOOL_GUIDES[route].guides) {
      assert.ok(toolsForArticle(g.slug, undefined, 99).map((t) => t.href).includes(route), `${g.slug} should link back to ${route}`);
    }
  }
  const counts = new Map<string, number>();
  for (const route of TOOL_ROUTES) for (const g of TOOL_GUIDES[route].guides) counts.set(g.slug, (counts.get(g.slug) ?? 0) + 1);
  const shared = [...counts].find(([, n]) => n > 3);
  if (shared) {
    assert.equal(toolsForArticle(shared[0]).length, 3);
    assert.ok(!toolsForArticle(shared[0], "/tools/rising", 99).some((t) => t.href === "/tools/rising"));
  }
});

test("hub intros exist for every tool page that renders one, and say what the tool is", () => {
  for (const path of ["/deck", "/tools/best-basket", "/tools/box-ev", "/tools/rising", "/tools/demand"]) {
    const intro = hubIntro(path);
    assert.ok(intro.length >= 1, `${path} has an intro`);
    assert.ok(intro.join(" ").length > 150, `${path}: an intro answers what this is`);
    assert.doesNotMatch(intro.join(" "), /Riftbound|RiftCompare/, `${path}: rebranded`);
  }
  for (const [path, intro] of Object.entries(HUB_INTROS)) {
    for (const p of intro.paragraphs) for (const m of p.matchAll(/\]\((\/[^)\s]*)\)/g)) assert.ok(!m[1].startsWith("//"), `${path}: an off-site link`);
  }
});

test("hub intro links stay on-site: only a single-slash path becomes a link", () => {
  const src = readFileSync(join(ROOT, "src/components/HubIntro.tsx"), "utf8");
  const re = new RegExp(src.match(/const INLINE_LINK = \/(.+)\/g;/)![1], "g");
  assert.deepEqual([..."[a](/tools) [b](//evil.example) [c](https://x.example)".matchAll(re)].map((m) => m[2]), ["/tools"]);
  assert.equal(plainIntroText("See [the guide](/blog/x) first."), "See the guide first.");
});
