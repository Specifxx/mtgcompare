// "COULDN'T READ" IS NOT "THERE IS NOTHING HERE" (owner WP19, parity P08; ported from RiftCompare's indexability-fail-open test). RiftCompare's set gallery derived its thin-page noindex from a card count that fell back to 0 on
// any database error, in a route rendered statically with a long revalidate: an outage during a deploy would have baked a noindex into every gallery and served it to Googlebot long after the outage ended. The rule that
// survives the move to published files is the same: ONLY A CONFIRMED EMPTY OR THIN READ MAY SUPPRESS INDEXING; an unreadable one fails OPEN (the page errors or is served without the suppression) and a sitemap that cannot be
// built answers 503, never an empty 200 that tells a crawler the site has no pages. Pages here are force-dynamic and cached by a 5-minute CDN header rather than baked for a day, but a swallowed read still serves a noindex
// or a 404 for 5 + 10 minutes to every crawler that arrives in the window, and crawlers are most of the traffic.
//   1. BEHAVIOUR: the sitemap index and its sections answer 200 from a readable tree, 404 for a mistyped or out-of-plan section, and 503 with Retry-After (never a 200, never a 404) when the tree cannot be read;
//   2. PUBLISHED: every URL the cards sections submit is a printing the track policy indexes: not THIN, no query, and has a page (real tree when one is on disk);
//   3. STATIC RATCHET: a page that swallows the error of a published-data loader (`.catch(() => null | [] | 0 | -1)`) AND decides `index: false` or notFound() in the same file is an offender: that is the whole bug.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NEON_LOADERS } from "./helpers/import-graph";
import { ROOT, ratchet, stripComments, summary, walk } from "./helpers/ratchet";
import { writeFixtureTree } from "../scripts/smoke-pages";
import { PRICE_MASK } from "../src/lib/constants";
import { fsTree } from "../src/lib/data/plane/tree";
import { cardBucket, bucketPath, slugPath } from "../src/lib/data/plane/shards";

// ── 1. the sitemap routes, over a readable tree and an unreadable one ──────────────────────────────────────────────────────
async function withPlane<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const was = { dir: process.env.PLANE_DIR, repo: process.env.PLANE_REPO, phase: process.env.NEXT_PHASE };
  process.env.PLANE_DIR = dir; delete process.env.PLANE_REPO; delete process.env.NEXT_PHASE;
  const { resetPlaneForTests } = await import("../src/lib/data/plane/runtime");
  resetPlaneForTests();
  try { return await fn(); } finally {
    resetPlaneForTests();
    if (was.dir === undefined) delete process.env.PLANE_DIR; else process.env.PLANE_DIR = was.dir;
    if (was.repo !== undefined) process.env.PLANE_REPO = was.repo;
    if (was.phase !== undefined) process.env.NEXT_PHASE = was.phase;
  }
}
const tmp = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "ifo-"));
const get = async (rel: string, params?: Record<string, string>): Promise<Response> => {
  const mod = await import(`../src/app/${rel}/route`) as { GET: (req: Request, ctx: { params: Record<string, string> }) => Promise<Response> };
  return mod.GET(new Request("http://localhost/x"), { params: params ?? {} });
};

