"use client";

import { useEffect, useRef, useState } from "react";
import { GOOGLE_CLIENT_ID, emailSignInLink, readStored, signInWithGoogle } from "@/lib/premium-member";

// /account: sign in ON MTG Compare (owner, 2026-11-10). "Continue with Google" is Google Identity Services: Google's own button and
// account chooser, in this page, for MTG Compare's own client; the ID token goes to RiftCompare's API, which checks it with Google and
// answers with this site's sign-in token. Or an emailed 20-minute link from our alert sender. Nothing here needs a password.

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(o: { client_id: string; callback: (r: { credential?: string }) => void; ux_mode?: "popup"; auto_select?: boolean; itp_support?: boolean; context?: string }): void;
          renderButton(el: HTMLElement, o: Record<string, unknown>): void;
        };
      };
    };
  }
}

const GSI_SRC = "https://accounts.google.com/gsi/client";

/** Where to go after signing in: a same-site path from ?next=, else /premium. */
function nextPath(): string {
  try {
    const n = new URLSearchParams(location.search).get("next") || "";
    return /^\/(?!\/)[\w\-/?=&.]*$/.test(n) ? n : "/watches";
  } catch {
    return "/premium";
  }
}

export function SignIn() {
  const btn = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (readStored()) setSignedIn(true);
    if (!GOOGLE_CLIENT_ID || !btn.current) return;
    const el = btn.current;
    const draw = () => {
      if (!window.google) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        ux_mode: "popup",
        itp_support: true,
        context: "signin",
        callback: async (r) => {
          if (!r.credential) return;
          setBusy(true);
          setMsg({ ok: true, text: "Signing you in…" });
          const res = await signInWithGoogle(r.credential);
          setBusy(false);
          if (res.ok) location.replace(nextPath());
          else setMsg({ ok: false, text: res.message });
        },
      });
      window.google.accounts.id.renderButton(el, { type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "pill", width: Math.min(360, el.clientWidth || 320) });
    };
    if (window.google) draw();
    else {
      const s = document.createElement("script");
      s.src = GSI_SRC;
      s.async = true;
      s.onload = draw;
      document.head.appendChild(s);
    }
  }, []);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await emailSignInLink(email.trim());
    setBusy(false);
    setMsg({ ok: r.ok, text: r.message });
  }

  return (
    <div className="card mx-auto max-w-md p-6 sm:p-8">
      <h1 className="page-title">Sign in to MTG Compare</h1>
      <p className="mt-1 text-sm text-muted">A free account keeps your price alerts in one list on every device. No password needed.</p>
      {signedIn && (
        <p className="mt-4 rounded-lg bg-brand-soft p-3 text-sm">
          You&rsquo;re already signed in on this device. <a className="font-semibold underline" href="/watches">My watches</a>
        </p>
      )}
      {GOOGLE_CLIENT_ID && (
        <>
          <div ref={btn} className="mt-6 flex min-h-[44px] justify-center" />
          <div className="my-5 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}
      <form onSubmit={sendLink} className={GOOGLE_CLIENT_ID ? "" : "mt-6"}>
        <label htmlFor="signin-email" className="text-sm font-semibold">Email me a sign-in link</label>
        <input
          id="signin-email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base"
        />
        <button type="submit" disabled={busy || !email} className="btn-primary mt-3 w-full justify-center">
          {busy ? "Sending…" : "Email me a link"}
        </button>
      </form>
      {msg && (
        <p className={`mt-4 text-sm ${msg.ok ? "text-ink" : "text-red-600"}`} aria-live="polite">
          {msg.text}
        </p>
      )}
      <p className="mt-6 text-xs text-muted">
        Already signed up on RiftCompare or DexCompare? Use the same email: it&rsquo;s one account across our card sites. By signing in you agree to our{" "}
        <a className="underline" href="/terms">terms</a> and <a className="underline" href="/privacy">privacy policy</a>.
      </p>
    </div>
  );
}
