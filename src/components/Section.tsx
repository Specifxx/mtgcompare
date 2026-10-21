import Link from "next/link";
import { Icon, type IconName } from "./Icon";

export function Section({
  id,
  title,
  kicker,
  href,
  linkLabel = "See all",
  children,
}: {
  /** An anchor for in-page links ("Compare all prices ↓" → #prices). html's scroll-padding-top keeps it clear of the sticky header. */
  id?: string;
  title: string;
  kicker?: string;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-14">
      {/* wraps: a long "All … →" link drops under the title on a phone instead of widening the page */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          {kicker && <div className="eyebrow mb-1">{kicker}</div>}
          <h2 className="font-display text-2xl font-bold tracking-tight sm:text-[28px]">{title}</h2>
        </div>
        {href && (
          <Link href={href} prefetch={false} className="shrink-0 text-sm font-semibold text-brand hover:underline">
            {linkLabel} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** Where to go instead, under an empty state: internal links only ("All booster boxes", "Pre-orders", the nearest region). */
export interface EmptyAction {
  href: string;
  label: string;
}

/** The icon an empty state's action chip leads with, by where it goes. */
export function emptyActionIcon(href: string): IconName {
  const path = href.split(/[?#]/)[0];
  if (/\/(deals|cheapest-packs)(\/|$)/.test(path)) return "tag";
  if (/\/releases(\/|$)/.test(path)) return "calendar";
  if (/\/stores(\/|$)/.test(path)) return "store";
  if (/\/this-week(\/|$)/.test(path)) return "clock";
  if (/\/sealed(\/|$)/.test(path)) return "search";
  return "arrow-right";
}

/**
 * An empty list, said plainly. With `actions`, it reads as a designed state rather than a broken one: a quiet icon, the sentence,
 * and a row of chips to go somewhere useful instead. Each chip's icon sits beside its link (globals.css .empty-action), so the link
 * itself is just the chip and its words.
 */
export function Empty({ children, actions }: { children: React.ReactNode; actions?: EmptyAction[] }) {
  if (!actions?.length) return <div className="card px-6 py-10 text-center text-muted">{children}</div>;
  return (
    <div className="card px-6 py-10 text-center text-muted">
      <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-sold-soft text-sold" aria-hidden="true">
        <Icon name="info" size={20} />
      </span>
      {children}
      <ul className="mt-5 flex flex-wrap justify-center gap-2">
        {actions.map((a) => (
          <li key={a.href} className="empty-action">
            <Icon name={emptyActionIcon(a.href)} size={16} />
            <Link href={a.href} prefetch={false} className="chip min-h-10">
              {a.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
