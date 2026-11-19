"use client";

import { useEffect, useState } from "react";
import { PREMIUM_SERVICE } from "@/lib/premium-member";

// "Continue with Google" and "Continue with Discord" (owner, 2026-11-19: "Google OAuth and Discord OAuth … we want to have those login
// methods on basically all of our sites"). Plain links to RiftCompare's sister sign-in (/api/sister-premium/oauth/<provider>), which
// runs the provider's own sign-in through RiftCompare's existing apps and comes back to /account/verify here with a 20-minute code:
// one account across our card sites, linked by the verified address. `google` is false where this site has Google's in-page button
// (its own client) instead.
export function OAuthButtons({ site, google = true, className = "" }: { site: string; google?: boolean; className?: string }) {
  const [next, setNext] = useState("");
  useEffect(() => {
    try {
      const n = new URLSearchParams(location.search).get("next") || "";
      if (/^\/(?!\/)[\w\-/?=&.]*$/.test(n)) setNext(n);
    } catch {
      /* no next: the account hub */
    }
  }, []);
  const href = (p: string) => `${PREMIUM_SERVICE}/api/sister-premium/oauth/${p}?site=${site}${next ? `&next=${encodeURIComponent(next)}` : ""}`;
  return (
    <div className={`grid gap-2 ${className}`}>
      {google && (
        <a href={href("google")} rel="nofollow" className="inline-flex min-h-11 w-full items-center justify-center gap-2.5 rounded-full border border-line bg-white px-4 text-sm font-semibold text-[#1f1f1f] transition-colors hover:bg-gray-50">
          <svg aria-hidden viewBox="0 0 48 48" className="h-5 w-5"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
          Continue with Google
        </a>
      )}
      <a href={href("discord")} rel="nofollow" className="inline-flex min-h-11 w-full items-center justify-center gap-2.5 rounded-full bg-[#5865F2] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#4752c4]">
        <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.2a18.4 18.4 0 0 0-5.5 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.7.1 18.2a19.9 19.9 0 0 0 6 3l1.3-2.1a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.8 19.8 0 0 0 6-3c.5-5.2-.9-9.8-3.6-13.8zM8 15.4c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.6 8 10.6s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z" /></svg>
          Continue with Discord
      </a>
    </div>
  );
}
