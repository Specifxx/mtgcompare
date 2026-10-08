#!/usr/bin/env bash
# scripts/plane-checkout.sh (owner WP01b). Checks out the tree of the POINTED commit (not the branch head: a crash between data commit A and the pointer commit B can leave the head ahead of the pointer) of the PRIVATE data repository
# into $1 (default .data), for every job that reads the published data (eBay passes, alerts, rollback checks). Needs PLANE_REPO and DATA_REPO_TOKEN (the token travels in an http extraheader, never in the URL or the log).
set -euo pipefail
DIR="${1:-.data}"; REPO="${PLANE_REPO:?PLANE_REPO is not set}"; BRANCH="${PLANE_BRANCH:-data}"
AUTH="AUTHORIZATION: basic $(printf 'x-access-token:%s' "${DATA_REPO_TOKEN:?DATA_REPO_TOKEN is not set}" | base64 -w0)"
echo "::add-mask::$AUTH" 2>/dev/null || true
rm -rf "$DIR"; mkdir -p "$DIR"; cd "$DIR"; git init -q
git -c "http.https://github.com/.extraheader=$AUTH" fetch -q --depth 1 "https://github.com/$REPO.git" "$BRANCH"
REF="$(git show FETCH_HEAD:latest.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).ref))')"
git -c "http.https://github.com/.extraheader=$AUTH" fetch -q --depth 1 "https://github.com/$REPO.git" "$REF"
git checkout -q "$REF"
echo "plane checkout: $REF ($(du -sh . | cut -f1)) in $DIR"
