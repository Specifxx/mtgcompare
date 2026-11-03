#!/usr/bin/env bash
# Vercel "Ignored Build Step" (vercel.json `ignoreCommand`), copied from Rift
# Compare's scripts/vercel-ignore-build.sh, where it ended a run of exhausted
# Neon projects: every production build re-renders the site and clears the ISR
# page cache, so 10–30 pushes a day cost more than all real traffic.
#
#   exit 0 → skip (no deployment)      exit 1 → build
#
# Production builds only when the commit SUBJECT (first line, never the body)
# carries [deploy] (any case). .github/workflows/production-deploy.yml lands one
# such commit a day after the price import. Preview/development builds need
# [preview] in the subject. claude/* branches never deploy (vercel.json).
# An unreadable message builds production (fail open) and never a preview.
set -u

msg="${VERCEL_GIT_COMMIT_MESSAGE:-}"
[ -z "$msg" ] && msg="$(git log -1 --format=%B 2>/dev/null || true)"
subject="$(printf '%s\n' "$msg" | head -n 1)"
env="${VERCEL_ENV:-}"

if [ "$env" = "preview" ] || [ "$env" = "development" ]; then
  if [ -n "$subject" ] && printf '%s' "$subject" | grep -qiF -- '[preview]'; then
    echo "[ignore-build] $env build requested by [preview] in the subject."
    exit 1
  fi
  echo "[ignore-build] $env builds are off unless the commit subject carries [preview]."
  exit 0
fi

if [ -z "$msg" ]; then
  echo "[ignore-build] commit message unreadable — building production to fail open."
  exit 1
fi

# ── AT MOST ONE PRODUCTION BUILD EVERY 12 HOURS (owner, 2026-11-02) ─────────
# Vercel cost Nov 1 was $11.82 against a $5–6 a day ceiling, and Build CPU was
# the largest line: the [deploy] gate held, but sessions landed 7–14 [deploy]
# commits a day per site ("deploy it now" manual releases). So a [deploy]
# commit within MIN_GAP_HOURS of the last production deployment is skipped and
# rides the next release. [urgent] in the SUBJECT overrides it, only when the
# owner says a release cannot wait. The last deployment is
# VERCEL_GIT_PREVIOUS_SHA (Vercel sets it in this step); when it is unset or
# cannot be read, build (fail open).
MIN_GAP_HOURS="${MIN_GAP_HOURS:-12}"
recent_production_build() {
  printf '%s' "$subject" | grep -qiF -- '[urgent]' && return 1
  local prev="${VERCEL_GIT_PREVIOUS_SHA:-}" prev_ts now
  [ -z "$prev" ] && return 1
  if ! git cat-file -e "${prev}^{commit}" 2>/dev/null; then
    GIT_TERMINAL_PROMPT=0 timeout 30 git fetch --quiet --deepen=200 origin >/dev/null 2>&1 || true
  fi
  prev_ts="$(git show -s --format=%ct "$prev" 2>/dev/null || true)"
  [ -z "$prev_ts" ] && return 1
  now="${NOW_EPOCH:-$(date +%s)}"
  [ $(( now - prev_ts )) -lt $(( MIN_GAP_HOURS * 3600 )) ]
}
if [ "$env" != "preview" ] && [ "$env" != "development" ] \
  && printf '%s' "$subject" | grep -qiF -- '[deploy]' && recent_production_build; then
  echo "[vercel-ignore-build] [deploy] in the subject, but production last built under ${MIN_GAP_HOURS}h ago (${VERCEL_GIT_PREVIOUS_SHA:0:7}) — skipping; it rides the next release. [urgent] in the subject overrides."
  exit 0
fi

if printf '%s' "$subject" | grep -qiF -- '[deploy]'; then
  echo "[ignore-build] [deploy] in the subject — building production."
  exit 1
fi
echo "[ignore-build] no [deploy] in the subject — skipping; the daily release will ship it."
exit 0
