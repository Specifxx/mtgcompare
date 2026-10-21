// What `next build` may read. The only thing a build prerenders against the database is the sitemap
// (src/app/sitemap.ts: /sitemap/0.xml … /sitemap/7.xml); every region page has generateStaticParams
// returning [] and renders on its first visit, and the landing and trust pages read no data.
//
// A Vercel PREVIEW (or development) build must not read the database at all: the project's variables
// are scoped Production and Preview (DEPLOY.md, step 4), so its DATABASE_URL is production's. Previews
// are off unless a commit subject carries [preview] (scripts/vercel-ignore-build.sh); when one is
// built, its sitemap files are written without products, as a build that cannot reach the database
// writes them, and fill in at runtime like any ISR page.
//
// Production (VERCEL_ENV=production) and a build outside Vercel (VERCEL_ENV unset) read the database
// exactly as before. Pinned by tests/vercel-ignore-build.test.ts.
export function isPreviewBuild(env: Record<string, string | undefined> = process.env): boolean {
  return env.NEXT_PHASE === "phase-production-build" && (env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "development");
}
