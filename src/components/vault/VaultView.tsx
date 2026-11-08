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
  track,
  valueItems,
  writeDays,
  writeVault,
  type DayTotal,
  type PriceFile,
  type VaultItem,
} from "@/lib/vault";
import { VAULT_SITE } from "./vault-config";

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

  const share = async (text: string) => {
    const url = `${location.origin}/?utm_source=share&utm_medium=collection`;
    track("share", { kind: "collection" });
    try {
      if (navigator.share) {
        await navigator.share({ text, url });
        return;
      }
    } catch {
      /* cancelled or refused: fall back to copying */
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* nothing more to try */
    }
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
              <button type="button" className="ce-vault-btn" onClick={() => share(shareText(VAULT_SITE.name, VAULT_SITE.what, t, since))}>
                {copied ? "Copied to share" : "Share my collection"}
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
