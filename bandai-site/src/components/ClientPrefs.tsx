"use client";
// The visitor's market (which stores' prices to show first) and theme.
// Pages are cached for everyone, so the choice is applied client-side.
import { createContext, useContext, useEffect, useState } from "react";
import { MARKETS, MARKET_LABEL, type Market } from "@/lib/site-types";
import { Flag } from "./Flag";

const Ctx = createContext<{ market: Market; setMarket: (m: Market) => void }>({ market: "US", setMarket: () => {} });
export const useMarket = () => useContext(Ctx);

function guessMarket(): Market {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz.startsWith("Europe/London")) return "UK";
    if (tz.startsWith("Australia/")) return "AU";
    if (tz === "Asia/Singapore") return "SG";
    if (/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|Regina|St_Johns)/.test(tz)) return "CA";
    if (tz.startsWith("Europe/")) return "EU";
  } catch {}
  return "US";
}

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [market, setM] = useState<Market>("US");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("market") as Market | null;
      setM(saved && MARKETS.includes(saved) ? saved : guessMarket());
    } catch {
      setM(guessMarket());
    }
  }, []);
  const setMarket = (m: Market) => {
    setM(m);
    try {
      localStorage.setItem("market", m);
    } catch {}
  };
  return <Ctx.Provider value={{ market, setMarket }}>{children}</Ctx.Provider>;
}

// The header's region menu: the flag and code of the region in use, with a
// native select laid invisibly over them (cheap, keyboard- and
// screen-reader-friendly; the open list names every region in full).
export function MarketPicker() {
  const { market, setMarket } = useMarket();
  return (
    <label
      title={`Prices for ${MARKET_LABEL[market]}: change region`}
      className="relative flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-xs font-semibold text-fg focus-within:ring-2 focus-within:ring-brand/60 hover:border-brand/60"
    >
      <Flag code={market} />
      <span>{market}</span>
      <span aria-hidden className="text-[10px] text-muted">▾</span>
      <select
        aria-label="Your region"
        value={market}
        onChange={(e) => setMarket(e.target.value as Market)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {MARKETS.map((m) => (
          <option key={m} value={m}>
            {MARKET_LABEL[m]}
          </option>
        ))}
      </select>
    </label>
  );
}

// The homepage hero's region row (owner, 2026-11-02: make the switcher
// prominent, with flags). Same choice as the header menu.
export function MarketChooser({ className = "" }: { className?: string }) {
  const { market, setMarket } = useMarket();
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} role="group" aria-label="Choose your region">
      <span className="text-sm text-muted">Prices for</span>
      {MARKETS.map((m) => {
        const on = m === market;
        return (
          <button
            key={m}
            type="button"
            aria-pressed={on}
            onClick={() => setMarket(m)}
            title={MARKET_LABEL[m]}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
              on ? "border-brand bg-brand/15 font-semibold text-fg" : "border-ink-700 bg-ink-900/60 text-fg/80 hover:border-brand/60 hover:text-fg"
            }`}
          >
            <Flag code={m} />
            <span className="sm:hidden">{m}</span>
            <span className="hidden sm:inline">{MARKET_LABEL[m]}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ThemeToggle() {
  const [light, setLight] = useState(false);
  useEffect(() => setLight(document.documentElement.getAttribute("data-theme") === "light"), []);
  return (
    <button
      type="button"
      aria-label="Toggle light and dark theme"
      className="rounded-md border border-ink-700 px-2 py-1 text-xs"
      onClick={() => {
        const next = light ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", next);
        try {
          localStorage.setItem("theme", next);
        } catch {}
        setLight(!light);
      }}
    >
      {light ? "☾" : "☀"}<span className="hidden sm:inline">{light ? " Dark" : " Light"}</span>
    </button>
  );
}
