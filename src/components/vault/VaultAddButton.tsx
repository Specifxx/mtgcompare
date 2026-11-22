"use client";

// "I own this" on a product page (src/lib/vault.ts): adds the product to the visitor's collection in this browser,
// valued in the page's market. Nothing leaves the browser.
import { useEffect, useState } from "react";
import { usePremium } from "@/components/premium/usePremium";
import { addItem, itemKey, onVaultChange, readVault, setItemQty, track, writeVault, type VaultItem } from "@/lib/vault";

export function VaultAddButton({ className = "", ...item }: Omit<VaultItem, "qty" | "addedAt"> & { className?: string }) {
  const key = itemKey(item);
  const [qty, setQty] = useState(0);

  useEffect(() => {
    const sync = () => setQty(readVault().find((i) => itemKey(i) === key)?.qty ?? 0);
    sync();
    return onVaultChange(sync);
  }, [key]);

  const premium = usePremium();
  const add = () => {
    // My collection needs an account (owner, 2026-11-19): signed out, the tap goes to sign-in and comes back to this page.
    if (premium.status === "out") {
      track("vault_signin", {});
      location.href = `/account?src=own&next=${encodeURIComponent(location.pathname)}`;
      return;
    }
    writeVault(addItem(readVault(), item));
    track("vault_add", { market: item.market, value: item.addedCents / 100, currency: item.currency });
  };
  const change = (n: number) => writeVault(setItemQty(readVault(), key, n));

  if (!qty)
    return (
      <div className={`ce-vault-add ${className}`}>
        <button type="button" className="ce-vault-btn" onClick={add}>
          <span aria-hidden="true">+</span> I own this
        </button>
        <span className="ce-vault-hint">Track what your collection is worth. Free with an account.</span>
      </div>
    );
  return (
    <div className={`ce-vault-add ${className}`}>
      <span className="ce-vault-btn is-in" role="status">
        <span aria-hidden="true">✓</span> In your collection
      </span>
      <span className="ce-vault-qty" aria-label="How many you own">
        <button type="button" onClick={() => change(qty - 1)} aria-label="One fewer">
          −
        </button>
        <span className="tabular">{qty}</span>
        <button type="button" onClick={() => change(qty + 1)} aria-label="One more">
          +
        </button>
      </span>
      <a className="ce-vault-link" href="/collection">
        See my collection →
      </a>
    </div>
  );
}
