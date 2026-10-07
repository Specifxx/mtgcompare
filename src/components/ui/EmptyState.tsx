import Link from "next/link";
import { NavIcon, type NavIconName } from "@/components/NavIcon";

type Action = { href: string; label: string } | { onClick: () => void; label: string };

/**
 * A consistent shape for "there's nothing here yet" — replacing prose-only
 * empty states (Watchlist, MyCollection, the notification bell) with a
 * drawn icon, a real next action, and no card chrome when `bare` is set
 * (for compact contexts like the bell's dropdown).
 */
export function EmptyState({
  icon,
  title,
  body,
  primary,
  secondary,
  bare = false,
  children,
}: {
  icon?: NavIconName;
  title: string;
  body?: string;
  primary?: Action;
  secondary?: Action;
  bare?: boolean;
  children?: React.ReactNode;
}) {
  const content = (
    <>
      {icon && (
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-ink-800 text-slate-400">
          <NavIcon name={icon} className="h-5 w-5" />
        </div>
      )}
      <p className="font-semibold text-white">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">{body}</p>}
      {children}
      {(primary || secondary) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {primary && <ActionButton action={primary} className="btn-primary" />}
          {secondary && <ActionButton action={secondary} className="btn-ghost" />}
        </div>
      )}
    </>
  );

  if (bare) return <div className="py-6 text-center">{content}</div>;
  return <div className="card-surface p-8 text-center">{content}</div>;
}

function ActionButton({ action, className }: { action: Action; className: string }) {
  if ("href" in action) {
    return (
      <Link href={action.href} className={className}>
        {action.label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={className}>
      {action.label}
    </button>
  );
}
