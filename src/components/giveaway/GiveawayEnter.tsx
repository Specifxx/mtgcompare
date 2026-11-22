"use client";

import { useEffect } from "react";
import { GiveawayPanel, type Me, type PanelApi } from "./GiveawayPanel";
import { GIVEAWAY_SERVICE, giveawayState } from "@/lib/giveaway";
import { readStored, writeStored } from "@/lib/premium-member";

// This site's adapter for the entry panel. The account is the visitor's RiftCompare account, held here as the premium-session
// token RiftCompare signed for this site (lib/premium-member.ts); every call goes to RiftCompare's /api/sister-giveaway, which
// checks the token and answers the account's points. No page here reads a cookie or holds an address.
const REF_KEY = "gw_ref_v1";

function ref(): string | undefined {
  try {
    return localStorage.getItem(REF_KEY) || undefined;
  } catch {
    return undefined;
  }
}

/** One call to RiftCompare's giveaway API for this browser's account (also read by the profile page, components/account/ProfileHub.tsx). */
export async function giveawayCall(body: Record<string, unknown>): Promise<Me> {
  const stored = readStored();
  if (!stored) return { state: giveawayState(), signedIn: false };
  try {
    const r = await fetch(`${GIVEAWAY_SERVICE}/api/sister-giveaway`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: stored.t, ...body }),
      credentials: "omit",
    });
    const j = (await r.json().catch(() => ({}))) as Me;
    if (r.status === 401) {
      writeStored(null);
      return { state: giveawayState(), signedIn: false };
    }
    if (!r.ok) return { ...j, signedIn: true, state: j.state ?? giveawayState(), error: j.error ?? "Couldn't reach the giveaway. Try again." };
    return j;
  } catch {
    return { state: giveawayState(), signedIn: true, error: "Couldn't reach the giveaway. Try again." };
  }
}

export function GiveawayEnter({ discordUrl }: { discordUrl?: string }) {
  // A friend's invite (?ref=<their account>) is kept until this browser enters.
  useEffect(() => {
    try {
      const r = new URLSearchParams(location.search).get("ref");
      if (r && /^[A-Za-z0-9_-]{6,40}$/.test(r)) localStorage.setItem(REF_KEY, r);
    } catch {
      /* private window: the invite just doesn't count */
    }
  }, []);
  const api: PanelApi = {
    load: () => giveawayCall({}),
    act: async (action, extra = {}) => {
      const m = await giveawayCall({ action, ref: action === "enter" ? ref() : undefined, ...extra });
      if (m.entered) {
        try {
          localStorage.removeItem(REF_KEY);
        } catch {
          /* fine */
        }
      }
      return m;
    },
  };
  return (
    <GiveawayPanel
      api={api}
      closesText="14 Dec, 11:59 pm Sydney"
      premiumHref="/premium"
      signIn={
        <a rel="nofollow" href="/account?src=giveaway&next=%2Fgiveaway" className="btn-primary inline-flex">
          Sign in free to enter
        </a>
      }
      after={
        discordUrl ? (
          <>
            <b>While you wait:</b> get restocks and price drops first in our free{" "}
            <a href={discordUrl} className="underline" rel="noopener" target="_blank">
              Discord
            </a>{" "}
            or{" "}
            <a href="https://t.me/tcgdealsrestocks" className="underline" rel="noopener" target="_blank">
              Telegram
            </a>{" "}
            deal hub.
          </>
        ) : undefined
      }
    />
  );
}
