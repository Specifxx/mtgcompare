"use client";

import { useState } from "react";

// Copy-the-link button — TCG communities share cards in Discord constantly
// (user feedback), so the permanent URL gets a one-tap copy.
// A drawn icon and text-sm (2026-09-23) to match the heart button beside it
// (was a 🔗 emoji at text-xs); `responsive` gives an icon square below sm.
export function ShareButton({ className, responsive = false }: { className?: string; responsive?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* clipboard unavailable — ignore */
        }
      }}
      aria-label="Copy link to this page"
      title="Copy link"
      className={`btn-ghost whitespace-nowrap${responsive ? " w-12 px-0 sm:w-auto sm:px-4" : ""} ${className ?? ""}`}
    >
      {/* The glyph swaps to a check while copied, so a phone — where the label
          is hidden — still gets a confirmation. */}
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {copied ? (
          <path d="M20 6 9 17l-5-5" />
        ) : (
          <>
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </>
        )}
      </svg>
      <span className={responsive ? "hidden sm:inline" : undefined}>{copied ? "Copied!" : "Share"}</span>
    </button>
  );
}
