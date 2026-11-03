// The beta forum's storage: forum.json on the site repo's public `forum` branch
// (rules in ./core.ts; the same file in every repo).
//
// - Pages read the file from raw.githubusercontent.com, cached like any other
//   page data (never a GitHub read per visit); the browser then fetches the
//   newest copy itself, straight from GitHub, so a reply shows up within
//   minutes without a deploy or a function call.
// - Only POST /api/forum writes, with REPORTS_GITHUB_TOKEN (the token the visitor
//   reports already use: Contents read/write on the site repos, Vercel only).
//   A write reads the file's sha and puts the new file back; when two posts race,
//   GitHub refuses the second and it retries on the newer file.
// - A held post (a link to another site, or a word on the hold list) is never
//   published: it is filed as held/<day>/<time>-<id>.json on the same branch and
//   flagged in the visitor reports (kind "other", issue "forum-held") so the
//   daily reports triage shows it. Approving one is a moderator's edit.
// - "Report this post" files a visitor report (issue "forum-post").
// The write path sets no cache option: POST /api/forum is force-dynamic, so its
// fetches are never cached. Commit subjects never carry [deploy] or [preview]; the branch has its own
// no-deploy vercel.json and the main vercel.json turns `forum` deploys off.
import { applyPost, checkPost, EMPTY_FORUM, LIMITS, parseForum, rateProblem, type ForumFile, type ForumSite } from "./core";
import { cleanReport, overLimit, reportsToken, saveReport } from "../reports-github";

export const FORUM_BRANCH = "forum";
export const FORUM_FILE = "forum.json";

export const forumRawUrl = (repo: string) => `https://raw.githubusercontent.com/${repo}/${FORUM_BRANCH}/${FORUM_FILE}`;
/** The browser's copy: GitHub's API, which (unlike raw) is never minutes stale. */
export const forumApiUrl = (repo: string) => `https://api.github.com/repos/${repo}/contents/${FORUM_FILE}?ref=${FORUM_BRANCH}`;

/**
 * The forum for a page. Never throws: an unreadable file is an empty forum (the
 * browser fetches its own copy anyway). `revalidate` is the page's own cache life
 * (a site's cost rules decide it; 0 = every render, for pages the CDN caches;
 * false = read once at build).
 */
export async function readForum(site: Pick<ForumSite, "repo">, revalidate: number | false = 21600): Promise<ForumFile> {
  try {
    const res = await fetch(forumRawUrl(site.repo), {
      signal: AbortSignal.timeout(8000),
      ...(revalidate === false ? { cache: "force-cache" as const } : { next: { revalidate } }),
    });
    if (!res.ok) return EMPTY_FORUM;
    return parseForum(await res.json());
  } catch {
    return EMPTY_FORUM;
  }
}

const gh = (accept = "application/vnd.github+json") => ({
  Authorization: `Bearer ${reportsToken()}`,
  Accept: accept,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "compare-forum",
  "Content-Type": "application/json",
});

