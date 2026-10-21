#!/usr/bin/env bash
# Vercel "Ignored Build Step" for DexCompare, wired from vercel.json's `ignoreCommand`. Vercel runs it
# in the project's Root Directory (apps/dexcompare-sealed) before each deployment. Vercel's contract:
#
#   exit 0  → skip: no deployment is built for this push
#   exit 1  → build as normal
#
# PRODUCTION (VERCEL_ENV=production) BUILDS ONLY A RELEASE (2026-10-16): a pushed commit whose SUBJECT
# carries the literal marker [deploy] (any case) AND that changed something under apps/dexcompare-sealed.
# Every production build empties the ISR page cache, and since the data moved into files (2026-10-15)
# every import's data commit was a build: six in fourteen hours on 10-16, two of them a minute apart,
# plus one per code push. Now the twice-daily sealed import's data commit is the release
# (scripts/publish-public-data.sh adds the marker for it); the eBay import's data commit and ordinary
# code commits ride the next one, as on the sister sites. A release out of turn: put [deploy] in the
# subject of a commit that changes the app, or run "DexCompare release" (dexcompare-release.yml), which
# lands an empty [deploy] commit.
# DEPLOY.md, "Where the data lives".
#
# Fail open: if the subject cannot be read, or git cannot compare HEAD^ with HEAD on a [deploy] commit,
# build ("never deploys" is worse than "deploys once too often"). An UNKNOWN environment (VERCEL_ENV
# unset: the project's "Automatically expose System Environment Variables" is off) is treated as
# production, so production can never be skipped by this file's preview rule.
#
# PREVIEW AND DEVELOPMENT BUILDS ARE OFF (owner, 2026-10-14). The project's environment variables are
# scoped Production AND Preview (DEPLOY.md, step 4), so a preview build reads the PRODUCTION database:
# every push to any branch that touched the app built a preview that prerendered the eight sitemap
# files against it. A preview now builds only when the commit SUBJECT carries the literal marker
# [preview] (any case) and the app changed, and the marker goes in only when the owner asks for a
# preview of that commit. The SUBJECT only, as on the sister sites: a body that mentions the marker in
# prose does not build. An unreadable commit message never builds a preview. Even then the build reads
# no database (src/lib/build-env.ts).
#
# VERCEL_ENV and VERCEL_GIT_COMMIT_MESSAGE are Vercel system environment variables, available to this
# step; without the message, `git log -1` reads it (Vercel clones with a history depth of 10).
# Pattern: RiftCompare's and MTG Compare's scripts/vercel-ignore-build.sh.
# Pinned by tests/vercel-ignore-build.test.ts.
set -u

PREVIEW_MARKER='[preview]'
DEPLOY_MARKER='[deploy]'

git diff --quiet HEAD^ HEAD -- . 2>/dev/null
diff=$? # 0: nothing under this app changed; 1: it changed; anything else: git could not tell

env="${VERCEL_ENV:-}"
if [ "$env" = "preview" ] || [ "$env" = "development" ]; then
  msg="${VERCEL_GIT_COMMIT_MESSAGE:-}"
  if [ -z "$msg" ]; then
    msg="$(git log -1 --format=%B 2>/dev/null || true)"
  fi
  subject="$(printf '%s\n' "$msg" | head -n 1)"
  if [ -z "$subject" ] || ! printf '%s' "$subject" | grep -qiF -- "$PREVIEW_MARKER"; then
    echo "[vercel-ignore-build] VERCEL_ENV=$env: previews are off (owner, 2026-10-14) — skipping. Put '$PREVIEW_MARKER' in the commit SUBJECT only when the owner asks for a preview."
    exit 0
  fi
  if [ "$diff" -eq 0 ]; then
    echo "[vercel-ignore-build] VERCEL_ENV=$env: '$PREVIEW_MARKER' in the subject, but nothing under apps/dexcompare-sealed changed — skipping."
    exit 0
  fi
  echo "[vercel-ignore-build] VERCEL_ENV=$env: '$PREVIEW_MARKER' in the commit subject — building the preview that was asked for."
  exit 1
fi

msg="${VERCEL_GIT_COMMIT_MESSAGE:-}"
if [ -z "$msg" ]; then
  msg="$(git log -1 --format=%B 2>/dev/null || true)"
fi
subject="$(printf '%s\n' "$msg" | head -n 1)"
label="VERCEL_ENV=${env:-unset (treated as production)}"
if [ -z "$subject" ]; then
  echo "[vercel-ignore-build] $label: the commit subject could not be read — building, to fail open."
  exit 1
fi
if ! printf '%s' "$subject" | grep -qiF -- "$DEPLOY_MARKER"; then
  echo "[vercel-ignore-build] $label: no '$DEPLOY_MARKER' in the commit subject — skipping; this commit rides the next release (the sealed import's data commit)."
  exit 0
fi

case "$diff" in
  0)
    # An EMPTY [deploy] commit is a release on purpose (dexcompare-release.yml lands one); a [deploy] commit that changed only
    # another app of the monorepo is not this app's.
    if git diff --quiet HEAD^ HEAD 2>/dev/null; then
      echo "[vercel-ignore-build] $label: an empty '$DEPLOY_MARKER' commit — building the release."
      exit 1
    fi
    echo "[vercel-ignore-build] $label: '$DEPLOY_MARKER', but nothing under apps/dexcompare-sealed changed — skipping."
    exit 0
    ;;
  1)
    echo "[vercel-ignore-build] $label: '$DEPLOY_MARKER' and apps/dexcompare-sealed changed — building."
    exit 1
    ;;
  *)
    echo "[vercel-ignore-build] $label: '$DEPLOY_MARKER', and git could not compare HEAD^ with HEAD (status $diff) — building, to fail open."
    exit 1
    ;;
esac
