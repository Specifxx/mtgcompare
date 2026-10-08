# Releasing MTG Compare

Code ships once a week; data ships every day and never waits for a release. This page is the runbook. The rules are in CLAUDE.md ("Deploys are gated and weekly") and `docs/CURRENT-STATE.md`.

## 1. The cadence

- **Weekly release: Tuesday 08:00 UTC.** `.github/workflows/production-deploy.yml` lands one empty commit on `main` whose SUBJECT is `release: weekly production deploy [deploy]`. Vercel's `ignoreCommand` (`scripts/vercel-ignore-build.sh`) builds a production commit only when its SUBJECT carries `[deploy]` (any case; a body that mentions the marker does not count). On a schedule, if the newest commit on `main` is already a release, nothing is landed.
- **The constant** is `RELEASE_CRON` in `src/lib/release-schedule.ts`; `tests/deploy-cadence.test.ts` pins it to the workflow cron, CLAUDE.md and the README. Change all of them together.
- **Data does not wait.** The daily import (`import-prices.yml`, 21:25 to 22:25 UTC) publishes the catalogue, prices, offers and history to the private data repository and moves one pointer. A deployment reads the pointer at request time, so a week-old deployment serves today's prices. `/admin/deploys` shows how many hours newer the data is than the newest release.
- **Builds touch nothing.** A build reads no database and no data host and prerenders no data-backed page (`tests/build-no-data.test.ts`, the CI build job). Never add `generateStaticParams` prewarming.
- **Previews are off.** Preview and development builds happen only for a commit subject carrying `[preview]`, added only when the owner asks. Vercel environment variables have no Preview scope.

## 2. An urgent release

Only when the owner says the release cannot wait for Tuesday. Either press **Run workflow** on "Production deploy" in GitHub Actions (give a reason; it is written into the release commit body), or use **Run release now** on `/admin/deploys` (needs the optional `GITHUB_DISPATCH_TOKEN`), or land a commit whose subject carries `[deploy]`. Say in the summary that it was urgent. More than two `[deploy]` subjects in a rolling seven days turns the Deploys light red.

## 3. What needs a release

Code, copy, styles, and any `NEXT_PUBLIC_*` variable (inlined at build time). What does not: prices, stores, history, the catalogue, every published view, sitemap contents (they are route handlers over the published data) and any Vercel variable that is not `NEXT_PUBLIC_*` (it applies to the next function cold start, but redeploy to be sure).

## 4. Rolling back

- **Code:** in Vercel, promote the previous production deployment (Deployments, the older one, Promote to Production). Then revert the commit on `main`; the revert rides the next release.
- **Data:** run **Data rollback** (`data-rollback.yml`) with the sequence number or commit to point at; the pointer moves back and nothing is rebuilt. `npx tsx scripts/data-rollback.ts <seq|sha>` does the same by hand.

## 5. Before the first live deployment

Follow `docs/CHROME-SETUP-PROMPT.md` (it also creates the private data repository and its two tokens). The data must be published BEFORE the first production deploy, because pages render from it. Confirm `/admin/data` is green, then push a commit with `[deploy]` in its subject, or run the workflow.

## 6. Checks

`npm run typecheck`, `npm run lint`, `npm test`, `npm run check:ownership`, `npm run decisions:index`.
