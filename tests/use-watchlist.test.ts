// The shared watchlist store (src/lib/use-watchlist.ts), driven outside React
// with a stubbed fetch, a cookie and a localStorage shim. Both branches: the
// signed-out localStorage list (OP Compare's no-account hearts) and the
// signed-in account list (RiftCompare's optimistic store over
// /api/alerts/watchlist).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// Static imports are safe before the shims below: both modules touch
// document/window/fetch only when called, never at load.
import { watchlistStore, invalidateWatchlist, isWatched, watchCount, LOCAL_WATCHLIST_KEY, LOCAL_WATCHLIST_MAX } from "../src/lib/use-watchlist";
import { invalidateMe } from "../src/lib/use-me";

// ── Browser shims ────────────────────────────────────────────────────────────
const store = new Map<string, string>();
const events: string[] = [];
const listeners = new Map<string, Set<() => void>>();
const g = globalThis as unknown as Record<string, unknown>;
g.document = { cookie: "" };
g.window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
  addEventListener: (t: string, fn: () => void) => {
    if (!listeners.has(t)) listeners.set(t, new Set());
    listeners.get(t)!.add(fn);
  },
  removeEventListener: (t: string, fn: () => void) => listeners.get(t)?.delete(fn),
  dispatchEvent: (e: { type: string }) => {
    events.push(e.type);
    for (const fn of listeners.get(e.type) ?? []) fn();
    return true;
  },
};

type Call = { url: string; method: string; body?: unknown };
let calls: Call[] = [];
let respond: (c: Call) => { status: number; body?: unknown } = () => ({ status: 404 });
let mergeStatus = 200;
g.fetch = async (url: string, init?: { method?: string; body?: string }) => {
  const c: Call = { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : undefined };
  calls.push(c);
  const r = respond(c);
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body ?? {} } as Response;
};


const luffy = { id: 101, slug: "monkey-d-luffy-op01-024", name: "Monkey.D.Luffy" };
const zoro = { id: 202, slug: "roronoa-zoro-op01-025", name: "Roronoa Zoro" };
const local = () => JSON.parse(store.get(LOCAL_WATCHLIST_KEY) ?? "[]") as { slug: string; kind: string; name: string; added: string; id?: number }[];

function signedOut() {
  (g.document as { cookie: string }).cookie = "";
  invalidateMe();
  invalidateWatchlist();
  calls = [];
}
function signedIn(tier: "plus" | "premium" | null, ids: number[], opts: { keepLocal?: boolean } = {}) {
  // No signed-out list unless a test asks for one: otherwise the first load
  // merges it (the member track's merge hook) before the ids request.
  if (!opts.keepLocal) store.delete(LOCAL_WATCHLIST_KEY);
  (g.document as { cookie: string }).cookie = "oc_auth=1";
  invalidateMe();
  invalidateWatchlist();
  calls = [];
  const held = new Set(ids);
  respond = (c) => {
    if (c.url === "/api/me") return { status: 200, body: { user: { name: "T", email: "t@x.com", avatar: null }, tier } };
    if (c.url === "/api/alerts/watchlist?ids=1") return { status: 200, body: { items: [...held].map((cardId) => ({ cardId })) } };
    if (c.url === "/api/alerts/watchlist" && c.method === "POST") {
      const id = (c.body as { cardId: number }).cardId;
      if (!tier && !held.has(id) && held.size >= 10) return { status: 402, body: { error: "limit", code: "free_limit", kind: "watchlist", limit: 10, count: held.size } };
      held.add(id);
      return { status: 200, body: { ok: true } };
    }
    if (c.url === "/api/alerts/watchlist/merge" && c.method === "POST") {
      for (const it of (c.body as { items: { id?: number }[] }).items) if (typeof it.id === "number") held.add(it.id);
      return mergeStatus === 200 ? { status: 200, body: { ok: true } } : { status: mergeStatus };
    }
    if (c.url.startsWith("/api/alerts/watchlist/") && c.method === "DELETE") return held.delete(Number(c.url.split("/").pop())) ? { status: 200 } : { status: 404 };
    return { status: 404 };
  };
}

test("signed out: no request at all; the watched set is the local card items, sealed counted in the header total", async () => {
  store.set(
    LOCAL_WATCHLIST_KEY,
    JSON.stringify([
      { slug: luffy.slug, kind: "card", name: luffy.name, added: "2026-10-01T00:00:00Z" }, // an older item: no id
      { slug: "op-01-booster-box", kind: "sealed", name: "OP-01 Booster Box", added: "2026-10-01T00:00:00Z" },
    ]),
  );
  signedOut();
  const s = await watchlistStore.load();
  assert.equal(s.mode, "local");
  assert.deepEqual(calls, [], "an anonymous visitor makes no request");
  assert.equal(s.count, 2, "the header counts cards and sealed");
  assert.equal(watchCount(), 2);
  assert.ok(isWatched(s, luffy), "an id-less item still matches by slug");
  assert.ok(!isWatched(s, zoro));
});

