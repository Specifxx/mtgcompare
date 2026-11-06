"use client";

// STORE THUMBS UP / DOWN (owner, 2026-11-06: "a very tiny area where you can
// just … thumbs up a store or thumbs down a store … public data … across all
// the sites you can now see that these stores are trusted"). The same file on
// every Compare Empire site; RiftCompare keeps the votes and serves ONE public
// tally for every site (riftcompare.com/api/store-votes, CDN six hours), so a
// shop listed on several sites shares its thumbs. RiftCompare's DECISIONS.md,
// "Store thumbs up and down, one tally for every site".
//
// • A store is its listing host without "www." (storeKey), never a name.
// • One vote per browser per store: a second click on the same thumb takes it
//   back, the other thumb changes it. The browser keeps a random id and its
//   own votes in localStorage; no account, no address, no pop-up.
// • Counts show only once a store has votes; "Trusted" only from
//   TRUSTED_MIN_UP thumbs up and TRUSTED_SHARE of the votes. Votes never order
//   prices, never hide a store and never decide "cheapest".
// • Nothing is fetched on the server or at build: the tally is read in the
//   browser after the page renders, once per page view (sessionStorage keeps it
//   an hour), so no page gains a function, a database read or a build step.

import { useEffect, useState, type CSSProperties, type MouseEvent } from "react";

export const STORE_VOTES_API = "https://riftcompare.com/api/store-votes";
export const TRUSTED_MIN_UP = 3;
export const TRUSTED_SHARE = 0.8;

type Tally = Record<string, [number, number]>;
type Mine = Record<string, { v: 1 | -1 | 0; at: number; p: 0 | 1 | -1 }>;

const HOST = /^(?=.{3,80}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
/** Marketplaces and networks are not one store: no thumbs for them (eBay, Amazon, TCGplayer, Cardmarket…). */
const NOT_A_STORE = /(?:^|\.)(?:ebay|amazon)\.[a-z.]+$|(?:^|\.)(?:tcgplayer|cardmarket|etsy|aliexpress|walmart|awin1|anrdoezrs|dpbolvw|jdoqocy|kqzyfj|tkqlhce|linksynergy|shareasale|rakuten)\.com$|(?:^|\.)(?:sjv|pxf)\.io$/;
const TALLY_KEY = "sv_tally";
const MINE_KEY = "sv_votes";
const VID_KEY = "sv_vid";
const CHANGE = "store-votes:change";

/** "https://www.Example.com/products/x" → "example.com"; null for anything else. */
export function storeKey(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    return HOST.test(host) && !NOT_A_STORE.test(host) ? host : null;
  } catch {
    return null;
  }
}

export function isTrusted(up: number, down: number): boolean {
  return up >= TRUSTED_MIN_UP && up / (up + down) >= TRUSTED_SHARE;
}

/** The counts to draw: the tally, plus this browser's own vote when the tally predates it. */
export function shown(t: [number, number] | undefined, mine: Mine[string] | undefined, tallyAt: number): [number, number] {
  let [up, down] = t ?? [0, 0];
  if (mine && mine.at > tallyAt) {
    if (mine.p === 1) up--;
    if (mine.p === -1) down--;
    if (mine.v === 1) up++;
    if (mine.v === -1) down++;
  }
  return [Math.max(0, up), Math.max(0, down)];
}

function read<T>(store: Storage | undefined, key: string): T | null {
  try {
    const raw = store?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(store: Storage | undefined, key: string, value: unknown) {
  try {
    store?.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: votes still send, nothing is remembered */
  }
}
const ls = () => (typeof window === "undefined" ? undefined : window.localStorage);
const ss = () => (typeof window === "undefined" ? undefined : window.sessionStorage);

let loading: Promise<{ at: number; stores: Tally }> | null = null;
function loadTally(): Promise<{ at: number; stores: Tally }> {
  if (loading) return loading;
  const cached = read<{ got: number; at: number; stores: Tally }>(ss(), TALLY_KEY);
  if (cached && Date.now() - cached.got < 60 * 60_000) return (loading = Promise.resolve(cached));
  loading = fetch(STORE_VOTES_API)
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { at?: string; stores?: Tally } | null) => {
      const value = { at: j?.at ? Date.parse(j.at) || 0 : 0, stores: j?.stores && typeof j.stores === "object" ? j.stores : {} };
      write(ss(), TALLY_KEY, { got: Date.now(), ...value });
      return value;
    })
    .catch(() => ({ at: 0, stores: {} }));
  return loading;
}

function browserId(): string {
  let id = read<string>(ls(), VID_KEY);
  if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    id = Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
    write(ls(), VID_KEY, id);
  }
  return id;
}

const UP = "M2 10h3v10H2zM7 20h9.3a2 2 0 0 0 2-1.6l1.6-7A2 2 0 0 0 18 9h-5V5a2 2 0 0 0-2-2l-4 7z";
const DOWN = "M2 4h3v10H2zM7 4h9.3a2 2 0 0 1 2 1.6l1.6 7A2 2 0 0 1 18 15h-5v4a2 2 0 0 1-2 2l-4-7z";

