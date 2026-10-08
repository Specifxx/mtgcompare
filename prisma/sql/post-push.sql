-- prisma/sql/post-push.sql (owner WP01a). Idempotent. scripts/db-push-safe.sh runs it after EVERY `prisma db push` (which drops indexes and storage parameters that Prisma cannot model):
--   npx prisma db execute --file prisma/sql/post-push.sql --schema prisma/schema.prisma      (fallback: psql -f)
-- The draft's statements were all about public tables (Oracle_nameKey_pattern_idx, Card_rootId_idx, the fillfactor settings of Offer, Unit and CardPrice): those tables are files now. The only table that is rewritten
-- hard is CardStat (the sampled counters), and a small fillfactor keeps its updates in place.
ALTER TABLE "CardStat" SET (fillfactor = 85);