test("signed out: watch and unwatch write op:watchlist (WatchButton's format) and publish", async () => {
  signedOut();
  await watchlistStore.load();
  const seen: number[] = [];
  const off = watchlistStore.subscribe((s) => seen.push(s?.count ?? -1));
  events.length = 0;
  assert.equal(await watchlistStore.watch(zoro, "US"), true);
  const first = local()[0];
  assert.deepEqual(first, { slug: zoro.slug, kind: "card", name: zoro.name, added: first.added, id: zoro.id });
  assert.ok(!Number.isNaN(Date.parse(first.added)));
  assert.ok(events.includes("op:watchlist"), "other hearts on the page hear it");
  assert.ok(isWatched(watchlistStore.get(), zoro));
  // Watching twice does not duplicate.
  await watchlistStore.watch(zoro, "US");
  assert.equal(local().filter((i) => i.slug === zoro.slug).length, 1);
  assert.equal(await watchlistStore.unwatch(luffy), true);
  assert.ok(!local().some((i) => i.slug === luffy.slug));
  assert.ok(local().some((i) => i.kind === "sealed"), "sealed items are never touched by a card unwatch");
  assert.deepEqual(calls, []);
  off();
  assert.ok(seen.length >= 3);
});

test("signed out: a write from WatchButton (the op:watchlist event) refreshes the store", async () => {
  signedOut();
  await watchlistStore.load();
  store.set(LOCAL_WATCHLIST_KEY, JSON.stringify([]));
  (g.window as { dispatchEvent: (e: { type: string }) => void }).dispatchEvent({ type: "op:watchlist" });
  assert.equal(watchlistStore.get()?.count, 0);
});

test("signed out: the list is capped at the newest 200", async () => {
  store.set(LOCAL_WATCHLIST_KEY, JSON.stringify(Array.from({ length: LOCAL_WATCHLIST_MAX }, (_, i) => ({ slug: `c${i}`, kind: "card", name: `C${i}`, added: "x" }))));
  signedOut();
  await watchlistStore.watch(luffy, "US");
  assert.equal(local().length, LOCAL_WATCHLIST_MAX);
  assert.equal(local()[0].slug, luffy.slug, "newest first");
});

test("signed in: one ids-only request, then optimistic watch with the server's answer", async () => {
  signedIn("plus", [1, 2]);
  const s = await watchlistStore.load();
  assert.equal(s.mode, "account");
  assert.deepEqual([...s.ids].sort(), [1, 2]);
  assert.deepEqual(calls.map((c) => c.url), ["/api/me", "/api/alerts/watchlist?ids=1"]);
  const order: string[] = [];
  const off = watchlistStore.subscribe((x) => order.push(`publish:${x?.ids.has(luffy.id)}`));
  const p = watchlistStore.watch(luffy, "UK");
  const done = await p;
  off();
  assert.equal(done, true);
  assert.equal(order[0], "publish:true", "the heart flips before the request resolves");
  const post = calls.find((c) => c.method === "POST")!;
  assert.deepEqual(post.body, { cardId: luffy.id, market: "UK" });
  assert.ok(watchlistStore.get()!.ids.has(luffy.id));
  assert.deepEqual(local().some((i) => i.slug === "never"), false, "the account branch never writes localStorage");
});

test("signed in: a failed watch rolls back to the pre-click snapshot", async () => {
  signedIn("premium", [1]);
  await watchlistStore.load();
  const base = respond;
  respond = (c) => (c.method === "POST" ? { status: 500 } : base(c));
  assert.equal(await watchlistStore.watch(zoro, "US"), false);
  assert.deepEqual([...watchlistStore.get()!.ids], [1]);
});

