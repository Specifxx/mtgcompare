"use client";
// The one-day Black Friday bar (lib/bf-mode.ts): drawn in the server HTML in place of the promo line under the header, and
// read against the clock again in the browser, so once the window ends the page shows the ordinary line (`children`) again
// with no new build. The ✕ hides it for this visit only. Never a pop-up, never fixed or floating.
import { useEffect, useState, type ReactNode } from "react";
import { bfModeOn } from "@/lib/bf-mode";

const CLOSED_KEY = "bf-mode-closed";

export function BfModeBar({
  on,
  href,
  title,
  line,
  cta = "Shop the deals",
  ad,
  children,
}: {
  /** The server's answer to bfModeOn() when it drew the page. */
  on: boolean;
  /** Our own Black Friday deals page. */
  href: string;
  title: string;
  line?: string;
  cta?: string;
  /** An optional second, labelled paid link (TCGplayer's sale), drawn by the site with its own tagged link. */
  ad?: ReactNode;
  /** The ordinary promo line, shown again once Black Friday mode ends. */
  children?: ReactNode;
}) {
  const [live, setLive] = useState(on);
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    setLive(bfModeOn(Date.now()));
    try {
      if (sessionStorage.getItem(CLOSED_KEY) === "1") setClosed(true);
    } catch {
      /* storage refused: the bar shows */
    }
  }, []);
  if (!live) return <>{children}</>;
  if (closed) return null;
  return (
    <div data-bf-mode="on" className="relative" style={{ background: "#0b0b0c", color: "#fff", borderBottom: "1px solid #000" }}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-4 py-2 pr-11 text-center text-sm">
        <a href={href} className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1" style={{ color: "#fff", textDecoration: "none" }}>
          <span
            className="rounded px-1.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider"
            style={{ background: "#ffd400", color: "#0b0b0c" }}
          >
            Black Friday
          </span>
          <b>{title}</b>
          {line ? <span className="hidden md:inline" style={{ color: "#d4d4d8" }}>{line}</span> : null}
          <span className="rounded-full px-3 py-0.5 font-bold" style={{ background: "#ffd400", color: "#0b0b0c" }}>
            {cta} →
          </span>
        </a>
        {ad ? <span className="text-xs sm:text-sm" style={{ color: "#d4d4d8" }}>{ad}</span> : null}
      </div>
      <button
        type="button"
        aria-label="Hide the Black Friday bar"
        className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full"
        style={{ color: "#a1a1aa" }}
        onClick={() => {
          try {
            sessionStorage.setItem(CLOSED_KEY, "1");
          } catch {
            /* storage refused: it hides for this page */
          }
          setClosed(true);
        }}
      >
        ✕
      </button>
    </div>
  );
}
