// The beta forum: pure rules, shared by every Compare Empire site (the same file
// in every repo; the site's own settings are in src/lib/forum/site.ts).
//
// Owner, 2026-11-01: "user forums ... you don't need to sign in ... put your name
// down ... it'll save your name ... all of this is public data ... keep it within
// each website's repository". So:
//
// - Posts are public and live in the site's OWN public repo, on an orphan
//   `forum` branch that never deploys and is never merged, as one file,
//   forum.json (shape below). Removing a post is an edit to that file
//   (docs/forum.md says how).
// - No accounts: a visitor types a name, which their browser remembers
//   (localStorage). Names are not verified, and the page says so.
// - Nothing about a visitor is kept: no IP, no email, no hash of either. Emails,
//   IPs and phone numbers in a post are blanked before it is written. The
//   per-visitor limits live only in the function's memory.
// - Spam: a honeypot field, a minimum time on the form, per-visitor and
//   per-instance rate limits, a duplicate check, and a hold for review (never
//   published) on links to other sites and on slurs or strong profanity.
// - Categories are the site's own topics; an empty forum shows its topics and
//   an invitation, never an invented post.

export const FORUM_VERSION = 1 as const;

export interface ForumPost {
  id: string;
  /** the name the visitor typed */
  name: string;
  body: string;
  /** ISO time, UTC, to the second */
  at: string;
  /** set by a moderator: the post shows as "removed" and its text is gone */
  removed?: true;
}

export interface ForumThread {
  id: string;
  category: string;
  title: string;
  /** ISO time the thread was started */
  at: string;
  /** ISO time of its newest visible post */
  last: string;
  /** set by a moderator: the whole thread is hidden */
  removed?: true;
  /** set by a moderator: no new replies */
  locked?: true;
  /** the first post is the opening post */
  posts: ForumPost[];
}

export interface ForumFile {
  v: typeof FORUM_VERSION;
  threads: ForumThread[];
}

export interface ForumCategory {
  /** url-safe key, stored on each thread */
  key: string;
  name: string;
  /** one line on what belongs there */
  blurb: string;
  /** a few ideas shown on an empty category to get people started (never posts) */
  prompts?: string[];
}

export interface ForumSite {
  /** short site id, as in reports-github.ts SITE_REPOS ("riftcompare") */
  site: string;
  /** shown in the page title ("RiftCompare") */
  siteName: string;
  /** "Specifxx/TCGEmpire" */
  repo: string;
  /** the site's own hosts: links to them are fine in a post */
  hosts: string[];
  /** where the forum lives ("/forum") */
  base: string;
  /** what the community is about, for the page's intro ("Riftbound TCG") */
  topic: string;
  /** one sentence under the forum's heading */
  intro: string;
  categories: ForumCategory[];
  /** extra names nobody may post as (the site's own name is always reserved) */
  reserved?: string[];
}

export const LIMITS = {
  name: { min: 2, max: 24 },
  title: { min: 6, max: 110 },
  body: { min: 2, max: 3000 },
  /** a person takes at least this long to write a post (ms since the form showed) */
  minFormMs: 2500,
} as const;

export const EMPTY_FORUM: ForumFile = { v: FORUM_VERSION, threads: [] };

// ---- reading -----------------------------------------------------------------

const str = (v: unknown): v is string => typeof v === "string";

/** Parse forum.json defensively: anything malformed is dropped, never thrown. */
export function parseForum(raw: unknown): ForumFile {
  const o = (raw && typeof raw === "object" ? raw : {}) as { threads?: unknown };
  if (!Array.isArray(o.threads)) return { v: FORUM_VERSION, threads: [] };
  const threads: ForumThread[] = [];
  for (const t of o.threads as Record<string, unknown>[]) {
    if (!t || !str(t.id) || !str(t.title) || !str(t.category) || !Array.isArray(t.posts)) continue;
    const posts: ForumPost[] = [];
    for (const p of t.posts as Record<string, unknown>[]) {
      if (!p || !str(p.id) || !str(p.name) || !str(p.at)) continue;
      posts.push({ id: p.id, name: p.name, body: str(p.body) ? p.body : "", at: p.at, ...(p.removed ? { removed: true as const } : {}) });
    }
    if (!posts.length) continue;
    threads.push({
      id: t.id,
      category: t.category,
      title: t.title,
      at: str(t.at) ? t.at : posts[0]!.at,
      last: str(t.last) ? t.last : posts[posts.length - 1]!.at,
      ...(t.removed ? { removed: true as const } : {}),
      ...(t.locked ? { locked: true as const } : {}),
      posts,
    });
  }
  return { v: FORUM_VERSION, threads };
}

