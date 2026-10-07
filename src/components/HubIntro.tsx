import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { hubIntro } from "@/lib/content/hub-intros";

// Renders the editorial intro for a hub or tool page. Nothing if the route has
// no entry, so adding one is a single edit in lib/content/hub-intros.ts.
//
// Placed directly under the page's <h1> on purpose: this is the text that
// answers "what is this and is it what I wanted?" for a visitor arriving from
// search, and it is the text that stops an interactive tool from reading as an
// empty page to anything that judges pages by their content.
//
// A paragraph may carry internal links as `[label](/path)` — the guide that
// explains the tool, named in the sentence that needs it (2026-09-26). Only
// site-relative paths become links; anything else stays literal text, so an
// intro can never send a reader off-site or smuggle in an affiliate URL.
export function HubIntro({ path, className }: { path: string; className?: string }) {
  const paragraphs = hubIntro(path);
  if (!paragraphs.length) return null;
  return (
    <div className={className ?? "mt-3 max-w-3xl space-y-2.5 text-sm leading-relaxed text-slate-400"}>
      {paragraphs.map((p, i) => (
        <p key={i}>{withLinks(p)}</p>
      ))}
    </div>
  );
}

const INLINE_LINK = /\[([^\]]+)\]\((\/(?!\/)[^)\s]*)\)/g;

export function withLinks(text: string): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_LINK)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push(
      <Link key={at} href={m[2]} className="text-brand-400 hover:underline">
        {m[1]}
      </Link>,
    );
    last = at + m[0].length;
  }
  if (!out.length) return text;
  if (last < text.length) out.push(text.slice(last));
  return <Fragment>{out}</Fragment>;
}

/** The intro's text as a reader sees it, links reduced to their labels — for
 *  tests and anything that counts words. */
export function plainIntroText(text: string): string {
  return text.replace(INLINE_LINK, "$1");
}
