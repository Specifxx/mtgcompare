// Preview builds are off, and a build reads the database only for production (the owner, 2026-10-14).
// The Vercel project's variables are scoped Production and Preview (DEPLOY.md, step 4), so a preview
// build's DATABASE_URL is production's: every push to a branch that touched the app built a preview
// that prerendered the sitemap files against it. Two things stop that, pinned here:
//   1. scripts/vercel-ignore-build.sh (vercel.json's ignoreCommand) skips a preview or development
//      build unless the commit SUBJECT carries [preview]; production builds only a release, a [deploy]
//      SUBJECT that changed the app (or an empty [deploy] commit), since 2026-10-16.
//   2. A preview that does build reads no database: the sitemap is the only thing a build prerenders
//      against it, and it skips the reads (src/lib/build-env.ts).
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { isPreviewBuild } from "../src/lib/build-env";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = join(ROOT, "scripts/vercel-ignore-build.sh");
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");

// git, isolated from the machine's config (no signing, no hooks) and from any repository above the temp dir.
const TMP = mkdtempSync(join(tmpdir(), "dex-ignore-"));
after(() => rmSync(TMP, { recursive: true, force: true }));
const GIT_ENV = {
  PATH: process.env.PATH ?? "",
  HOME: TMP,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CEILING_DIRECTORIES: TMP,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
};
// Next's types make NODE_ENV a required key of ProcessEnv; these children don't need it.
const asEnv = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;
const git = (cwd: string, ...args: string[]) => {
  const r = spawnSync("git", args, { cwd, env: asEnv(GIT_ENV), encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
};

let n = 0;
/** A monorepo whose last commit (`message`) touches the app or only another app; returns the app directory. */
function repo(appChanged: boolean, message: string): string {
  const dir = join(TMP, `repo${n++}`);
  for (const d of ["apps/dex", "apps/other"]) mkdirSync(join(dir, d), { recursive: true });
  writeFileSync(join(dir, "apps/dex/a.txt"), "1");
  writeFileSync(join(dir, "apps/other/b.txt"), "1");
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "base");
  writeFileSync(join(dir, appChanged ? "apps/dex/a.txt" : "apps/other/b.txt"), "2");
  git(dir, "commit", "-q", "-am", message);
  return join(dir, "apps/dex");
}

/** Runs the gate as Vercel does (cwd = the app); `message: null` leaves VERCEL_GIT_COMMIT_MESSAGE unset. */
function gate(cwd: string, vercelEnv: string | null, message: string | null): { status: number | null; out: string } {
  const env: Record<string, string> = { ...GIT_ENV };
  if (vercelEnv !== null) env.VERCEL_ENV = vercelEnv;
  if (message !== null) env.VERCEL_GIT_COMMIT_MESSAGE = message;
  const r = spawnSync("bash", [SCRIPT], { cwd, env: asEnv(env), encoding: "utf8" });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}
const BUILD = 1;
const SKIP = 0;

test("vercel.json runs the gate", () => {
  const vercel = JSON.parse(src("vercel.json")) as { ignoreCommand?: string };
  assert.equal(vercel.ignoreCommand, "bash scripts/vercel-ignore-build.sh");
});

test("production builds a release only: [deploy] in the SUBJECT and the app changed (2026-10-16)", () => {
  for (const env of ["production", null]) {
    const label = env ?? "VERCEL_ENV unset";
    // Code commits and the eBay import's data commit ride the next release.
    assert.equal(gate(repo(true, "Fix the product page"), env, "Fix the product page").status, SKIP, label);
    const ebay = "DexCompare data: 2026-10-16T08:40Z (dexcompare-ebay-import.yml run 1)";
    assert.equal(gate(repo(true, ebay), env, ebay).status, SKIP, label);
    // The sealed import's data commit is the release (scripts/publish-public-data.sh ... release).
    const data = "DexCompare data: 2026-10-16T08:52Z (dexcompare-sealed-import.yml run 2) [deploy]";
    assert.equal(gate(repo(true, data), env, data).status, BUILD, label);
    assert.equal(gate(repo(true, "Urgent fix [DEPLOY]"), env, "Urgent fix [DEPLOY]").status, BUILD, `${label}: any case`);
    assert.equal(gate(repo(true, "Fix"), env, "Fix\n\nThe body says [deploy] in prose.").status, SKIP, `${label}: subject only`);
    assert.equal(gate(repo(false, "Other app [deploy]"), env, "Other app [deploy]").status, SKIP, `${label}: another app's commit`);
    // The preview marker means nothing to production.
    assert.equal(gate(repo(true, "Fix [preview]"), env, "Fix [preview]").status, SKIP, label);
  }
});

test("an empty [deploy] commit is a release (dexcompare-release.yml)", () => {
  const dir = join(TMP, `repo${n++}`);
  mkdirSync(join(dir, "apps/dex"), { recursive: true });
  writeFileSync(join(dir, "apps/dex/a.txt"), "1");
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "base");
  git(dir, "commit", "-q", "--allow-empty", "-m", "DexCompare release [deploy]");
  const app = join(dir, "apps/dex");
  assert.equal(gate(app, "production", "DexCompare release [deploy]").status, BUILD);
  assert.equal(gate(app, "production", "DexCompare release").status, SKIP, "an empty commit without the marker is nothing");
  const wf = readFileSync(join(ROOT, "../../.github/workflows/dexcompare-release.yml"), "utf8");
  assert.match(wf, /git commit --allow-empty -m "DexCompare release \[deploy\]"/);
  assert.doesNotMatch(wf, /^\s+schedule:/m, "the imports are the schedule");
});

