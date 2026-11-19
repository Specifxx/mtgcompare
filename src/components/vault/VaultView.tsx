"use client";

// /collection: the visitor's collection (src/lib/vault.ts), valued from this site's static /prices.json. One total per
// market (prices are never converted), the change since the items were added, the change since the last look, and a
// share line with the real totals.
import { useEffect, useMemo, useState } from "react";
import {
  cardSets,
  formatMoney,
  isCardItem,
  withCardPrices,
  itemKey,
  lastLook,
  onVaultChange,
  pctChange,
  readDays,
  readVault,
  collectionCsv,
  recordDay,
  setItemQty,
  shareText,
  sinceAdded,
  totalsByMarket,
  valueItems,
  writeDays,
  writeVault,
  type DayTotal,
  type MarketTotal,
  type PriceFile,
  type VaultItem,
} from "@/lib/vault";
import { track as trackShare } from "@/lib/track";
import { VAULT_SITE } from "./vault-config";
import { cardLink, cardModel, drawCard, saveBlob } from "./collection-card";
import { usePremium } from "@/components/premium/usePremium";
import { CheckupOffer } from "./CheckupOffer";
import { MEMBER_HISTORY_DAYS } from "@/lib/premium-member";

function Change({ from, to, currency, label }: { from: number; to: number; currency: string; label: string }) {
  const pct = pctChange(from, to);
  const diff = to - from;
  if (pct == null) return null;
  const cls = diff > 0 ? "is-up" : diff < 0 ? "is-down" : "";
  return (
    <span className={`ce-vault-change ${cls}`}>
      {diff > 0 ? "▲" : diff < 0 ? "▼" : "•"} {formatMoney(Math.abs(diff), currency)} ({pct > 0 ? "+" : ""}
      {pct}%) {label}
    </span>
  );
}

