#!/usr/bin/env bash
# Home page ranking (DECISIONS.md, "Home pages rank items by demand", 2026-11-18): fetch this site's per-item demand
# (product page views and buy clicks, last 28 and 7 days) from RiftCompare's public /api/demand/<site>, keep it only when it
# answered, and commit it to main WITHOUT a deploy marker: it rides the next release, and the file's history in git is the log
# of what the ranking saw each day. Never fatal: a failed fetch keeps yesterday's file and the home page keeps its order.
# Usage: bash scripts/pull-demand.sh <site key> <path of the demand file in the repo>
set -uo pipefail
SITE="${1:?site key}"
FILE="${2:?file}"
URL="https://riftcompare.com/api/demand/${SITE}"
TMP="$(mktemp)"
if ! curl -fsS --max-time 90 -A "compare-empire-data-job" "$URL" -o "$TMP"; then
  echo "::warning::demand: $URL did not answer; keeping the last file."
  exit 0
fi
if ! node -e "const d=JSON.parse(require('fs').readFileSync('$TMP','utf8'));if(!['ok','partial'].includes(d.status)){console.error('status',d.status,d.detail||'');process.exit(1)}" ; then
  echo "::warning::demand: $URL answered without data; keeping the last file."
  exit 0
fi
# Stable output: sorted keys, so a day with the same numbers is no change.
node -e "
const fs=require('fs');const d=JSON.parse(fs.readFileSync('$TMP','utf8'));
const sort=o=>Object.fromEntries(Object.keys(o||{}).sort().map(k=>[k,o[k]]));
const out={site:d.site,status:d.status,fetchedAt:d.fetchedAt,from28:d.from28,from7:d.from7,to:d.to,views:sort(d.views),clicks:sort(d.clicks)};
fs.writeFileSync('$TMP.out',JSON.stringify(out,null,0)+'\n');"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
WORK="$(mktemp -d)"
trap 'git worktree remove --force "$WORK/tree" >/dev/null 2>&1 || true; rm -rf "$WORK" "$TMP" "$TMP.out"' EXIT
for attempt in 1 2 3 4 5; do
  git fetch --quiet origin main || { sleep $((attempt * 5)); continue; }
  git worktree remove --force "$WORK/tree" >/dev/null 2>&1 || true
  git worktree add --quiet --detach "$WORK/tree" origin/main
  mkdir -p "$(dirname "$WORK/tree/$FILE")"
  cp "$TMP.out" "$WORK/tree/$FILE"
  cp "$TMP.out" "$FILE" 2>/dev/null || true
  (
    cd "$WORK/tree"
    git add -- "$FILE"
    if git diff --cached --quiet; then echo "demand: unchanged."; exit 0; fi
    git commit -q -m "data: home page demand for ${SITE} ($(date -u +%F))" -m "Product page views and buy clicks, last 28 and 7 days, from riftcompare.com/api/demand/${SITE}. No deploy marker: it rides the next release."
    git push -q origin HEAD:main
  ) && exit 0
  sleep $((attempt * 5))
done
echo "::warning::demand: could not push after 5 attempts; the ranking keeps the last file."
exit 0
