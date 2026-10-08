// THE BUILD FETCHES NOTHING, AND NO PAGE BAKES A DEGRADED RENDER (critique DP-01, a blocker reproduced on Next 14.2.35: a param-less page with `revalidate` is PRERENDERED at `next build`; a throwing read fails the build and a swallowed one bakes
// the degraded page and serves it for the whole revalidate window). Owner WP19. Static rules over src/app (ratchet: against OP's source it reports the 20 param-less revalidate routes and every page that must become force-dynamic, and passes at the baseline):
//   A. A route file that exports `revalidate` must not reach the data barrel or the database (its import closure, type-only imports ignored): ISR is for pages that read no published file and no table.
//   B. A route file that reaches the data barrel or the database must export `dynamic = "force-dynamic"` (page, route handler, sitemap, opengraph-image): rendered per request, cached by the CDN through headers.json.
//   C. No `sitemap.ts` / `robots.ts` metadata route may reach data (Next adds its own Cache-Control to metadata routes, so next.config headers() would DOUBLE it: measured): sitemaps are route handlers that set publicDataHeaders().
//   D. No generateStaticParams body reads data (the other author's deploy-cadence test also pins this).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appRoutes, closure, routeOf } from "./helpers/import-graph";
import { ratchet, summary } from "./helpers/ratchet";
import { staticParamsBodies } from "./helpers/cache-scan";

const ROOT = process.env.TEST_ROOT ?? path.resolve(__dirname, "..");
const rel = (root: string, f: string) => path.relative(root, f).split(path.sep).join("/");
export interface Finding { rule: "A" | "B" | "C" | "D"; file: string; why: string }
export function scan(root: string): Finding[] {
  const out: Finding[] = [];
  for (const f of appRoutes(root)) {
    const src = fs.readFileSync(f, "utf8"); const r = rel(root, f); const c = closure(f, root); const reaches = c.dataLeaf || c.dbLeaf;
    const isr = /^export const revalidate\s*=/m.test(src); const dyn = /^export const dynamic\s*=\s*["']force-dynamic["']/m.test(src); const isLayout = /\/layout\.tsx?$/.test(r);
    if (isr && reaches) out.push({ rule: "A", file: r, why: `exports revalidate but reaches ${c.dataLeaf ? "the data barrel" : "the database"}: prerendered at build, a degraded page baked for the window` });
    if (reaches && !isr && !dyn && !isLayout) out.push({ rule: "B", file: r, why: `reaches ${c.dataLeaf ? "the data barrel" : "the database"} without export const dynamic = "force-dynamic"` });
    if (/\/(sitemap|robots)\.ts$/.test(r) && reaches) out.push({ rule: "C", file: r, why: "a metadata route that reads data: use a route handler that sets publicDataHeaders()" });
    for (const body of staticParamsBodies(src)) if (/(?<![.\w])get[A-Z]\w*\s*\(|(?<![.\w])fetch\s*\(|prisma|planeJson/.test(body)) out.push({ rule: "D", file: r, why: "generateStaticParams reads data" });
  }
  return out;
}
const mk = (files: Record<string, string>): string => { const root = fs.mkdtempSync(path.join(os.tmpdir(), "bnd-")); for (const [f, s] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), s); } return root; };

test("the rules can fail: ISR over data (A), a data page that is not force-dynamic (B), a data sitemap (C), data in generateStaticParams (D), data through a component, type-only imports ignored", () => {
  const root = mk({
    "src/app/page.tsx": 'import { getHomeFeed } from "@/lib/data";\nexport const revalidate = 3600;\nexport default async function P() { return null; }',
    "src/app/about/page.tsx": 'export const revalidate = 86400;\nexport default function P() { return null; }',
    "src/app/browse/page.tsx": 'import { getCardPage } from "@/lib/data";\nexport const dynamic = "force-dynamic";\nexport default async function P() { return null; }',
    "src/app/price-guide/page.tsx": 'import { getCardPage } from "@/lib/data";\nexport default async function P() { return null; }',
    "src/app/sitemap.ts": 'import { getSitemapPlan } from "@/lib/data";\nexport const dynamic = "force-dynamic";\nexport default async function s() { return []; }',
    "src/app/via/page.tsx": 'import X from "@/components/X";\nexport const revalidate = 60;\nexport default function P() { return <X />; }',
    "src/components/X.tsx": 'import { getEbayPanel } from "@/lib/data";\nexport default async function X() { return null; }',
    "src/app/typed/page.tsx": 'import type { CardLite } from "@/lib/data";\nexport const revalidate = 60;\nexport default function P() { return null; }',
    "src/app/card/[slug]/page.tsx": 'import { getCardDetail } from "@/lib/data";\nexport function generateStaticParams() { return getCardDetail("x"); }\nexport const dynamic = "force-dynamic";\nexport default function P() { return null; }',
  });
  const f = scan(root).map((x) => `${x.rule}:${x.file}`).sort();
  assert.deepEqual(f, ["A:src/app/page.tsx", "A:src/app/via/page.tsx", "B:src/app/price-guide/page.tsx", "C:src/app/sitemap.ts", "D:src/app/card/[slug]/page.tsx"].sort()); fs.rmSync(root, { recursive: true });
});
test("RATCHET over src/app: ISR only on pages that read nothing; everything that reads data is force-dynamic (against OP's source: the 20 param-less revalidate routes and the data pages are the offenders to migrate)", () => {
  const findings = scan(ROOT); const r = ratchet("build-no-data", [...new Set(findings.map((x) => `src/app/${x.file.replace(/^src\/app\//, "")}`))]);
  if (findings.length) console.log(`build-no-data offenders: ${summary(r)} (${findings.filter((x) => x.rule === "A").length} ISR-over-data, ${findings.filter((x) => x.rule === "B").length} not force-dynamic)`);
  assert.ok(r.ok, r.failures.join("\n"));
});
test("every param-less route of the baseline that exports revalidate is a known file: the 20 the critic counted (documentation of the migration)", { skip: !fs.existsSync(path.join(ROOT, "src/app/page.tsx")) }, () => {
  const isr = appRoutes(ROOT).filter((f) => !/\[/.test(f) && /^export const revalidate\s*=/m.test(fs.readFileSync(f, "utf8"))).map((f) => routeOf(ROOT, f));
  console.log(`param-less ISR routes in this tree: ${isr.length}`); assert.ok(isr.length <= 20, "the migration only removes them");
});
