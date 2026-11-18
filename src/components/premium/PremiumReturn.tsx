"use client";

import { useEffect, useState } from "react";
import { checkToken, tokenFromHash, writeStored } from "@/lib/premium-member";

/** /premium/return: takes the token out of the fragment, stores it, clears the address bar, and goes to /premium. */
export function PremiumReturn() {
  const [msg, setMsg] = useState("Signing you in…");
  useEffect(() => {
    const t = tokenFromHash(location.hash);
    history.replaceState(null, "", location.pathname);
    if (!t) {
      setMsg("That sign-in link is not valid. Go back and try again.");
      return;
    }
    checkToken(t).then((r) => {
      if (r.kind === "ok") {
        writeStored({ t, premium: r.premium, until: r.until, who: r.who, checkedAt: Date.now() });
        location.replace("/premium");
      } else {
        setMsg(r.kind === "invalid" ? "Sign in again from the Premium page." : "Couldn't reach RiftCompare. Try again in a minute.");
      }
    });
  }, []);
  return <p className="text-muted" aria-live="polite">{msg}</p>;
}
