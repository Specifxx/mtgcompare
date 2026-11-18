"use client";

// /collection: the visitor's collection (src/lib/vault.ts), valued from this site's static /prices.json. One total per
// market (prices are never converted), the change since the items were added, the change since the last look, and a
// share line with the real totals.
import { useEffect, useMemo, useState } from "react";
import {
  formatMoney,
  itemKey,
  lastLook,
  onVaultChange,
  pctChange,
  readDays,
  readVault,
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

export function VaultView() {
  const [items, setItems] = useState<VaultItem[] | null>(null);
  const [file, setFile] = useState<PriceFile | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const sync = () => setItems(readVault());
    sync();
    fetch("/prices.json", { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: PriceFile) => setFile(j))
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
    for (const t of totals) if (t.nowCents > 0) next = recordDay(next, t.market, t.nowCents);
    writeDays(next);
    // once per load of the price file
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  if (items == null) return <p className="ce-vault-muted">Loading your collection…</p>;
  if (!items.length)
    return (
      <div className="ce-vault-empty">
        <p>
          <strong>Your collection is empty.</strong> Open any product and tap <em>I own this</em>. This page then shows what everything is worth at
          today&apos;s store prices, and how much it has moved since you added it.
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
                Worth today · {t.market} store prices, {t.currency}
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
              <button type="button" className="ce-vault-btn" onClick={() => share(t, since)}>
                {copied ? "Picture saved, link copied" : "Share my collection"}
              </button>
            </section>
          );
        })}
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
                {i.nowCents != null ? formatMoney(i.nowCents * i.qty, i.currency) : <span className="ce-vault-muted">{file ? "Not in stock" : "…"}</span>}
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
        Values are the cheapest in-stock store price in each item&apos;s region today, the price you would pay to buy it again. They are not what a
        buyer would pay you. Prices are never converted between currencies.
      </p>
    </div>
  );
}
