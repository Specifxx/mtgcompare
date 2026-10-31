# Visitor reports (never deployed, never merged)

"Report a wrong price" and "Suggest a store" submissions from this site, one JSON file each, written by
`src/lib/reports-github.ts` on `main`:

- `inbox/<site>/<YYYY-MM-DD>/<HHMMSS>-<kind>-<random>.json`: still open (kind: wrong-price, suggest-store, other)
- `done/<site>/...`: handled (moved here with `git mv`, optionally with a "resolution" field)

Nothing about the visitor is stored (no email, no IP), and notes are redacted before they are written. Nothing on
the site reads this branch. RiftCompare's daily *Reports triage* (Specifxx/TCGEmpire,
`.github/workflows/reports-triage.yml`) reads it and keeps one issue per site there.

This branch's own `vercel.json` turns deploys off; never merge it into `main`.
