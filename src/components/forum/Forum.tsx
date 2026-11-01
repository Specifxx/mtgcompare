"use client";

// The beta forum's page (rules in src/lib/forum/core.ts; the same file in every
// repo). The server renders it with the forum as the page's cache had it, so
// threads are in the HTML for search engines; the browser then fetches the
// newest forum.json straight from GitHub (no function, no database) and merges
// in the visitor's own posts that GitHub's copy doesn't show yet.
//
// No sign-in: the visitor's name is kept in this browser only (localStorage).
// A thread the page's copy doesn't know yet opens at <base>#t=<id>.
// Styling: plain fm-* classes in ./forum.css, coloured by the site's --fm-*
// variables (set in its globals.css), so it reads as part of each site.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ago,
  findThread,
  LIMITS,
  parseForum,
  replyCount,
  threadPath,
  visibleThreads,
  type ForumCategory,
  type ForumFile,
  type ForumPost,
  type ForumSite,
  type ForumThread,
} from "@/lib/forum/core";

export type ForumSiteProps = Pick<ForumSite, "site" | "siteName" | "repo" | "base" | "topic" | "intro" | "categories" | "hosts" | "reserved">;

const NAME_KEY = "forum:name";
const PENDING_KEY = "forum:pending";
const PENDING_MS = 30 * 60_000;

function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Threads this browser posted (or replied in) that GitHub's copy may not show yet. */
function readPending(): ForumThread[] {
  try {
    const raw = JSON.parse(store()?.getItem(PENDING_KEY) || "[]") as { saved: number; thread: unknown }[];
    return raw.filter((x) => Date.now() - x.saved < PENDING_MS).flatMap((x) => parseForum({ threads: [x.thread] }).threads);
  } catch {
    return [];
  }
}

function savePending(t: ForumThread) {
  try {
    const raw = (JSON.parse(store()?.getItem(PENDING_KEY) || "[]") as { saved: number; thread: ForumThread }[]).filter((x) => Date.now() - x.saved < PENDING_MS && x.thread.id !== t.id);
    store()?.setItem(PENDING_KEY, JSON.stringify([{ saved: Date.now(), thread: t }, ...raw].slice(0, 20)));
  } catch {
    /* private mode: the post is still saved, it just shows after GitHub catches up */
  }
}

/** GitHub's copy plus this browser's own newer posts. */
function merge(base: ForumFile, pending: ForumThread[]): ForumFile {
  if (!pending.length) return base;
  const threads = [...base.threads];
  for (const p of pending) {
    const i = threads.findIndex((t) => t.id === p.id);
    if (i < 0) {
      threads.unshift(p);
      continue;
    }
    const have = new Set(threads[i]!.posts.map((x) => x.id));
    const extra = p.posts.filter((x) => !have.has(x.id));
    if (extra.length && !threads[i]!.removed) threads[i] = { ...threads[i]!, last: p.last > threads[i]!.last ? p.last : threads[i]!.last, posts: [...threads[i]!.posts, ...extra] };
  }
  return { v: base.v, threads };
}

async function fetchFresh(repo: string): Promise<ForumFile | null> {
  const urls: [string, RequestInit][] = [
    [`https://api.github.com/repos/${repo}/contents/forum.json?ref=forum`, { headers: { Accept: "application/vnd.github.raw" }, cache: "no-store" }],
    [`https://raw.githubusercontent.com/${repo}/forum/forum.json`, { cache: "no-store" }],
  ];
  for (const [url, init] of urls) {
    try {
      const r = await fetch(url, init);
      if (r.ok) return parseForum(await r.json());
    } catch {
      /* try the next copy */
    }
  }
  return null;
}

