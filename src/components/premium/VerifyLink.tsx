"use client";

import { useEffect, useState } from "react";
import { codeFromHash, signInWithCode, trackSignedIn } from "@/lib/premium-member";

/** Where to land: the page the visitor was headed to (a Google or Discord sign-in carries it as &n=), else the account hub. */
function landing(hash: string): string {
  const n = /[#&]n=([^&]+)/.exec(hash)?.[1];
  const p = n ? decodeURIComponent(n) : "";
  return /^\/(?!\/)[\w\-/?=&.]*$/.test(p) ? p : "/account";
}

/** /account/verify: the emailed link's code is in the fragment (never sent to a server or logged); trade it for a sign-in. */
export function VerifyLink() {
  const [msg, setMsg] = useState("Signing you in…");
  useEffect(() => {
    const c = codeFromHash(location.hash);
    const to = landing(location.hash);
    history.replaceState(null, "", location.pathname);
    if (!c) {
      setMsg("That sign-in link isn't valid. Ask for a new one.");
      return;
    }
    signInWithCode(c).then((r) => {
      if (r.ok) {
        trackSignedIn("link");
        location.replace(to);
      }
      else setMsg(r.message);
    });
  }, []);
  return (
    <div className="card mx-auto max-w-md p-6 text-center">
      <p aria-live="polite">{msg}</p>
      {msg !== "Signing you in…" && (
        <a href="/account" className="btn-primary mt-4 inline-flex">
          Back to sign in
        </a>
      )}
    </div>
  );
}