function Thumb({ d, on, color }: { d: string; on: boolean; color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 22 24" aria-hidden="true" style={{ display: "block" }}>
      <path d={d} fill={on ? color : "none"} stroke={on ? color : "currentColor"} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

const btn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 3,
  padding: "2px 4px",
  margin: 0,
  border: 0,
  borderRadius: 6,
  background: "transparent",
  color: "inherit",
  font: "inherit",
  fontSize: 11,
  lineHeight: 1,
  cursor: "pointer",
};

/**
 * The tiny thumbs for one store. `url` is any URL on the store's own site (a
 * listing or its home page, never an affiliate redirect); `name` is only for
 * the buttons' labels.
 */
export function StoreVote({ url, name, className }: { url: string | null | undefined; name?: string; className?: string }) {
  const key = storeKey(url);
  const [tally, setTally] = useState<{ at: number; stores: Tally } | null>(null);
  const [mine, setMine] = useState<Mine[string] | undefined>(undefined);
  const [thanks, setThanks] = useState(false);

  useEffect(() => {
    if (!key) return;
    let live = true;
    loadTally().then((t) => live && setTally(t));
    const sync = () => setMine(read<Mine>(ls(), MINE_KEY)?.[key]);
    sync();
    window.addEventListener(CHANGE, sync);
    window.addEventListener("storage", sync);
    return () => {
      live = false;
      window.removeEventListener(CHANGE, sync);
      window.removeEventListener("storage", sync);
    };
  }, [key]);

  if (!key) return null;
  const [up, down] = shown(tally?.stores[key], mine, tally?.at ?? 0);
  const trusted = isTrusted(up, down);
  const label = name || key;

  function vote(e: MouseEvent, v: 1 | -1) {
    e.preventDefault();
    e.stopPropagation();
    if (!key) return;
    const all = read<Mine>(ls(), MINE_KEY) ?? {};
    const prev = all[key];
    const tallyAt = tally?.at ?? 0;
    const next: 1 | -1 | 0 = prev?.v === v ? 0 : v;
    // The baseline the public tally already counts: the vote before this one,
    // unless that one was itself cast after the tally was read.
    const p: 0 | 1 | -1 = prev ? (prev.at > tallyAt ? prev.p : prev.v) : 0;
    if (next === 0 && p === 0) delete all[key];
    else all[key] = { v: next, at: Date.now(), p };
    write(ls(), MINE_KEY, all);
    window.dispatchEvent(new Event(CHANGE));
    setThanks(next !== 0);
    if (next !== 0) setTimeout(() => setThanks(false), 2500);
    fetch(STORE_VOTES_API, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ store: key, vote: next, vid: browserId() }),
      keepalive: true,
    }).catch(() => {});
  }

  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: 2, verticalAlign: "middle", whiteSpace: "nowrap", fontSize: 11, lineHeight: 1 }}
      data-store-vote={key}
    >
      {trusted && (
        <span
          title={`${up} of ${up + down} shoppers gave ${label} a thumbs up`}
          style={{ display: "inline-flex", alignItems: "center", gap: 2, marginRight: 2, color: "#15803d", fontWeight: 600 }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5z" fill="currentColor" />
            <path d="M8 12l3 3 5-6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Trusted
        </span>
      )}
      <button
        type="button"
        style={{ ...btn, opacity: mine?.v === 1 ? 1 : 0.6, color: mine?.v === 1 ? "#15803d" : "inherit" }}
        aria-pressed={mine?.v === 1}
        aria-label={`Thumbs up for ${label}${up ? ` (${up})` : ""}`}
        title={mine?.v === 1 ? "You gave this store a thumbs up (click to take it back)" : `Bought from ${label} and it went well? Thumbs up`}
        onClick={(e) => vote(e, 1)}
      >
        <Thumb d={UP} on={mine?.v === 1} color="#15803d" />
        {up > 0 && <span style={{ fontVariantNumeric: "tabular-nums" }}>{up}</span>}
      </button>
      <button
        type="button"
        style={{ ...btn, opacity: mine?.v === -1 ? 1 : 0.6, color: mine?.v === -1 ? "#b91c1c" : "inherit" }}
        aria-pressed={mine?.v === -1}
        aria-label={`Thumbs down for ${label}${down ? ` (${down})` : ""}`}
        title={mine?.v === -1 ? "You gave this store a thumbs down (click to take it back)" : `Problem with ${label} (fake, late, never arrived)? Thumbs down`}
        onClick={(e) => vote(e, -1)}
      >
        <Thumb d={DOWN} on={mine?.v === -1} color="#b91c1c" />
        {down > 0 && <span style={{ fontVariantNumeric: "tabular-nums" }}>{down}</span>}
      </button>
      {thanks && <span style={{ marginLeft: 2, opacity: 0.7 }} role="status">Thanks</span>}
    </span>
  );
}