async function readForWrite(repo: string): Promise<{ file: ForumFile; sha: string | null }> {
  const url = `https://api.github.com/repos/${repo}/contents/${FORUM_FILE}?ref=${FORUM_BRANCH}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: gh() });
  if (res.status === 404) return { file: EMPTY_FORUM, sha: null };
  if (!res.ok) throw new Error(`GitHub said HTTP ${res.status} reading the forum`);
  const j = (await res.json()) as { sha: string; content?: string; encoding?: string };
  let text: string;
  if (j.encoding === "base64" && j.content) text = Buffer.from(j.content, "base64").toString("utf8");
  else {
    const raw = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: gh("application/vnd.github.raw") });
    if (!raw.ok) throw new Error(`GitHub said HTTP ${raw.status} reading the forum`);
    text = await raw.text();
  }
  return { file: parseForum(JSON.parse(text)), sha: j.sha };
}

async function putFile(repo: string, path: string, content: string, message: string, sha: string | null): Promise<number> {
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: "PUT",
    signal: AbortSignal.timeout(15_000),
    headers: gh(),
    body: JSON.stringify({ message, content: Buffer.from(content).toString("base64"), branch: FORUM_BRANCH, ...(sha ? { sha } : {}) }),
  });
  return res.status;
}

/** forum.json as written: one thread per line, so a moderator's diff is readable. */
export function serialiseForum(f: ForumFile): string {
  return `{"v":${f.v},"threads":[\n${f.threads.map((t) => JSON.stringify(t)).join(",\n")}\n]}\n`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function visitorOf(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  return (xff ? xff.split(",")[0]!.trim() : req.headers.get("x-real-ip")) || "unknown";
}

/** The whole POST /api/forum handler: new thread, reply, or report a post. */
export async function handleForumPost(req: Request, site: ForumSite): Promise<Response> {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return json({ error: "Not allowed." }, 403);
    } catch {
      return json({ error: "Not allowed." }, 403);
    }
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ error: "Couldn't read that." }, 400);
  // Honeypot: a field no person sees. Say thanks and keep nothing.
  if (typeof body.website === "string" && body.website.trim()) return json({ ok: true, held: true });
  if (!reportsToken()) return json({ error: "The forum isn't switched on yet. Please try again later." }, 503);
  const visitor = visitorOf(req);

  if (body.kind === "report") {
    const thread = typeof body.thread === "string" ? body.thread.slice(0, 8) : "";
    const post = typeof body.post === "string" ? body.post.slice(0, 8) : "";
    if (!/^[a-z0-9]{8}$/.test(thread) || !/^[a-z0-9]{8}$/.test(post)) return json({ error: "Couldn't find that post." }, 400);
    if (overLimit(visitor)) return json({ error: "That's a lot of reports in a short time. Please try again in an hour." }, 429);
    const c = cleanReport(
      { kind: "other", issue: "forum-post", page: `${site.base}/${thread}`, product: `forum post ${thread}/${post}`, note: `Forum post reported. ${typeof body.reason === "string" ? body.reason : ""}`.trim() },
      site.site,
    );
    if (!c.ok) return json({ error: c.error }, 400);
    return (await saveReport(c.report)) === "saved" ? json({ ok: true }) : json({ error: "Couldn't send that right now. Please try again in a minute." }, 502);
  }

  const shownFor = Number(body.ms);
  if (Number.isFinite(shownFor) && shownFor >= 0 && shownFor < LIMITS.minFormMs) return json({ error: "That was quick! Please give it another second and post again." }, 400);
  const c = checkPost(body, site);
  if (!c.ok) return json({ error: c.error }, 400);
  const limited = rateProblem(visitor, c.input.kind === "thread");
  if (limited) return json({ error: limited }, 429);

  if (c.hold) {
    const at = new Date().toISOString().slice(0, 19) + "Z";
    const id = Math.random().toString(36).slice(2, 10);
    const path = `held/${at.slice(0, 10)}/${at.slice(11, 19).replace(/:/g, "")}-${id}.json`;
    const status = await putFile(site.repo, path, JSON.stringify({ at, reason: c.hold, ...c.input }, null, 1) + "\n", `forum: post held for review (${c.hold})`, null).catch(() => 0);
    if (status !== 201) return json({ error: "Couldn't post that right now. Please try again in a minute." }, 502);
    const r = cleanReport({ kind: "other", issue: "forum-held", page: site.base, product: `forum held post ${path}`, note: `A forum post is waiting for review (${c.hold}): ${path} on the forum branch.` }, site.site);
    if (r.ok) await saveReport(r.report);
    return json({ ok: true, held: true });
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    let cur: { file: ForumFile; sha: string | null };
    try {
      cur = await readForWrite(site.repo);
    } catch (e) {
      console.warn(`[forum] ${(e as Error).message}`);
      return json({ error: "Couldn't post that right now. Please try again in a minute." }, 502);
    }
    const next = applyPost(cur.file, c.input);
    if (!next.ok) return json({ error: next.error }, 400);
    const msg = next.thread.posts.length === 1 ? `forum: new thread ${next.thread.id}` : `forum: reply in ${next.thread.id}`;
    const status = await putFile(site.repo, FORUM_FILE, serialiseForum(next.file), msg, cur.sha).catch(() => 0);
    if (status === 200 || status === 201) return json({ ok: true, thread: next.thread, post: next.post });
    if (status !== 409 && status !== 422) {
      console.warn(`[forum] GitHub said HTTP ${status} saving a post`);
      return json({ error: "Couldn't post that right now. Please try again in a minute." }, 502);
    }
    await new Promise((r) => setTimeout(r, 300 + attempt * 400));
  }
  return json({ error: "The forum is busy. Please try again in a moment." }, 503);
}