function hue(name: string): number {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function Avatar({ name }: { name: string }) {
  const h = hue(name);
  return (
    <span className="fm-avatar" aria-hidden="true" style={{ background: `hsl(${h} 62% 46%)` }}>
      {(name.trim()[0] || "?").toUpperCase()}
    </span>
  );
}

function Body({ text }: { text: string }) {
  return (
    <div className="fm-body">
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i}>
          {para.split("\n").map((line, j) => (
            <span key={j}>
              {j > 0 && <br />}
              {line}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}

const catOf = (cats: ForumCategory[], key: string) => cats.find((c) => c.key === key);

function useNow(initial: number) {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

type Send = { status: "idle" | "sending" } | { status: "error"; message: string } | { status: "held" };

async function post(body: Record<string, unknown>): Promise<{ ok: true; thread?: ForumThread; held?: boolean } | { ok: false; error: string }> {
  try {
    const r = await fetch("/api/forum", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; thread?: unknown; held?: boolean };
    if (r.ok && j.ok) return { ok: true, held: Boolean(j.held), thread: j.thread ? parseForum({ threads: [j.thread] }).threads[0] : undefined };
    return { ok: false, error: j.error || "Couldn't post that. Please try again." };
  } catch {
    return { ok: false, error: "Couldn't post that. Check your connection and try again." };
  }
}

function NameField({ name, setName }: { name: string; setName: (s: string) => void }) {
  return (
    <label className="fm-field fm-field-name">
      <span>Your name</span>
      <input
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={LIMITS.name.max}
        minLength={LIMITS.name.min}
        required
        autoComplete="nickname"
        placeholder="Any name you like"
      />
    </label>
  );
}

/** The fields every form shares: a honeypot no person sees. */
function Honeypot() {
  return (
    <div className="fm-hp" aria-hidden="true">
      <label>
        Website <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}

function useName(): [string, (s: string) => void] {
  const [name, setName] = useState("");
  useEffect(() => {
    const n = store()?.getItem(NAME_KEY);
    if (n) setName(n);
  }, []);
  const set = useCallback((s: string) => {
    setName(s);
    try {
      store()?.setItem(NAME_KEY, s);
    } catch {
      /* not remembered, still usable */
    }
  }, []);
  return [name, set];
}

function Note() {
  return (
    <p className="fm-note">
      Posts are public. Your name is remembered on this device only and isn&rsquo;t verified. Please don&rsquo;t share an email, phone number or address.{" "}
      <a href="#forum-rules">Forum rules</a>
    </p>
  );
}

function NewThread({ site, initialCategory, onDone, onCancel }: { site: ForumSiteProps; initialCategory: string; onDone: (t: ForumThread | null) => void; onCancel: () => void }) {
  const [name, setName] = useName();
  const [cat, setCat] = useState(initialCategory || site.categories[0]?.key || "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [state, setState] = useState<Send>({ status: "idle" });
  const shown = useRef(Date.now());
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => titleRef.current?.focus(), []);
  useEffect(() => setCat(initialCategory || site.categories[0]?.key || ""), [initialCategory, site.categories]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setState({ status: "sending" });
    const r = await post({ kind: "thread", name, category: cat, title, body, website: fd.get("website"), ms: Date.now() - shown.current });
    if (!r.ok) return setState({ status: "error", message: r.error });
    if (r.held || !r.thread) return setState({ status: "held" });
    savePending(r.thread);
    onDone(r.thread);
  }

  if (state.status === "held")
    return (
      <div className="fm-card fm-compose" role="status">
        <p className="fm-strong">Thanks! Your thread is waiting for a quick check before it appears.</p>
        <p className="fm-muted">Posts with links to other sites, or some words, are read by a person first.</p>
        <button type="button" className="fm-btn fm-btn-ghost" onClick={() => onDone(null)}>
          Back to the forum
        </button>
      </div>
    );

  return (
    <form className="fm-card fm-compose" onSubmit={submit} aria-label="Start a thread">
      <div className="fm-compose-head">
        <h2 className="fm-h2">Start a thread</h2>
        <button type="button" className="fm-link" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div className="fm-row">
        <NameField name={name} setName={setName} />
        <label className="fm-field">
          <span>Topic</span>
          <select value={cat} onChange={(e) => setCat(e.target.value)} name="category">
            {site.categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="fm-field">
        <span>Title</span>
        <input ref={titleRef} name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LIMITS.title.max} minLength={LIMITS.title.min} required placeholder="What do you want to talk about?" />
      </label>
      <label className="fm-field">
        <span>Post</span>
        <textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={LIMITS.body.max} required rows={6} placeholder="Share a price you spotted, ask a question, or start a conversation." />
        <small className="fm-count">
          {body.length}/{LIMITS.body.max}
        </small>
      </label>
      <Honeypot />
      <Note />
      {state.status === "error" && (
        <p role="alert" className="fm-error">
          {state.message}
        </p>
      )}
      <div className="fm-actions">
        <button type="submit" className="fm-btn" disabled={state.status === "sending"}>
          {state.status === "sending" ? "Posting…" : "Post thread"}
        </button>
      </div>
    </form>
  );
}

function Reply({ thread, onDone }: { thread: ForumThread; onDone: (t: ForumThread) => void }) {
  const [name, setName] = useName();
  const [body, setBody] = useState("");
  const [state, setState] = useState<Send>({ status: "idle" });
  const shown = useRef(Date.now());

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setState({ status: "sending" });
    const r = await post({ kind: "reply", name, thread: thread.id, body, website: fd.get("website"), ms: Date.now() - shown.current });
    if (!r.ok) return setState({ status: "error", message: r.error });
    setBody("");
    shown.current = Date.now();
    if (r.held || !r.thread) return setState({ status: "held" });
    setState({ status: "idle" });
    savePending(r.thread);
    onDone(r.thread);
  }

  if (thread.locked) return <p className="fm-card fm-muted">This thread is closed to new replies.</p>;
  return (
    <form className="fm-card fm-compose" onSubmit={submit} aria-label="Reply">
      <h2 className="fm-h2">Add a reply</h2>
      <NameField name={name} setName={setName} />
      <label className="fm-field">
        <span>Reply</span>
        <textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={LIMITS.body.max} required rows={4} placeholder="Join the conversation" />
        <small className="fm-count">
          {body.length}/{LIMITS.body.max}
        </small>
      </label>
      <Honeypot />
      <Note />
      {state.status === "error" && (
        <p role="alert" className="fm-error">
          {state.message}
        </p>
      )}
      {state.status === "held" && (
        <p role="status" className="fm-strong">
          Thanks! Your reply is waiting for a quick check before it appears.
        </p>
      )}
      <div className="fm-actions">
        <button type="submit" className="fm-btn" disabled={state.status === "sending"}>
          {state.status === "sending" ? "Posting…" : "Post reply"}
        </button>
      </div>
    </form>
  );
}

function ReportPost({ thread, p }: { thread: string; p: ForumPost }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent" | string>("idle");
  async function send(reason: string) {
    setState("sending");
    const r = await post({ kind: "report", thread, post: p.id, reason });
    setState(r.ok ? "sent" : r.error);
  }
  if (state === "sent") return <span className="fm-meta">Reported. Thanks, we&rsquo;ll take a look.</span>;
  if (!open)
    return (
      <button type="button" className="fm-link fm-meta" onClick={() => setOpen(true)}>
        Report
      </button>
    );
  return (
    <span className="fm-report">
      <span className="fm-meta">Why?</span>
      {["Spam", "Rude or offensive", "Personal details", "Something else"].map((r) => (
        <button key={r} type="button" className="fm-chip" disabled={state === "sending"} onClick={() => send(r)}>
          {r}
        </button>
      ))}
      {state !== "idle" && state !== "sending" && <span className="fm-error">{state}</span>}
    </span>
  );
}

function ThreadView({ site, thread, now, onBack, onUpdate }: { site: ForumSiteProps; thread: ForumThread; now: number; onBack: (() => void) | null; onUpdate: (t: ForumThread) => void }) {
  const cat = catOf(site.categories, thread.category);
  const n = replyCount(thread);
  return (
    <div className="fm-thread">
      <nav className="fm-crumbs" aria-label="Breadcrumb">
        {onBack ? (
          <button type="button" className="fm-link" onClick={onBack}>
            ← Forum
          </button>
        ) : (
          <a href={site.base}>← Forum</a>
        )}
        {cat && <span className="fm-tag">{cat.name}</span>}
      </nav>
      <h1 className="fm-h1">{thread.title}</h1>
      <p className="fm-meta">
        {n === 0 ? "No replies yet" : `${n} ${n === 1 ? "reply" : "replies"}`} · started {ago(thread.at, now)}
      </p>
      <ol className="fm-posts">
        {thread.posts.map((p, i) => (
          <li key={p.id} id={`p-${p.id}`} className={`fm-card fm-post${i === 0 ? " fm-op" : ""}`}>
            {p.removed ? (
              <p className="fm-muted fm-removed">This post was removed.</p>
            ) : (
              <>
                <div className="fm-post-head">
                  <Avatar name={p.name} />
                  <span className="fm-name">{p.name}</span>
                  <time className="fm-meta" dateTime={p.at}>
                    {ago(p.at, now)}
                  </time>
                </div>
                <Body text={p.body} />
                <div className="fm-post-foot">
                  <ReportPost thread={thread.id} p={p} />
                </div>
              </>
            )}
          </li>
        ))}
      </ol>
      {n === 0 && <p className="fm-muted fm-first">Be the first to reply.</p>}
      <Reply thread={thread} onDone={onUpdate} />
    </div>
  );
}

function ThreadRow({ site, t, now, onOpen, known }: { site: ForumSiteProps; t: ForumThread; now: number; onOpen: (id: string) => void; known: boolean }) {
  const cat = catOf(site.categories, t.category);
  const n = replyCount(t);
  const op = t.posts[0]!;
  const href = known ? threadPath(site, t) : `${site.base}#t=${t.id}`;
  return (
    <li className="fm-row-item">
      <a
        className="fm-card fm-thread-row"
        href={href}
        onClick={(e) => {
          if (known) return;
          e.preventDefault();
          onOpen(t.id);
        }}
      >
        <Avatar name={op.name} />
        <span className="fm-thread-main">
          <span className="fm-thread-title">{t.title}</span>
          <span className="fm-snippet">{op.body.slice(0, 140)}</span>
          <span className="fm-meta">
            {cat && <span className="fm-tag">{cat.name}</span>} {op.name} · {ago(t.last, now)}
          </span>
        </span>
        <span className={`fm-count-pill${n ? "" : " fm-zero"}`} aria-label={`${n} replies`}>
          <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
            <path fill="currentColor" d="M3 4.5A2.5 2.5 0 0 1 5.5 2h9A2.5 2.5 0 0 1 17 4.5v7a2.5 2.5 0 0 1-2.5 2.5H9l-4 3.5V14h0a2.5 2.5 0 0 1-2-2.5z" />
          </svg>
          {n}
        </span>
      </a>
    </li>
  );
}

function Rules({ site }: { site: ForumSiteProps }) {
  return (
    <section id="forum-rules" className="fm-card fm-side">
      <h2 className="fm-h3">Forum rules</h2>
      <ul className="fm-rules">
        <li>Be kind. No insults, slurs or harassment.</li>
        <li>No spam or self-promotion. Links to other sites wait for a check first.</li>
        <li>No personal details: emails, phone numbers and addresses are blanked.</li>
        <li>Buying, selling and trading happen at your own risk; {site.siteName} isn&rsquo;t part of any deal.</li>
        <li>Names aren&rsquo;t verified, and posts may be removed. Use Report on any post that breaks a rule.</li>
      </ul>
    </section>
  );
}

export function ForumApp({ site, initial, threadId = null, now: serverNow }: { site: ForumSiteProps; initial: ForumFile; threadId?: string | null; now: number }) {
  const [data, setData] = useState<ForumFile>(initial);
  const [loaded, setLoaded] = useState(false);
  const [cat, setCat] = useState<string>("");
  const [hashThread, setHashThread] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const now = useNow(serverNow);
  const knownIds = useMemo(() => new Set(initial.threads.map((t) => t.id)), [initial]);

  useEffect(() => {
    let live = true;
    fetchFresh(site.repo).then((fresh) => {
      if (!live) return;
      setData(merge(fresh ?? initial, readPending()));
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [site.repo, initial]);

  useEffect(() => {
    const read = () => {
      const m = /^#t=([a-z0-9]{8})$/.exec(location.hash);
      setHashThread(m ? m[1]! : null);
      const c = /^#c=([a-z0-9-]+)$/.exec(location.hash);
      if (c) setCat(c[1]!);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const update = useCallback((t: ForumThread) => {
    setData((d) => merge(d, [t]));
  }, []);

  const openId = threadId ?? hashThread;
  const threads = visibleThreads(data);

  if (openId) {
    const t = findThread(data, openId);
    return (
      <div className="fm">
        <div className="fm-grid">
          <main className="fm-main">
            {t ? (
              <ThreadView
                site={site}
                thread={t}
                now={now}
                onBack={
                  threadId
                    ? null
                    : () => {
                        history.pushState(null, "", site.base);
                        setHashThread(null);
                      }
                }
                onUpdate={update}
              />
            ) : loaded ? (
              <div className="fm-card">
                <h1 className="fm-h2">That thread isn&rsquo;t here</h1>
                <p className="fm-muted">It may have been removed, or it was posted a moment ago and is still on its way.</p>
                <a className="fm-btn" href={site.base}>
                  Back to the forum
                </a>
              </div>
            ) : (
              <p className="fm-muted">Loading the thread…</p>
            )}
          </main>
          <aside className="fm-aside">
            <Rules site={site} />
          </aside>
        </div>
      </div>
    );
  }

  const shown = cat ? threads.filter((t) => t.category === cat) : threads;
  const counts = new Map<string, number>();
  for (const t of threads) counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
  const activeCat = catOf(site.categories, cat);

  return (
    <div className="fm">
      <header className="fm-hero">
        <div>
          <p className="fm-kicker">
            Community <span className="fm-beta">Beta</span>
          </p>
          <h1 className="fm-h1">{site.siteName} forum</h1>
          <p className="fm-lede">{site.intro} No account needed: just pick a name.</p>
        </div>
        {!composing && (
          <button type="button" className="fm-btn fm-btn-lg" onClick={() => setComposing(true)}>
            Start a thread
          </button>
        )}
      </header>

      <div className="fm-chips" role="tablist" aria-label="Topics">
        <button type="button" role="tab" aria-selected={!cat} className={`fm-chip${!cat ? " fm-on" : ""}`} onClick={() => setCat("")}>
          All topics
        </button>
        {site.categories.map((c) => (
          <button key={c.key} type="button" role="tab" aria-selected={cat === c.key} className={`fm-chip${cat === c.key ? " fm-on" : ""}`} onClick={() => setCat(c.key)}>
            {c.name}
            {counts.get(c.key) ? <span className="fm-chip-n">{counts.get(c.key)}</span> : null}
          </button>
        ))}
      </div>

      <div className="fm-grid">
        <main className="fm-main">
          {composing && (
            <NewThread
              site={site}
              initialCategory={cat}
              onCancel={() => setComposing(false)}
              onDone={(t) => {
                setComposing(false);
                if (!t) return;
                update(t);
                history.pushState(null, "", `${site.base}#t=${t.id}`);
                setHashThread(t.id);
                window.scrollTo({ top: 0 });
              }}
            />
          )}
          {activeCat && <p className="fm-cat-blurb">{activeCat.blurb}</p>}
          {shown.length > 0 ? (
            <ol className="fm-list">
              {shown.map((t) => (
                <ThreadRow
                  key={t.id}
                  site={site}
                  t={t}
                  now={now}
                  known={knownIds.has(t.id)}
                  onOpen={(id) => {
                    history.pushState(null, "", `${site.base}#t=${id}`);
                    setHashThread(id);
                    window.scrollTo({ top: 0 });
                  }}
                />
              ))}
            </ol>
          ) : (
            <div className="fm-topics">
              {(activeCat ? [activeCat] : site.categories).map((c) => (
                <section key={c.key} className="fm-card fm-topic">
                  <h2 className="fm-h3">{c.name}</h2>
                  <p className="fm-muted">{c.blurb}</p>
                  {c.prompts?.length ? (
                    <ul className="fm-prompts">
                      {c.prompts.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  ) : null}
                  <button
                    type="button"
                    className="fm-btn fm-btn-ghost"
                    onClick={() => {
                      setCat(c.key);
                      setComposing(true);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Start the first thread
                  </button>
                </section>
              ))}
            </div>
          )}
        </main>
        <aside className="fm-aside">
          <section className="fm-card fm-side">
            <h2 className="fm-h3">How it works</h2>
            <p className="fm-muted">Type a name and post. Your name stays on this device, so you don&rsquo;t need an account. New replies show up within a few minutes.</p>
          </section>
          <Rules site={site} />
        </aside>
      </div>
    </div>
  );
}
