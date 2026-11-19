# Reddit snapshot posts (the Hot 100 link)

The owner posts the Hot 100 to Reddit as a plain link post: a title and the page's link, nothing else (owner, 2026-11-20).
The post lives on its thumbnail, which is the page's share card, `/og/hot-100/<region>`: the #1 riser large with its photo
and #2 to #6 beside it, each with its real 7-day rise (`src/lib/og/hot100-card.tsx`, DECISIONS.md 2026-11-20).

- Link: `https://<host>/us/hot-100?utm_source=reddit&utm_medium=social&utm_campaign=hot100-<site>-<YYYY-MM-DD>`.
- The page's og:image carries the week (`?w=<through>`), so a post made after a release unfurls this week's card.
- One sub per site, once a week. The ready-to-copy titles, subs and posting times are on the owner's Reddit snapshot kit
  page; the kit's source is `/mnt/project-files/reddit/snapshots/` in the project folder.
- Check the thumbnail before posting: open `/og/hot-100/us` on the live site.