function Spark({ days, market }: { days: DayTotal[]; market: string }) {
  const pts = days.filter((x) => x.m === market);
  if (pts.length < 2) return <p className="ce-vault-muted">Your value history builds one point a day, each day you open this page. Come back tomorrow.</p>;
  const lo = Math.min(...pts.map((p) => p.c));
  const hi = Math.max(...pts.map((p) => p.c));
  const span = hi - lo || 1;
  const d = pts.map((p, n) => `${n ? "L" : "M"}${((n / (pts.length - 1)) * 300).toFixed(1)} ${(46 - ((p.c - lo) / span) * 40).toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 300 52" role="img" aria-label={`Collection value, ${pts.length} days`} className="mt-2 h-14 w-full max-w-md" preserveAspectRatio="none">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Signed out: what the collection does, and the way in. */
function CollectionSignIn() {
  return (
    <div className="ce-vault-empty">
      <p>
        <strong>Sign in to start your collection.</strong> Add every card and box you own with <em>I own this</em>, and see what it is worth
        today and how much it has moved since you added it.
      </p>
      <p className="ce-vault-muted">A free account, no password: Google or an emailed link. Premium adds a year of value history and a spreadsheet export, 14 days free.</p>
      <a className="ce-vault-btn" href="/account?next=/collection">
        Sign in or create a free account
      </a>
    </div>
  );
}

export function VaultView() {
  const premium = usePremium();
  const member = premium.status === "member";
  const [items, setItems] = useState<VaultItem[] | null>(null);
  const [file, setFile] = useState<PriceFile | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const sync = () => setItems(readVault());
    sync();
    const get = (u: string) => fetch(u, { credentials: "omit" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
    // Sealed from /prices.json; single cards from their sets' TCGplayer prices (CDN-cached, no eBay, no database).
    Promise.all([get("/prices.json") as Promise<PriceFile>, Promise.all(cardSets(readVault()).map((s) => get(`/api/cards/prices/${s}`).catch(() => ({}))))])
      .then(([j, sets]) => setFile(withCardPrices(j, sets)))
      .catch(() => setFailed(true));
    return onVaultChange(sync);
  }, []);

  const valued = useMemo(() => (items ? valueItems(items, file) : []), [items, file]);
  const totals = useMemo(() => totalsByMarket(valued), [valued]);

  // The previous look, read once before today's totals are recorded over it.
  const [prevDays] = useState<DayTotal[]>(() => (typeof window === "undefined" ? [] : readDays()));
  useEffect(() => {
    if (!file || !totals.length) return;
    let next = readDays();
    for (const t of totals) if (t.nowCents > 0) next = recordDay(next, t.market, t.nowCents, new Date(), member ? MEMBER_HISTORY_DAYS : undefined);
    writeDays(next);
    // once per load of the price file
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, member]);

  // My collection needs an account (owner, 2026-11-19: "you can only use my collection if you are signed in"). The list itself still
  // lives in this browser; signing in is what opens it.
  if (premium.status === "loading" || items == null) return <p className="ce-vault-muted">Loading your collection…</p>;
  if (premium.status === "out") return <CollectionSignIn />;
  if (!items.length)
    return (
      <div className="ce-vault-empty">
        <p>
          <strong>Your collection is empty.</strong> Open any product or card and tap <em>I own this</em>. This page then shows what everything is worth at
          today&apos;s prices, and how much it has moved since you added it.
        </p>
        <p className="ce-vault-muted">It stays in this browser: no account, no sign-up, nothing sent to us.</p>
        <a className="ce-vault-btn" href="/">
          Find a product
        </a>
      </div>
    );

  // The collection value card (collection-card.ts): a picture of these totals drawn in this browser, shared as a file
  // where the phone can, else saved, with the tracked link copied. Counted only when it really went out.
  const share = async (t: MarketTotal, since: { from: number; to: number } | null) => {
    const url = cardLink(location.origin);
    const text = `${shareText(VAULT_SITE.name, VAULT_SITE.what, t, since)} ${url}`;
    const pct = since ? pctChange(since.from, since.to) : null;
    const top = valued
      .filter((i) => i.market === t.market && i.nowCents != null)
      .sort((a, b) => (b.nowCents ?? 0) * b.qty - (a.nowCents ?? 0) * a.qty)
      .slice(0, 3)
      .map((i) => ({ name: i.qty > 1 ? `${i.qty} × ${i.name}` : i.name, price: formatMoney((i.nowCents ?? 0) * i.qty, i.currency) }));
    const blob = await drawCard(
      cardModel({
        site: VAULT_SITE.name,
        what: VAULT_SITE.what,
        host: location.host.replace(/^www\./, ""),
        total: formatMoney(t.nowCents, t.currency),
        change: since && pct ? { up: since.to > since.from, text: `${formatMoney(Math.abs(since.to - since.from), t.currency)} (${pct > 0 ? "+" : ""}${pct}%) since I added them` } : null,
        units: t.units,
        market: t.market,
        top,
        date: new Date(),
      }),
    );
    const file = blob ? new File([blob], "my-collection.png", { type: "image/png" }) : null;
    try {
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
        trackShare("share", { kind: "collection", how: "image" });
        return;
      }
      if (navigator.share) {
        await navigator.share({ text });
        trackShare("share", { kind: "collection", how: "text" });
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
    }
    if (file) saveBlob(file, `my-collection-${new Date().toISOString().slice(0, 10)}.png`);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* the saved picture still carries the address */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 3500);
    trackShare("share", { kind: "collection", how: file ? "saved" : "copy" });
  };

  return (
    <div className="ce-vault">
      {failed && <p className="ce-vault-muted">Today&apos;s prices didn&apos;t load. Your list is safe; try again in a moment.</p>}
      {file &&
        totals.map((t) => {
          const since = sinceAdded(valued, t.market);
          const prev = lastLook(prevDays, t.market);
          return (
            <section key={t.market} className="ce-vault-total" aria-label={`Collection value in ${t.market}`}>
              <div className="ce-vault-label">
                Worth today · {t.market} prices, {t.currency}
              </div>
              <div className="ce-vault-big tabular">{formatMoney(t.nowCents, t.currency)}</div>
              <div className="ce-vault-moves">
                {since && <Change from={since.from} to={since.to} currency={t.currency} label="since you added them" />}
                {prev && <Change from={prev.c} to={t.nowCents} currency={t.currency} label={`since ${new Date(`${prev.d}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`} />}
              </div>
              <div className="ce-vault-muted">
                {t.units === 1 ? "1 item" : `${t.units} items`}
                {t.unpriced ? ` · ${t.unpriced} not in stock anywhere today, so not counted` : ""}
              </div>
              {member ? <Spark days={readDays()} market={t.market} /> : (
                <p className="ce-vault-muted">
                  <a href="/premium">Premium</a> keeps a year of value history and exports your collection to a spreadsheet.
                </p>
              )}
              <button type="button" className="ce-vault-btn" onClick={() => share(t, since)}>
                {copied ? "Picture saved, link copied" : "Share my collection"}
              </button>
            </section>
          );
        })}
      {member && (
        <button
          type="button"
          className="ce-vault-btn"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([collectionCsv(valued)], { type: "text/csv;charset=utf-8" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = `${VAULT_SITE.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-collection-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Export to spreadsheet (CSV)
        </button>
      )}
      {file && <CheckupOffer items={valued} email={premium.status === "member" || premium.status === "free" ? premium.info.who : null} />}
      <ul className="ce-vault-list">
        {valued.map((i) => {
          const key = itemKey(i);
          return (
            <li key={key} className="ce-vault-row">
              {i.image ? <img src={i.image} alt={i.name} width={56} height={56} loading="lazy" decoding="async" /> : <span className="ce-vault-ph" aria-hidden="true" />}
              <div className="ce-vault-name">
                <a href={i.href}>{i.name}</a>
                <div className="ce-vault-muted">
                  {i.market}
                  {i.addedCents > 0 ? ` · ${formatMoney(i.addedCents, i.currency)} when added` : ""}
                </div>
              </div>
              <div className="ce-vault-price tabular">
                {i.nowCents != null ? formatMoney(i.nowCents * i.qty, i.currency) : <span className="ce-vault-muted">{file ? (isCardItem(i) ? "No recent sale" : "Not in stock") : "…"}</span>}
                {i.nowCents != null && i.addedCents > 0 && <Change from={i.addedCents * i.qty} to={i.nowCents * i.qty} currency={i.currency} label="" />}
              </div>
              <span className="ce-vault-qty" aria-label={`How many ${i.name} you own`}>
                <button type="button" onClick={() => writeVault(setItemQty(readVault(), key, i.qty - 1))} aria-label="One fewer">
                  −
                </button>
                <span className="tabular">{i.qty}</span>
                <button type="button" onClick={() => writeVault(setItemQty(readVault(), key, i.qty + 1))} aria-label="One more">
                  +
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="ce-vault-muted">
        Sealed products are valued at the cheapest in-stock store price in their region today, the price you would pay to buy them again. Single
        cards are valued at TCGplayer&apos;s market price (recent sales, US$) for the finish you own. Neither is what a buyer would pay you. Prices
        are never converted between currencies.
      </p>
    </div>
  );
}
