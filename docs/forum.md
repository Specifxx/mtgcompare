# The beta forum

`/forum` on every Compare Empire site (owner, 2026-11-01): public discussion
with no accounts. A visitor types a name (remembered in their browser) and posts.

## Where posts live

One file, `forum.json`, on this repo's public orphan branch `forum` (never
deployed, never merged; `vercel.json` has `deploymentEnabled.forum: false`).
One thread per line:

```json
{"v":1,"threads":[
{"id":"k3x9a2pq","category":"deals","title":"…","at":"2026-11-01T03:00:00Z","last":"…","posts":[{"id":"…","name":"Sam","body":"…","at":"…"}]}
]}
```

- Written only by `POST /api/forum` (`src/lib/forum/store.ts`) with
  `REPORTS_GITHUB_TOKEN`, the visitor-reports token (Contents read/write).
- Pages read it from raw.githubusercontent.com through the page's normal cache
  (never a GitHub read per visit); the browser then fetches the newest copy from
  GitHub itself, so new posts show within minutes, with no deploy or function.
- No IP, email or hash is stored. Emails, IPs and phone numbers in posts are
  blanked. Names are not verified (the page says so).

## Spam and safety (`src/lib/forum/core.ts`)

Honeypot field; a post sent under 2.5 s after the form appeared is refused;
per visitor 4 posts per 10 minutes, 20 a day, 4 new threads a day; 60 posts an
hour per function instance; duplicate replies and same-day duplicate titles
refused; all-caps and keyboard mashing refused; reserved names (admin,
moderator, the site's name…). **Held, never published:** a post linking to
another site, or with a word on the hold list (slurs, strong profanity, sexual
spam). A held post is filed at `held/<day>/<time>-<id>.json` on the `forum`
branch and flagged as a visitor report (`issue: forum-held`), so the daily
reports triage shows it. "Report" on a post files a visitor report
(`issue: forum-post`).

## Moderating (ask Claude)

On the `forum` branch, edit `forum.json` and push (never `[deploy]` in the subject):

- remove a post: set `"removed":true` and `"body":""` on it;
- remove a thread: set `"removed":true` on the thread (and blank its posts);
- close a thread to replies: `"locked":true`.

```
git fetch origin forum && git switch forum
# edit forum.json
git commit -am "forum: remove <id>" && git push origin forum
```

`removeFromForum(file, id)` in `src/lib/forum/core.ts` does the same edit. To
approve a held post, add it to its thread in `forum.json` (new `id`, its `at`)
and `git rm` the held file. Commit subjects never carry `[deploy]`.

## SEO

Threads are in the server HTML. A thread with no replies is `noindex`; the
forum page is `noindex` until some thread has a reply. Indexable threads carry
`DiscussionForumPosting` JSON-LD. Pages keep the site's normal cache life.
