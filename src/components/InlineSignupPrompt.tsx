"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMe } from "@/lib/use-me";

// The in-page free-account prompt for SIGNED-OUT visitors only (RiftCompare's
// InlineSignupPrompt): no modal, no timer, nothing that interrupts. It sits in
// the page where an account is useful and links to /login, coming back to the
// same page (?next=) with a ?src= naming the placement for analytics. Hidden
// until useMe() has settled, so a signed-in visitor never sees it flash.
export function InlineSignupPrompt({
  surface,
  title,
  body,
  next,
  className = "",
}: {
  /** The placement, e.g. "card", "movers", "price-guide": the /login ?src= value. */
  surface: string;
  title: string;
  body: string;
  /** Where to return after sign-in. Defaults to the current path. */
  next?: string;
  className?: string;
}) {
  const { me, loaded } = useMe();
  const pathname = usePathname();
  if (!loaded || me.user) return null;
  const back = next ?? pathname ?? "/";
  const href = `/login?next=${encodeURIComponent(back)}&src=${encodeURIComponent(surface)}`;
  return (
    <aside aria-label="Create a free account" data-inline-signup={surface} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-700 bg-ink-850 p-4 sm:p-5 ${className}`}>
      <div className="min-w-0 flex-[1_1_18rem]">
        <p className="text-base font-bold text-white">{title}</p>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-400">{body}</p>
      </div>
      <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
        <Link href={href} rel="nofollow" className="btn-primary whitespace-nowrap text-sm">
          Create a free account
        </Link>
        <span className="text-xs text-slate-500">Free, no card needed</span>
      </div>
    </aside>
  );
}
