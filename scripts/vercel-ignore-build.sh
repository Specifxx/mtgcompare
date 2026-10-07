#!/usr/bin/env bash
# Vercel "Ignored Build Step" — ported from RiftCompare. Wired from vercel.json's
# `ignoreCommand`. Vercel's contract: exit 0 → skip this deployment; exit 1 → build.
#
# WHY. RiftCompare learned that every production build re-renders hundreds of
# database-backed pages and clears the ISR cache, and at 10–30 pushes a day that
# alone exhausted a Neon free-tier transfer allowance every few days (its
# DECISIONS.md, "Network transfer: the deploy cadence was the burn", 2026-09-11).
# OP Compare starts with the same rule rather than relearning it.
#
# THE RULE. A PRODUCTION build happens only when the commit's SUBJECT LINE carries
# the literal marker  [deploy]  (any case). .github/workflows/production-deploy.yml
# lands one such commit on main every day at 08:00 UTC; "Run workflow" there, or
# [deploy] in your own commit subject, deploys now. The SUBJECT only — a body that
# discusses the marker must not deploy.
#
# Preview and development builds are not gated. An unknown environment is
# treated as production. If the commit message cannot be read at all, build
# (fail open: "never deploys" is worse than "deploys too often").
set -u

MARKER='[deploy]'

env="${VERCEL_ENV:-}"
if [ "$env" = "preview" ] || [ "$env" = "development" ]; then
  echo "[vercel-ignore-build] VERCEL_ENV=$env — previews are not gated; building."
  exit 1
fi

msg="${VERCEL_GIT_COMMIT_MESSAGE:-}"
if [ -z "$msg" ]; then
  msg="$(git log -1 --format=%B 2>/dev/null || true)"
fi
if [ -z "$msg" ]; then
  echo "[vercel-ignore-build] cannot read the commit message — building, to fail open."
  exit 1
fi

subject="$(printf '%s\n' "$msg" | head -n 1)"
if printf '%s' "$subject" | grep -qiF -- "$MARKER"; then
  echo "[vercel-ignore-build] '$MARKER' in the commit subject — building."
  exit 1
fi

echo "[vercel-ignore-build] no '$MARKER' in the commit subject — skipping. Production deploys daily at 08:00 UTC (production-deploy.yml)."
exit 0