test("the sealed import's data commit carries the marker; the eBay import's does not", () => {
  const pub = src("scripts/publish-public-data.sh");
  assert.match(pub, /\[ "\$\{2:-\}" = "release" \] && MARK=" \[deploy\]"/);
  assert.match(pub, /git commit -q -m "DexCompare data: [^"]*\$MARK"/);
  const wf = (f: string) => readFileSync(join(ROOT, "../../.github/workflows", f), "utf8");
  // One release a day (2026-10-17): the 20:47 UTC run, a manual run and the schema sync; the 08:47 run rides it.
  const sealed = wf("dexcompare-sealed-import.yml");
  assert.match(sealed, /RELEASE: \$\{\{ \(github\.event_name != 'schedule' \|\| github\.event\.schedule == '47 20 \* \* \*'\) && 'release' \|\| '' \}\}/);
  assert.match(sealed, /publish-public-data\.sh "[^"]*" \$RELEASE/);
  assert.doesNotMatch(wf("dexcompare-ebay-import.yml"), /publish-public-data\.sh "[^"]*" release/);
});

test("production fails open when the subject cannot be read, or git cannot compare a [deploy] commit", () => {
  const empty = join(TMP, "no-git");
  mkdirSync(empty, { recursive: true });
  const r = gate(empty, "production", "Fix [deploy]");
  assert.equal(r.status, BUILD, r.out);
  assert.equal(gate(empty, null, null).status, BUILD, "no message and no git: build");
  assert.equal(gate(empty, "production", "Fix").status, SKIP, "a readable subject without the marker still skips");
});

test("previews are off: a preview or development build needs [preview] in the SUBJECT and an app change", () => {
  for (const env of ["preview", "development"]) {
    const changed = repo(true, "Try the new product page");
    assert.equal(gate(changed, env, "Try the new product page").status, SKIP, env);
    assert.equal(gate(changed, env, "Try the new product page [preview]").status, BUILD, env);
    assert.equal(gate(changed, env, "Try it [PREVIEW]").status, BUILD, `${env}: any case`);
    assert.equal(gate(changed, env, "Try it\n\nThe body says [preview] in prose.").status, SKIP, `${env}: subject only`);
    assert.equal(gate(changed, env, "release [deploy]").status, SKIP, `${env}: [deploy] is not [preview]`);
    assert.equal(gate(repo(false, "Other app [preview]"), env, "Other app [preview]").status, SKIP, `${env}: app unchanged`);
  }
});

test("a preview reads the subject from git when Vercel does not pass it, and never builds on an unreadable one", () => {
  assert.equal(gate(repo(true, "Try it [preview]"), "preview", null).status, BUILD);
  assert.equal(gate(repo(true, "Try it"), "preview", null).status, SKIP);
  const empty = join(TMP, "no-git-preview");
  mkdirSync(empty, { recursive: true });
  assert.equal(gate(empty, "preview", null).status, SKIP);
});