/** Threads a visitor may see, newest activity first. */
export function visibleThreads(f: ForumFile): ForumThread[] {
  return f.threads.filter((t) => !t.removed && t.posts[0] && !t.posts[0].removed).sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : 0));
}

export const findThread = (f: ForumFile, id: string): ForumThread | null => visibleThreads(f).find((t) => t.id === id) ?? null;

/** Replies that a visitor can read (the opening post is not a reply). */
export const replyCount = (t: ForumThread): number => t.posts.slice(1).filter((p) => !p.removed).length;

/** A thread is worth a search engine's time only once someone has answered it. */
export const threadIndexable = (t: ForumThread): boolean => replyCount(t) > 0;

export function slugify(s: string): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "thread"
  );
}

/** /forum/<id>-<slug>: the id decides, the slug is for people. */
export const threadPath = (site: Pick<ForumSite, "base">, t: Pick<ForumThread, "id" | "title">): string => `${site.base}/${t.id}-${slugify(t.title)}`;

/** The id at the front of a thread's path segment ("k3x9a2pq-best-booster-box"). */
export function idFromSegment(seg: string): string | null {
  const m = /^([a-z0-9]{8})(?:-|$)/.exec(decodeURIComponent(seg || ""));
  return m ? m[1]! : null;
}

export const newId = (rand: () => number = Math.random): string => Array.from({ length: 8 }, () => "abcdefghijkmnpqrstuvwxyz23456789"[Math.floor(rand() * 32)]).join("");

/** "3 hours ago", "2 Nov" (no locale surprises between server and browser). */
export function ago(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  const dt = new Date(t);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][dt.getUTCMonth()];
  return `${dt.getUTCDate()} ${mon}${dt.getUTCFullYear() === new Date(now).getUTCFullYear() ? "" : ` ${dt.getUTCFullYear()}`}`;
}

// ---- writing: cleaning and spam rules -----------------------------------------

/** Blank emails, IP addresses and phone-like numbers: a post must not dox anyone. */
export function redact(s: string): string {
  return s
    .replace(/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi, "[email removed]")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "[ip removed]")
    .replace(/\+?\d[\d ().-]{7,}\d/g, (m) => (m.replace(/\D/g, "").length >= 9 ? "[number removed]" : m));
}

/** Strip control characters, trim each line, collapse runs of blank lines. */
export function cleanText(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max)
    .trim();
}

export const cleanName = (raw: unknown): string => cleanText(raw, LIMITS.name.max * 2).replace(/\s+/g, " ").slice(0, LIMITS.name.max).trim();

// Words that hold a post for review. Matched on whole words after folding
// look-alike characters, so "f*ck" and "fu.ck" still match. Kept short on
// purpose: mild swearing ("damn", "crap") is fine in a hobby forum.
const HOLD_WORDS = [
  // strong profanity
  "fuck", "fucking", "fucker", "motherfucker", "cunt", "cunts", "wanker", "twat",
  // slurs (racial, homophobic, ableist)
  "nigger", "nigga", "niggas", "faggot", "fag", "fags", "retard", "retarded", "tranny", "chink", "spic", "kike", "gook", "paki", "coon", "wetback", "dyke",
  // threats and sexual spam
  "kys", "rape", "porn", "onlyfans", "escort", "nudes",
];
// Stems found inside run-together text ("f u c k"); never "cunt" (Scunthorpe).
const HOLD_STEMS = ["fuck", "nigger", "faggot"];

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[@4]/g, "a")
    .replace(/3/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/0/g, "o")
    .replace(/[$5]/g, "s")
    .replace(/7/g, "t")
    .replace(/\*/g, "u")
    .replace(/(\w)[._-](?=\w)/g, "$1");
}

/** true when the text contains a word on the hold list. Exported for tests. */
export function hasHoldWord(s: string): boolean {
  const f = fold(s);
  const words = new Set(f.split(/[^a-z]+/).filter(Boolean));
  if (HOLD_WORDS.some((w) => words.has(w))) return true;
  const squashed = f.replace(/[^a-z]/g, "");
  return HOLD_STEMS.some((w) => squashed.includes(w));
}

