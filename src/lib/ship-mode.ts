// The price table's "Price" / "Price + shipping" choice, shared by the table and the best-price card, remembered in localStorage (a
// per-visitor convenience: nothing on the server reads it, so pages stay cacheable). The server renders "price"; the browser switches
// after hydration when the visitor chose "total" before.
import { useSyncExternalStore } from "react";
import type { ShipMode } from "./shipping-rank";

const KEY = "mtgc-ship-mode";
const EVENT = "ship-mode";

function read(): ShipMode {
  try {
    return window.localStorage.getItem(KEY) === "total" ? "total" : "price";
  } catch {
    return "price";
  }
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function setShipMode(mode: ShipMode): void {
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    // private window: the choice lasts until the page is left
    memo = mode;
  }
  window.dispatchEvent(new Event(EVENT));
}

let memo: ShipMode | null = null;

export function useShipMode(): ShipMode {
  return useSyncExternalStore(subscribe, () => memo ?? read(), () => "price");
}