test("signed in, free, at the limit: no optimistic flip; the route's 402 reaches onLimit", async () => {
  signedIn(null, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  await watchlistStore.load();
  const published: boolean[] = [];
  const off = watchlistStore.subscribe((x) => published.push(!!x?.ids.has(zoro.id)));
  let limit: unknown = null;
  assert.equal(await watchlistStore.watch(zoro, "US", { onLimit: (l) => (limit = l) }), false);
  off();
  assert.ok(!published.includes(true), "the heart never flipped");
  assert.deepEqual(limit, { error: "limit", code: "free_limit", kind: "watchlist", limit: 10, count: 10 });
  // A card already watched is always allowed (grandfathering).
  assert.equal(await watchlistStore.watch({ ...zoro, id: 5 }, "US"), true);
});

test("signed in: unwatch is optimistic, a 404 counts as success, a failure rolls back", async () => {
  signedIn("plus", [1, 2]);
  await watchlistStore.load();
  assert.equal(await watchlistStore.unwatch({ id: 2 }), true);
  assert.deepEqual([...watchlistStore.get()!.ids], [1]);
  assert.equal(await watchlistStore.unwatch({ id: 99 }), true, "already gone");
  const base = respond;
  respond = (c) => (c.method === "DELETE" ? { status: 500 } : base(c));
  assert.equal(await watchlistStore.unwatch({ id: 1 }), false);
  assert.deepEqual([...watchlistStore.get()!.ids], [1]);
});

test("signed in before the member routes exist: a 404 list is an empty set, not an error", async () => {
  (g.document as { cookie: string }).cookie = "oc_auth=1";
  invalidateMe();
  invalidateWatchlist();
  respond = (c) => (c.url === "/api/me" ? { status: 200, body: { user: { name: "T", email: "t@x.com", avatar: null }, tier: null } } : { status: 404 });
  const s = await watchlistStore.load();
  assert.equal(s.mode, "account");
  assert.equal(s.ids.size, 0);
});

test("the local key is WatchButton's, and the module keeps RiftCompare's optimistic shape", () => {
  const button = readFileSync(join(process.cwd(), "src/components/WatchButton.tsx"), "utf8");
  assert.match(button, /WATCH_KEY = LOCAL_WATCHLIST_KEY/);
  assert.equal(LOCAL_WATCHLIST_KEY, "op:watchlist");
  const src = readFileSync(join(process.cwd(), "src/lib/use-watchlist.ts"), "utf8");
  assert.match(src, /export function useWatchlist\(\)/);
  assert.match(src, /export function useWatchedIds\(\)/);
  assert.match(src, /export function watchCount\(\)/);
  assert.match(src, /export function invalidateWatchlist\(\)/);
  assert.match(src, /\/api\/alerts\/watchlist\?ids=1/);
  assert.match(src, /publish\(\);\s*\n\s*trackEvent\("watch_add"/, "watch_add fires right after the optimistic publish()");
  assert.match(src, /publish\(\);\s*\n\s*trackEvent\("watch_remove"/, "watch_remove fires right after the optimistic publish()");
});

test("a subscribed store follows invalidateMe(): signing in swaps the local list for the account list without a reload", async () => {
  signedIn(null, [luffy.id]); // installs the account responder
  (g.document as { cookie: string }).cookie = ""; // …but start signed out
  invalidateMe();
  invalidateWatchlist();
  const seen: (string | null)[] = [];
  const off = watchlistStore.subscribe((s) => seen.push(s ? s.mode : null));
  await watchlistStore.load();
  assert.equal(watchlistStore.get()?.mode, "local");
  // Sign in: only the cookie and invalidateMe() (what the login flow does). The
  // store hears oc:me, drops its state and, with a subscriber, loads again.
  (g.document as { cookie: string }).cookie = "oc_auth=1";
  invalidateMe();
  await new Promise((r) => setTimeout(r, 20));
  const s = watchlistStore.get();
  assert.equal(s?.mode, "account");
  assert.ok(s?.ids.has(luffy.id));
  assert.deepEqual(seen.slice(-2), [null, "account"]);
  off();
  signedOut();
});

// ── The merge on first sign-in (member track, wave 2) ────────────────────────

test("first signed-in load: local CARD items are merged before the ids request, then leave localStorage; sealed stay", async () => {
  store.set(
    LOCAL_WATCHLIST_KEY,
    JSON.stringify([
      { slug: luffy.slug, kind: "card", name: luffy.name, added: "x", id: luffy.id },
      { slug: zoro.slug, kind: "card", name: zoro.name, added: "x" }, // an older item: slug only
      { slug: "op-01-booster-box", kind: "sealed", name: "OP-01 Booster Box", added: "x" },
    ]),
  );
  mergeStatus = 200;
  signedIn(null, [], { keepLocal: true });
  (g.document as { cookie: string }).cookie = "oc_auth=1; country=AU";
  const s = await watchlistStore.load();
  assert.deepEqual(
    calls.map((c) => c.url),
    ["/api/me", "/api/alerts/watchlist/merge", "/api/alerts/watchlist?ids=1"],
    "merge first, so the ids request already includes the merged cards",
  );
  const merge = calls.find((c) => c.url === "/api/alerts/watchlist/merge")!;
  assert.deepEqual(merge.body, {
    items: [
      { slug: luffy.slug, id: luffy.id },
      { slug: zoro.slug },
    ],
    market: "AU",
  });
  assert.ok(s.ids.has(luffy.id), "the merged card is watched on the account");
  assert.deepEqual(
    local().map((i) => i.kind),
    ["sealed"],
    "card items leave localStorage; the sealed item stays (sealed watches are Plus)",
  );
  assert.equal(store.get("op:watchlist-merged"), undefined, "no userId in this /api/me answer, so no marker");
});

test("a failed merge leaves the local list intact for the next load", async () => {
  store.set(LOCAL_WATCHLIST_KEY, JSON.stringify([{ slug: luffy.slug, kind: "card", name: luffy.name, added: "x", id: luffy.id }]));
  mergeStatus = 503;
  signedIn(null, [], { keepLocal: true });
  await watchlistStore.load();
  assert.equal(local().length, 1, "nothing is lost when the merge fails");
  mergeStatus = 200;
});

test("nothing local: no merge request at all", async () => {
  signedIn("plus", [1]);
  await watchlistStore.load();
  assert.ok(!calls.some((c) => c.url.endsWith("/merge")));
});
