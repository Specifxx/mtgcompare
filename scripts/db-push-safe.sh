#!/usr/bin/env bash
# `prisma db push` for the workflows, with one narrow exception to Prisma's
# data-loss guard, and prisma/sql/post-push.sql after it.
#
# Prisma refuses to add a @unique to a column without --accept-data-loss, even a
# brand-new nullable column whose rows are all NULL (Postgres lets any number of
# NULLs share a unique index, so nothing can be lost). Passing the flag always
# would also wave through dropped columns and tables, so this script retries
# with it ONLY when every warning Prisma prints is an added unique constraint.
# Anything else (a drop, a type change, a required column) still fails the run.
#
# A push also resets what Prisma cannot model (storage parameters, hand-made
# indexes), so every successful push is followed by the idempotent
# prisma/sql/post-push.sql: `prisma db execute`, else psql. A failure of that
# step fails the script too.
set -uo pipefail

post_push() {
  local file="prisma/sql/post-push.sql"
  [ -f "$file" ] || return 0
  if npx prisma db execute --file "$file" --schema prisma/schema.prisma; then
    echo "db-push-safe: applied $file"
    return 0
  fi
  if command -v psql >/dev/null 2>&1 && [ -n "${DATABASE_URL:-}" ]; then
    echo "db-push-safe: prisma db execute failed; trying psql" >&2
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file" && return 0
  fi
  echo "db-push-safe: $file failed" >&2
  return 1
}

out="$(npx prisma db push --skip-generate 2>&1)"
status=$?
printf '%s\n' "$out"
if [ $status -eq 0 ]; then
  post_push
  exit $?
fi

if ! printf '%s' "$out" | grep -q -- '--accept-data-loss'; then
  exit $status
fi

warnings="$(printf '%s\n' "$out" | grep -E '^\s*•' || true)"
if [ -z "$warnings" ]; then
  echo "db-push-safe: Prisma asked for --accept-data-loss but listed no warnings; refusing." >&2
  exit 1
fi
if printf '%s\n' "$warnings" | grep -vqE 'A unique constraint covering the columns .* will be added'; then
  echo "db-push-safe: a data-loss warning other than an added unique constraint; refusing." >&2
  exit 1
fi

echo "db-push-safe: only added unique constraints were flagged; applying with --accept-data-loss."
npx prisma db push --skip-generate --accept-data-loss || exit $?
post_push
