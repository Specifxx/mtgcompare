import type { Metadata } from "next";
import { AdminSupportRow } from "@/components/AdminSupportRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { adminMetadata, requireAdminPage } from "@/lib/admin";
import { loadTickets } from "@/lib/admin-support";
import { ago } from "@/lib/format";
import { SUPPORT_CATEGORY_LABELS, isIn, SUPPORT_CATEGORIES, replyMailto } from "@/lib/inbox-rules";
import { formatTicketNumber } from "@/lib/order-number";

export const dynamic = "force-dynamic";
export const generateMetadata = (): Promise<Metadata> => adminMetadata({ title: "Support tickets" });

const STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-gold/15 text-gold",
  IN_PROGRESS: "bg-blue-500/15 text-blue-300",
  RESOLVED: "bg-emerald-500/15 text-emerald-300",
  CLOSED: "bg-ink-800 text-slate-500",
};

// The admin queue for /support tickets: newest first within each status, each
// with an inline status and note editor (POST /api/admin/support). The Reply
// link is a mailto: from the owner's own mail client; nothing is sent from here.
export default async function AdminSupportPage() {
  await requireAdminPage();
  let tickets: Awaited<ReturnType<typeof loadTickets>> = [];
  let error: string | null = null;
  try {
    tickets = await loadTickets();
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 200) : "Failed";
  }
  const open = tickets.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS").length;
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl text-white">Support tickets</h1>
      <p className="mt-1 text-sm text-slate-400">
        {tickets.length} total · {open} open · newest first within each status
      </p>
      <div className="mt-6">
        {error ? (
          <EmptyState title="Couldn't load tickets" body={error} />
        ) : tickets.length === 0 ? (
          <EmptyState title="No tickets yet" body="A /support submission appears here with its OC number." />
        ) : (
          <ul className="space-y-3">
            {tickets.map((t) => {
              const reply = replyMailto(t.email, `[${formatTicketNumber(t.number)}] ${t.subject}`);
              return (
                <li key={t.id} className="rounded-xl border border-ink-700 bg-ink-850 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <div className="font-semibold text-white">
                      {formatTicketNumber(t.number)} · {t.subject}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`chip text-[10px] font-bold ${STATUS_STYLE[t.status] ?? "bg-ink-800 text-slate-400"}`}>{t.status}</span>
                      <span className="text-xs text-slate-500">{ago(t.createdAt)}</span>
                    </div>
                  </div>
                  <div className="mt-0.5 text-sm text-slate-400">
                    {t.name} · {t.email} · <span className="text-slate-500">{isIn(SUPPORT_CATEGORIES, t.category) ? SUPPORT_CATEGORY_LABELS[t.category] : t.category}</span>
                    {t.userId ? <span className="text-slate-500"> · signed in</span> : null}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{t.message}</p>
                  {reply ? (
                    <div className="mt-3">
                      <a href={reply} className="text-xs font-medium text-brand-400 hover:underline">
                        Reply →
                      </a>
                    </div>
                  ) : null}
                  <AdminSupportRow id={t.id} initialStatus={t.status} initialNote={t.adminNote ?? ""} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