test("the sitemap index and its sections: 200 from a readable tree, 404 for a section that does not exist", async () => {
  const dir = tmp(); writeFixtureTree(dir);
  try {
    await withPlane(dir, async () => {
      const idx = await get("sitemap.xml");
      assert.equal(idx.status, 200); const xml = await idx.text();
      assert.match(xml, /<sitemapindex/); assert.ok((xml.match(/<loc>/g) ?? []).length >= 2, "the index lists the sections");
      assert.match(xml, /\/sitemaps\/cards-0\.xml/);
      const cards = await get("sitemaps/[section]", { section: "cards-0.xml" });
      assert.equal(cards.status, 200); const body = await cards.text();
      assert.match(body, /<urlset/); assert.ok(!/\?finish=/.test(body) && !/<loc>[^<]*\?/.test(body), "a ?finish= variant is never submitted (Annex C check 17)");
      assert.equal((await get("sitemaps/[section]", { section: "cards-99.xml" })).status, 404, "an index past the plan is a 404, never an empty <urlset>");
      assert.equal((await get("sitemaps/[section]", { section: "bogus-0.xml" })).status, 404);
      assert.equal((await get("sitemaps/[section]", { section: "cards-0" })).status, 404, "the .xml is part of the name");
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test("an UNREADABLE tree (the data host unreachable, nothing in the instance) is a 503 with Retry-After and no body of URLs: never an empty 200 (the crawler keeps its last copy) and never a 404", async () => {
  // a transport failure, not a missing file: a published tree that lacks sm/plan.json is read as 'no sections yet' (static pages only), which is a true answer; a request that FAILED is not an answer at all
  const was = { dir: process.env.PLANE_DIR, repo: process.env.PLANE_REPO, token: process.env.PLANE_TOKEN, phase: process.env.NEXT_PHASE, fetch: globalThis.fetch };
  delete process.env.PLANE_DIR; delete process.env.NEXT_PHASE; process.env.PLANE_REPO = "nobody/none"; process.env.PLANE_TOKEN = "x";
  (globalThis as { fetch: unknown }).fetch = async () => { throw new TypeError("fetch failed"); };
  const { resetPlaneForTests } = await import("../src/lib/data/plane/runtime");
  resetPlaneForTests();
  try {
    for (const [rel, params] of [["sitemap.xml", undefined], ["sitemaps/[section]", { section: "cards-0.xml" }]] as const) {
      const res = await get(rel, params as Record<string, string> | undefined);
      assert.equal(res.status, 503, rel);
      assert.ok(Number(res.headers.get("retry-after")) > 0, `${rel}: Retry-After`);
      assert.equal(res.headers.get("cache-control"), "no-store", `${rel}: a failure is never cached`);
      assert.doesNotMatch(await res.text(), /<loc>|<urlset|<sitemapindex/);
    }
  } finally {
    (globalThis as { fetch: unknown }).fetch = was.fetch; resetPlaneForTests();
    for (const [k, v] of [["PLANE_DIR", was.dir], ["PLANE_REPO", was.repo], ["PLANE_TOKEN", was.token], ["NEXT_PHASE", was.phase]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

// ── 2. what is submitted is indexable (the real tree, when there is one) ─────────────────────────────────────────────────────
const REAL = process.env.PLANE_DIR ?? path.join(ROOT, ".data");
test("every URL the cards sections submit has a catalogue row that is listed and not THIN", { skip: !fs.existsSync(path.join(REAL, "v1/sm/plan.json")) }, () => {
  const t = fsTree(path.join(REAL, "v1")), plan = JSON.parse(t.read("sm/plan.json")) as { cards?: number };
  const sample: string[] = [];
  for (let n = 0; n < (plan.cards ?? 0); n++) { const f = `sm/cards-${n}.json`; if (!t.files().includes(f)) break; const slugs = JSON.parse(t.read(f)) as string[]; for (let i = 0; i < slugs.length; i += Math.max(1, Math.floor(slugs.length / 400))) sample.push(slugs[i]!); }
  assert.ok(sample.length > 50, `${sample.length} submitted slugs sampled`);
  const bad: string[] = [];
  for (const slug of sample) {
    const shard = JSON.parse(t.read(slugPath(slug))) as { s: [string, number][] }, id = shard.s.find((r) => r[0] === slug)?.[1];
    if (id === undefined) { bad.push(`${slug}: no id`); continue; }
    const px = (JSON.parse(t.read(bucketPath("px", cardBucket(id)))) as { p: number[][] }).p.find((r) => r[0] === id);
    if (!px) { bad.push(`${slug}: no price row`); continue; }
    const mask = px[5]!;
    if (!(mask & PRICE_MASK.LISTED)) bad.push(`${slug}: not listed`);
    if (mask & PRICE_MASK.THIN) bad.push(`${slug}: THIN (noindex and out of the sitemap)`);
  }
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} of ${sample.length} sampled submitted URLs are not indexable`);
});

// ── 3. the static ratchet ────────────────────────────────────────────────────────────────────────────────────────────────────
const SWALLOW = /await\s+(get[A-Z]\w*)\s*\([^)]*\)\s*\.catch\(\s*\(\)\s*=>\s*(?:null|undefined|\[\]|0|-?1|false|\{\})\s*\)/g;
const SUPPRESS = /index:\s*false|\bnotFound\(\)|\bnoindex\b/;
/** The loaders whose error a page swallows while the same file decides to suppress indexing. A Neon-backed panel may degrade quietly: that is not what this is about. */
export function swallowed(src: string): string[] {
  const t = stripComments(src);
  if (!SUPPRESS.test(t)) return [];
  return [...t.matchAll(SWALLOW)].map((m) => m[1]!).filter((l) => !NEON_LOADERS.includes(l));
}
test("the detector can fail: it needs both the swallow and the suppression, and forgives a Neon panel", () => {
  const swallow = "const st = await getStoreStats().catch(() => null);";
  assert.deepEqual(swallowed(`${swallow}\nreturn st ? {} : { robots: { index: false } };`), ["getStoreStats"]);
  assert.deepEqual(swallowed(`${swallow}\nreturn {};`), [], "no suppression in the file");
  assert.deepEqual(swallowed("const s = await getStoreStats();\nif (!s) notFound();"), [], "an error that propagates is the right behaviour");
  assert.deepEqual(swallowed("const p = await getEbayPanel(1).catch(() => null);\nif (!p) notFound();"), [], "a Neon panel degrades");
  assert.deepEqual(swallowed("// const x = await getThing().catch(() => null); index: false"), [], "a comment");
});
test("RATCHET: no page swallows the error of a published-data read and also decides to suppress indexing", () => {
  const files = walk("src/app", (f) => /\/(?:page|layout)\.tsx$/.test(f) && !/^src\/app\/(?:admin|account|api)\//.test(f)), hits = files.map((f) => [f, swallowed(fs.readFileSync(path.join(ROOT, f), "utf8"))] as const).filter(([, h]) => h.length);
  const r = ratchet("indexability-fail-open:swallowed-read", hits.map(([f]) => f));
  if (hits.length) console.log(`indexability-fail-open: ${summary(r)}: ${hits.map(([f, h]) => `${f} (${h.join(", ")})`).join("; ")}`);
  assert.ok(r.ok, r.failures.join("\n"));
});

// ── the status-code gate of ci-build.yml (scripts/status-check.ts): an unknown card, set or sealed product is a REAL 404, never a 200 with the not-found page inside, and a 503 is a different failure with its own words ──────
import { MUST_200_DEFAULT, MUST_404, MUST_404_RAW, judge404, readProbe } from "../scripts/status-check";
test("the status judge fails a soft 404, a 404 that is indexable or wears the home title, an unrelated page; and says 503 is the unreadable-data answer, not a missing card", () => {
  const nf = (status: number, robots = "noindex, follow", title = "Page not found | MTG Compare"): ReturnType<typeof readProbe> => readProbe(status, null, `<html><head><title>${title}</title><meta name="robots" content="${robots}"></head><body><h1>404</h1><p>This page doesn&apos;t exist.</p></body></html>`);
  assert.deepEqual(judge404(nf(404), "MTG Compare: prices", false), []);
  assert.match(judge404(nf(200), "x", false)[0]!, /soft 404/, "the router committed a 200 before notFound() ran");
  assert.match(judge404(nf(404, "index, follow"), "x", false).join(" "), /robots "index, follow"/);
  assert.match(judge404(nf(404, "noindex", "MTG Compare: prices"), "MTG Compare: prices", false).join(" "), /HOME page's title/);
  assert.match(judge404(readProbe(404, null, "<html><body>Welcome</body></html>"), "x", false).join(" "), /not the site's not-found page/);
  assert.match(judge404(nf(503), "x", false)[0]!, /data host was unreachable/);
  assert.deepEqual(judge404(readProbe(404, null, "not found"), "", true), [], "a route handler answers with a status line only");
  assert.match(judge404(readProbe(500, null, ""), "", true)[0]!, /HTTP 500/);
});
test("the unknown-parameter list covers every dynamic family of the Magic route table, and the known-good list is real pages", () => {
  for (const fam of ["/card/", "/cards/name/", "/cards/rarity/", "/cards/type/", "/colors/", "/keywords/", "/sets/", "/sealed/", "/commanders/", "/decks/", "/stores/", "/blog/", "/guides/", "/authors/", "/c/"]) assert.ok(MUST_404.some((p) => p.startsWith(fam)), `no bogus ${fam}<x> probe`);
  assert.ok(MUST_404.some((p) => /^\/card\/[^/]+\/[^/]+$/.test(p)), "a set + number pair (/card/[slug]/[number]) is its own family");
  assert.ok(MUST_404.some((p) => p.length > 250), "a very long parameter");
  assert.ok(MUST_404_RAW.some((p) => p.startsWith("/sitemaps/")) && MUST_404_RAW.some((p) => p.startsWith("/api/")));
  for (const ok of ["/", "/browse", "/sets", "/sealed", "/price-guide", "/market", "/movers"]) assert.ok(MUST_200_DEFAULT.includes(ok), `${ok} must keep answering 200`);
});