test("isPreviewBuild: only `next build` for a Vercel preview or development deployment", () => {
  const build = "phase-production-build";
  assert.equal(isPreviewBuild({ NEXT_PHASE: build, VERCEL_ENV: "preview" }), true);
  assert.equal(isPreviewBuild({ NEXT_PHASE: build, VERCEL_ENV: "development" }), true);
  assert.equal(isPreviewBuild({ NEXT_PHASE: build, VERCEL_ENV: "production" }), false, "production reads as before");
  assert.equal(isPreviewBuild({ NEXT_PHASE: build }), false, "a build outside Vercel reads as before");
  assert.equal(isPreviewBuild({ VERCEL_ENV: "preview" }), false, "a preview's runtime renders read the database like any ISR page");
});

test("the sitemap asks isPreviewBuild() before its first read", () => {
  const s = src("src/app/sitemap.ts");
  const body = s.slice(s.indexOf("export default async function sitemap"));
  const guard = body.indexOf("if (isPreviewBuild()) return n === STATIC_SITEMAP_ID ? staticSitemap({}) : [];");
  assert.ok(guard > 0, "the guard is in the sitemap function");
  assert.ok(guard < body.indexOf("await "), "and comes before any read");
});

// ─── Nothing else a build prerenders reads the database ─────────────────────────
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(ROOT, "src", spec.slice(2)) : spec.startsWith(".") ? join(dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}
const IMPORT = /^\s*(?:import|export)\s+(?!type\s)(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/gm;
function reachesDatabase(entry: string): boolean {
  const seen = new Set<string>();
  const todo = [entry];
  while (todo.length) {
    const f = todo.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of readFileSync(f, "utf8").matchAll(IMPORT)) {
      const r = resolveImport(f, m[1]);
      if (r && /\.tsx?$/.test(r)) todo.push(r);
    }
  }
  return [...seen].some((f) => /src[\\/]lib[\\/](db|data)\.ts$/.test(f));
}

test("a build prerenders nothing else that reads the database", () => {
  const app = walk(join(ROOT, "src/app")).filter((f) => /\.tsx?$/.test(f));
  const rel = (f: string) => relative(ROOT, f).split("\\").join("/");
  // Region pages render on their first visit, never at build.
  for (const f of app) {
    const s = readFileSync(f, "utf8");
    const all = s.match(/generateStaticParams/g)?.length ?? 0;
    const empty = s.match(/export function generateStaticParams\(\)\s*\{\s*return \[\];\s*\}/g)?.length ?? 0;
    // A route that never reaches the database (the /og share cards) may list its params: that prerenders images, not data.
    if (!reachesDatabase(f)) continue;
    assert.equal(all, empty, `${rel(f)}: generateStaticParams must return [] (no prewarming at build)`);
  }
  assert.ok(reachesDatabase(join(ROOT, "src/app/[region]/p/[slug]/page.tsx")), "the walker sees a region page's reads");
  // A page under a dynamic segment whose generateStaticParams returns [] renders on its first visit, like a region page (the
  // by-country guide, src/app/(site)/guides/[slug]). Everything else outside [region], the API and the sitemap is prerendered at
  // build: it must not reach the database.
  // Or a force-dynamic page (every data page since 2026-10-17, cached by the CDN): never prerendered.
  const onFirstVisit = (f: string) => /^export const dynamic = "force-dynamic"/m.test(readFileSync(f, "utf8")) || (/\/\[[^/\]]+\]\//.test(rel(f)) && /export function generateStaticParams\(\)\s*\{\s*return \[\];\s*\}/.test(readFileSync(f, "utf8")));
  const byCountry = join(ROOT, "src/app/(site)/guides/[slug]/page.tsx");
  assert.ok(onFirstVisit(byCountry) && reachesDatabase(byCountry), "the by-country guide reads data, per request only (never at build)");
  const prerendered = app.filter((f) => !rel(f).startsWith("src/app/[region]/") && !rel(f).startsWith("src/app/api/") && rel(f) !== "src/app/sitemap.ts" && !onFirstVisit(f));
  assert.ok(prerendered.some((f) => rel(f) === "src/app/(site)/page.tsx"));
  for (const f of prerendered) assert.equal(reachesDatabase(f), false, `${rel(f)} is prerendered at build and reaches src/lib/db.ts or data.ts`);
});
