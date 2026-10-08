#!/usr/bin/env bash
# Vercel "Ignored Build Step" — ported from RiftCompare. Wired from vercel.json's
# `ignoreCommand`. Vercel's contract: exit 0 → skip this deployment; exit 1 → build.
#
# WHY. RiftCompare learned that every production build re-renders hundreds of
# database-backed pages and clears the ISR cache, and at 10–30 pushes a day that
# alone exhausted a Neon free-tier transfer allowance every few days (its
# DECISIONS.md, "Network transfer: the deploy cadence was the burn", 2026-09-11).
# MTG Compare starts with the same rule rather than relearning it.
#
# THE RULE. A PRODUCTION build happens only when the commit's SUBJECT LINE carries
# the literal marker  [deploy]  (any case). .github/workflows/production-deploy.yml
# lands one such commit on main every TUESDAY at 08:00 UTC (weekly since 2026-10-08;
# the data does not wait for it: the daily import publishes prices to the data
# repository and moves a pointer, no deploy needed); "Run workflow" there, or [deploy] in your own
# commit subject, deploys now. The SUBJECT only — a body that discusses the marker
# must not deploy.
#
# PREVIEW AND DEVELOPMENT BUILDS ARE OFF (owner, 2026-10-08): the only deployments are the weekly
# production release, or one the owner asks for. A preview or development build happens only when the
# commit SUBJECT carries the literal marker  [preview]  (any case), and then only because the owner
# asked for a preview of that commit. An unreadable commit message never builds a preview. An unknown
# environment is treated as production. If a PRODUCTION commit message cannot be read at all, build
# (fail open: "never deploys" is worse than "deploys too often").
set -u

MARKER='[deploy]'
PREVIEW_MARKER='[preview]'

msg="${VERCEL_GIT_COMMIT_MESSAGE:-}"
if [ -z "$msg" ]; then
  msg="$(git log -1 --format=%B 2>/dev/null || true)"
fi
subject="$(printf '%s\n' "$msg" | head -n 1)"

env="${VERCEL_ENV:-}"
if [ "$env" = "preview" ] || [ "$env" = "development" ]; then
  if [ -n "$subject" ] && printf '%s' "$subject" | grep -qiF -- "$PREVIEW_MARKER"; then
    echo "[vercel-ignore-build] VERCEL_ENV=$env and '$PREVIEW_MARKER' in the commit subject — building the preview that was asked for."
    exit 1
  fi
  echo "[vercel-ignore-build] VERCEL_ENV=$env — previews are off (owner decision): skipping. Add '$PREVIEW_MARKER' to the commit subject only when a preview was asked for. Production deploys weekly, Tuesday 08:00 UTC."
  exit 0
fi

if [ -z "$msg" ]; then
  echo "[vercel-ignore-build] cannot read the commit message — building, to fail open."
  exit 1
fi

if printf '%s' "$subject" | grep -qiF -- "$MARKER"; then
  echo "[vercel-ignore-build] '$MARKER' in the commit subject — building."
  exit 1
fi

echo "[vercel-ignore-build] no '$MARKER' in the commit subject — skipping. Production deploys weekly, Tuesday 08:00 UTC (production-deploy.yml); data refreshes need no deploy."
exit 0