/** Links in the text that point anywhere but the site itself. */
export function foreignLinks(s: string, hosts: string[]): string[] {
  const out: string[] = [];
  const own = hosts.map((h) => h.replace(/^www\./, "").toLowerCase());
  for (const m of s.matchAll(/\b(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi)) {
    const raw = m[0];
    let host = "";
    try {
      host = new URL(/^www\./i.test(raw) ? `https://${raw}` : raw).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      out.push(raw);
      continue;
    }
    if (!own.some((h) => host === h || host.endsWith(`.${h}`))) out.push(raw);
  }
  return out;
}

const RESERVED = ["admin", "administrator", "moderator", "mod", "mods", "staff", "official", "owner", "support", "system", "team", "claude", "anonymous bot"];

/** Why a name can't be used, or null when it's fine. */
export function nameProblem(name: string, site: Pick<ForumSite, "siteName" | "reserved">): string | null {
  if (name.length < LIMITS.name.min) return `Pick a name of at least ${LIMITS.name.min} characters.`;
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._'-]*$/u.test(name)) return "Names can use letters, numbers, spaces, dots, dashes and underscores.";
  if (/https?:|www\.|\.(com|net|org|io|gg|shop|store|xyz)\b/i.test(name)) return "A name can't be a web address.";
  const folded = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const reserved = [...RESERVED, site.siteName, ...(site.reserved ?? [])].map((r) => r.toLowerCase().replace(/[^a-z0-9]/g, ""));
  if (reserved.some((r) => r && (folded === r || (r.length >= 6 && folded.includes(r))))) return "That name is reserved. Please pick another.";
  if (hasHoldWord(name)) return "Please pick another name.";
  return null;
}

export type NewPostInput =
  | { kind: "thread"; name: string; category: string; title: string; body: string }
  | { kind: "reply"; name: string; thread: string; body: string };

export type Checked =
  | { ok: true; input: NewPostInput; hold: string | null }
  | { ok: false; error: string };

/** Validate a POST body. Pure. `hold` is a reason to keep the post for review. */
export function checkPost(body: unknown, site: ForumSite): Checked {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const name = cleanName(b.name);
  const np = nameProblem(name, site);
  if (np) return { ok: false, error: np };
  const text = redact(cleanText(b.body, LIMITS.body.max));
  if (text.length < LIMITS.body.min) return { ok: false, error: "Write a little more first." };
  let input: NewPostInput;
  let all = text;
  if (b.kind === "thread") {
    const title = redact(cleanText(b.title, LIMITS.title.max).replace(/\s+/g, " "));
    if (title.length < LIMITS.title.min) return { ok: false, error: "Give your thread a title of a few words." };
    const category = typeof b.category === "string" ? b.category : "";
    if (!site.categories.some((c) => c.key === category)) return { ok: false, error: "Pick a topic for your thread." };
    input = { kind: "thread", name, category, title, body: text };
    all = `${title}\n${text}`;
  } else if (b.kind === "reply") {
    const thread = typeof b.thread === "string" && /^[a-z0-9]{8}$/.test(b.thread) ? b.thread : "";
    if (!thread) return { ok: false, error: "That thread wasn't found." };
    input = { kind: "reply", name, thread, body: text };
  } else {
    return { ok: false, error: "Couldn't read that." };
  }
  // Shouting and keyboard mashing are not held, just refused.
  const letters = all.replace(/[^A-Za-z]/g, "");
  if (letters.length > 40 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.8) return { ok: false, error: "Please don't write in all capitals." };
  if (/(.)\1{14,}/.test(all)) return { ok: false, error: "That looks like a keyboard slip. Please tidy it up." };
  let hold: string | null = null;
  if (hasHoldWord(all)) hold = "language";
  else if (foreignLinks(all, site.hosts).length) hold = "link";
  return { ok: true, input, hold };
}

/** Add a checked post to the forum. Pure; returns the new file and what was added. */
export function applyPost(
  f: ForumFile,
  input: NewPostInput,
  now = new Date(),
  rand: () => number = Math.random,
): { ok: true; file: ForumFile; thread: ForumThread; post: ForumPost } | { ok: false; error: string } {
  const at = now.toISOString().slice(0, 19) + "Z";
  const post: ForumPost = { id: newId(rand), name: input.name, body: input.body, at };
  if (input.kind === "thread") {
    const recent = f.threads.find((t) => t.title.toLowerCase() === input.title.toLowerCase() && Date.parse(t.at) > now.getTime() - 86_400_000);
    if (recent) return { ok: false, error: "A thread with that title was started today. Reply there instead?" };
    let id = newId(rand);
    while (f.threads.some((t) => t.id === id)) id = newId(rand);
    const thread: ForumThread = { id, category: input.category, title: input.title, at, last: at, posts: [post] };
    return { ok: true, file: { v: FORUM_VERSION, threads: [thread, ...f.threads] }, thread, post };
  }
  const t = f.threads.find((x) => x.id === input.thread && !x.removed);
  if (!t) return { ok: false, error: "That thread wasn't found. It may have been removed." };
  if (t.locked) return { ok: false, error: "This thread is closed to new replies." };
  if (t.posts.some((p) => !p.removed && p.body === input.body)) return { ok: false, error: "That's already been posted in this thread." };
  const thread: ForumThread = { ...t, last: at, posts: [...t.posts, post] };
  return { ok: true, file: { v: FORUM_VERSION, threads: f.threads.map((x) => (x.id === t.id ? thread : x)) }, thread, post };
}

/** Moderation: remove one post (its text is dropped), or a whole thread when the
 *  id is the thread's or its opening post's. Pure; returns null when nothing matched. */
export function removeFromForum(f: ForumFile, id: string): ForumFile | null {
  let hit = false;
  const threads = f.threads.map((t) => {
    if (t.id === id || t.posts[0]?.id === id) {
      hit = true;
      return { ...t, removed: true as const, posts: t.posts.map((p) => ({ ...p, body: "", removed: true as const })) };
    }
    if (!t.posts.some((p) => p.id === id)) return t;
    hit = true;
    return { ...t, posts: t.posts.map((p) => (p.id === id ? { ...p, body: "", removed: true as const } : p)) };
  });
  return hit ? { v: FORUM_VERSION, threads } : null;
}

// ---- rate limits, in memory only (never stored) -------------------------------

export const RATE = {
  /** per visitor: posts in 10 minutes, posts in a day, new threads in a day */
  burst: 4,
  day: 20,
  threadsDay: 4,
  /** every visitor together, per function instance per hour */
  allHour: 60,
} as const;

const hits = new Map<string, number[]>();

/** A message when this visitor (or everyone) is over a limit, else null (and the post is counted). */
export function rateProblem(visitor: string, isThread: boolean, now = Date.now()): string | null {
  if (hits.size > 5000) hits.clear();
  const day = now - 86_400_000;
  const keep = (k: string) => (hits.get(k) ?? []).filter((t) => t > day);
  const all = keep("*");
  const mine = keep(`p:${visitor}`);
  const threads = keep(`t:${visitor}`);
  if (all.filter((t) => t > now - 3_600_000).length >= RATE.allHour) return "The forum is very busy right now. Please try again in a few minutes.";
  if (mine.filter((t) => t > now - 600_000).length >= RATE.burst) return "You're posting quickly. Please wait a few minutes before posting again.";
  if (mine.length >= RATE.day) return "That's the daily limit for posts. Please come back tomorrow.";
  if (isThread && threads.length >= RATE.threadsDay) return "That's the daily limit for new threads. You can still reply to one.";
  all.push(now);
  mine.push(now);
  if (isThread) threads.push(now);
  hits.set("*", all);
  hits.set(`p:${visitor}`, mine);
  if (isThread) hits.set(`t:${visitor}`, threads);
  return null;
}

/** For tests. */
export const resetRates = () => hits.clear();

// ---- page metadata --------------------------------------------------------------

/** schema.org DiscussionForumPosting for a thread page (only for threads with replies). */
export function threadJsonLd(origin: string, site: ForumSite, t: ForumThread): Record<string, unknown> {
  const url = `${origin}${threadPath(site, t)}`;
  const op = t.posts[0]!;
  const person = (name: string) => ({ "@type": "Person", name });
  return {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    "@id": url,
    url,
    headline: t.title,
    text: op.body.slice(0, 1000),
    author: person(op.name),
    datePublished: t.at,
    dateModified: t.last,
    interactionStatistic: { "@type": "InteractionCounter", interactionType: "https://schema.org/CommentAction", userInteractionCount: replyCount(t) },
    comment: t.posts
      .slice(1)
      .filter((p) => !p.removed)
      .slice(0, 50)
      .map((p) => ({ "@type": "Comment", text: p.body.slice(0, 1000), author: person(p.name), datePublished: p.at })),
  };
}

/** A short description for a thread page: its opening post, on one line. */
export const threadDescription = (t: ForumThread): string => {
  const s = (t.posts[0]?.body ?? "").replace(/\s+/g, " ").trim();
  return s.length > 155 ? `${s.slice(0, 152).replace(/\s+\S*$/, "")}…` : s;
};

/** The forum's landing page is indexed once any thread has a reply. */
export const forumIndexable = (f: ForumFile): boolean => visibleThreads(f).some(threadIndexable);
