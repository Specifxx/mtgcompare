import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { daysUntil, inPreorderWindow, isPreorder, preorderSets, preorderTitleCandidates, RELEASED_WINDOW_DAYS } from "@/lib/preorders";
import { fitTitle, TITLE_MAX } from "@/lib/seo-title";
import { PREORDER_COPY } from "@/content/preorders";
import type { SetInfo } from "@/lib/site-types";

const set = (slug: string, releasedOn: string | null, upcoming = false): SetInfo => ({ id: slug.length * 7 + (releasedOn ? Number(releasedOn.slice(-2)) : 0), name: slug, code: slug, slug, releasedOn, productCount: 10, upcoming });

test("a release has a page while upcoming and for the window after, then not", () => {
  const today = "2026-11-01";
  assert.ok(isPreorder(set("a", "2026-11-13"), today));
  assert.ok(isPreorder(set("a", null, true), today));
  assert.ok(!isPreorder(set("a", "2026-11-01"), today), "out on release day");
  assert.ok(inPreorderWindow(set("a", "2026-10-01"), today));
  const old = new Date(Date.parse(`${today}T00:00:00Z`) - (RELEASED_WINDOW_DAYS + 1) * 86_400_000).toISOString().slice(0, 10);
  assert.ok(!inPreorderWindow(set("a", old), today));
  assert.ok(!inPreorderWindow(set("a", null), today));
});

test("upcoming releases come first, soonest first; nothing sealed, or released without a box, gets no page", () => {
  const today = "2026-11-01";
  const all = [set("late", "2026-12-04"), set("soon", "2026-11-13"), set("out", "2026-10-20"), set("empty", "2026-11-20"), set("older", "2026-10-02"), set("starter", "2026-10-10"), set("packs", "2026-11-30")];
  const counts = (s: SetInfo) => (s.slug === "empty" ? { products: 0, boxes: 0 } : s.slug === "starter" || s.slug === "packs" ? { products: 2, boxes: 0 } : { products: 3, boxes: 1 });
  const got = preorderSets(all, counts, today).map((s) => s.slug);
  assert.deepEqual(got, ["soon", "packs", "late", "out", "older"]);
});

test("an upcoming set with written copy has a page before any store lists it; released, it needs a box again", () => {
  const today = "2026-11-01";
  const all = [set("announced", "2027-01-29", true), set("promo", "2026-11-20", true), set("gone", "2026-10-20")];
  const none = () => ({ products: 0, boxes: 0 });
  const curated = (s: SetInfo) => s.slug === "announced" || s.slug === "gone";
  assert.deepEqual(preorderSets(all, none, today).map((s) => s.slug), [], "nothing sealed, no copy hook: no page");
  assert.deepEqual(preorderSets(all, none, today, curated).map((s) => s.slug), ["announced"], "copy opens only the upcoming one");
});

test("titles say pre-order before release and fit 60 characters", () => {
  const pre = fitTitle(preorderTitleCandidates("Stardust Trails", true)).absolute;
  assert.match(pre, /Pre-Order/);
  assert.ok(pre.length <= TITLE_MAX, pre);
  const out = fitTitle(preorderTitleCandidates("Magnificent Maestros", false)).absolute;
  assert.match(out, /Booster Box Prices/);
  assert.doesNotMatch(out, /Pre-Order/);
  assert.ok(out.length <= TITLE_MAX, out);
});

test("days until release", () => {
  assert.equal(daysUntil("2026-11-13", "2026-11-01"), 12);
  assert.equal(daysUntil("2026-11-01", "2026-11-01"), 0);
  assert.equal(daysUntil("2026-10-01", "2026-11-01"), null);
});

test("pre-order copy is keyed by real set slugs", () => {
  const catalog = JSON.parse(fs.readFileSync("data/public/catalog.json", "utf8")) as { sets: SetInfo[] };
  const slugs = new Set(catalog.sets.map((s) => s.slug));
  for (const slug of Object.keys(PREORDER_COPY.sets)) assert.ok(slugs.has(slug), `content/preorders.ts names unknown set ${slug}`);
});

test("the hub and every release page cache six hours, and the sitemap lists them", () => {
  for (const f of ["src/app/preorders/page.tsx", "src/app/preorders/[slug]/page.tsx"]) assert.match(fs.readFileSync(f, "utf8"), /export const revalidate = 21600;/);
  assert.match(fs.readFileSync("src/app/preorders/[slug]/page.tsx", "utf8"), /generateStaticParams = \(\) => \[\]/);
  assert.match(fs.readFileSync("src/app/sitemap.ts", "utf8"), /preorderSetList\(\)/);
});
