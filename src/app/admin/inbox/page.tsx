import type { Metadata } from "next";
import Link from "next/link";
import { CopyText, StatusButtons, type StatusOption } from "@/components/admin/InboxActions";
import { EmptyState } from "@/components/ui/EmptyState";
import { adminMetadata, requireAdminPage } from "@/lib/admin";
import { loadInbox } from "@/lib/admin-inbox";
import { ago, moneyCode } from "@/lib/format";
import { CONTACT_CATEGORY_LABELS, ISSUE_LABELS, isIn, CONTACT_CATEGORIES, REPORT_ISSUES, replyMailto } from "@/lib/inbox-rules";

export const dynamic = "force-dynamic";
export const generateMetadata = (): Promise<Metadata> => adminMetadata({ title: "Inbox" });

const DELETE: StatusOption = { value: "delete", label: "Delete", destructive: true };
const REPORT_OPTIONS: StatusOption[] = [
  { value: "NEW", label: "New" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "REJECTED", label: "Rejected" },
  { value: "FIXED", label: "Fixed" },
  DELETE,
];
const SUGGESTION_OPTIONS: StatusOption[] = [
  { value: "added", label: "Added" },
  { value: "rejected", label: "Rejected" },
  { value: "pending", label: "Pending" },
  DELETE,
];
const CONTACT_OPTIONS: StatusOption[] = [{ value: "DONE", label: "Done" }, { value: "NEW", label: "Reopen" }, DELETE];

function Section({ id, title, count, open, children }: { id: string; title: string; count: number | null; open: number; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-3">
      <h2 className="text-xl text-white">
        {title}{" "}
        <span className="text-sm font-normal text-slate-400">
          ({count == null ? "–" : count}
          {open ? `, ${open} open` : ""})
        </span>
      </h2>
      {children}
    </section>
  );
}

const Failed = ({ error }: { error: string }) => <EmptyState title="Couldn't load this list" body={error} />;

export default async function AdminInbox() {
  await requireAdminPage();
  const inbox = await loadInbox();
  const { reports, hotStores, suggestions, feedback, contact } = inbox;

  return (
    // "calt" off: the site font's contextual alternates draw the x in "6x0" as
    // a multiplication sign, and this page is mostly user-typed URLs and codes.
    <div className="space-y-10" style={{ fontFeatureSettings: '"calt" 0' }}>
      <div>
        <h1 className="text-3xl text-white">Inbox</h1>
        <p className="mt-1 flex flex-wrap gap-4 text-sm">
          <a href="#reports" className="text-brand-400 hover:underline">
            Wrong-price reports
          </a>
          <a href="#suggestions" className="text-brand-400 hover:underline">
            Store suggestions
          </a>
          <a href="#feedback" className="text-brand-400 hover:underline">
            Feedback
          </a>
          <a href="#messages" className="text-brand-400 hover:underline">
            Messages
          </a>
        </p>
      </div>

      <Section
        id="reports"
        title="Wrong-price reports"
        count={reports.ok ? reports.data.length : null}
        open={reports.ok ? reports.data.filter((r) => r.status === "NEW").length : 0}
      >
        {hotStores.ok && hotStores.data.length ? (
          <div className="rounded-lg border border-red-400/50 bg-red-400/10 p-4 text-sm text-red-300">
            <p className="font-semibold">Several reports in 14 days — check these stores first:</p>
            <ul className="mt-2 space-y-1">
              {hotStores.data.map((h) => (
                <li key={h.source}>
                  <span className="font-semibold">{h.name}</span> · {h.reports} reports ·{" "}
                  {h.latest
                    ? `last read ${ago(h.latest.at)}: ${h.latest.failed ? "FAILED" : `${h.latest.products} products → ${h.latest.cards + h.latest.sealed} matched, ${h.latest.inStock} in stock`}`
                    : "no recent read"}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {!reports.ok ? (
          <Failed error={reports.error} />
        ) : reports.data.length ? (
          <ul className="space-y-3">
            {reports.data.map((r) => (
              <li key={r.id} className="card-surface space-y-2 p-4">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {r.product ? (
                    <Link href={r.product.href} className="font-semibold text-white hover:text-brand-400">
                      {r.product.name}
                    </Link>
                  ) : (
                    <span className="font-semibold text-white">Product #{r.productId}</span>
                  )}
                  <span className="text-sm text-slate-300">{r.storeName}</span>
                  <span className="chip border border-ink-700 text-slate-300">{r.market}</span>
                  <span className="chip border border-ink-700 text-slate-300">{isIn(REPORT_ISSUES, r.issue) ? ISSUE_LABELS[r.issue] : r.issue}</span>
                  <span className="text-xs text-slate-500">{ago(r.createdAt)}</span>
                </p>
                <p className="text-sm text-slate-300">
                  We show <span className="num text-white">{moneyCode(r.shownPriceCents, r.currency)}</span>
                  {r.claimedCents != null ? (
                    <>
                      {" "}
                      · They say <span className="num text-white">{moneyCode(r.claimedCents, r.currency)}</span>
                    </>
                  ) : null}
                  {r.listingUrl ? (
                    <>
                      {" "}
                      ·{" "}
                      <a href={r.listingUrl} target="_blank" rel="nofollow noopener noreferrer" className="text-brand-400 hover:underline">
                        listing
                      </a>
                    </>
                  ) : null}
                </p>
                {r.note ? <p className="whitespace-pre-wrap text-sm text-slate-200">{r.note}</p> : null}
                {r.issue === "WRONG_PRINTING" && r.listingTitle ? (
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="rounded bg-ink-850 px-2 py-1 text-xs text-slate-200">{r.listingTitle}</code>
                      <CopyText text={r.listingTitle} />
                    </div>
                    <p className="text-xs text-slate-500">Add this title to tests/match.test.ts with the correct printing (or none).</p>
                  </div>
                ) : null}
                <StatusButtons
                  endpoint="/api/admin/price-reports"
                  id={r.id}
                  current={r.status}
                  options={REPORT_OPTIONS}
                  destructiveConfirm="Delete this report for good?"
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No reports yet" />
        )}
      </Section>

      <Section
        id="suggestions"
        title="Store suggestions"
        count={suggestions.ok ? suggestions.data.length : null}
        open={suggestions.ok ? suggestions.data.filter((s) => s.status === "pending").length : 0}
      >
        <p className="text-xs text-slate-500">Add qualifying stores to src/lib/stores.ts (README: Adding a store).</p>
        {!suggestions.ok ? (
          <Failed error={suggestions.error} />
        ) : suggestions.data.length ? (
          <ul className="space-y-3">
            {suggestions.data.map((s) => (
              <li key={s.id} className="card-surface space-y-2 p-4">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <a href={s.storeUrl} target="_blank" rel="nofollow noopener noreferrer" className="font-semibold text-white hover:text-brand-400">
                    {s.storeUrl.replace(/^https:\/\//, "")}
                  </a>
                  <span className="text-sm text-slate-300">{s.storeName}</span>
                  <span className="chip border border-ink-700 text-slate-300">{s.country}</span>
                  <span className="text-xs text-slate-500">{ago(s.createdAt)}</span>
                </p>
                {s.note ? <p className="whitespace-pre-wrap text-sm text-slate-200">{s.note}</p> : null}
                <StatusButtons
                  endpoint="/api/admin/store-suggestions"
                  id={s.id}
                  current={s.status}
                  options={SUGGESTION_OPTIONS}
                  destructiveConfirm="Delete this suggestion for good?"
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No suggestions yet" />
        )}
      </Section>

      <Section
        id="feedback"
        title="Feedback"
        count={feedback.ok ? feedback.data.total : null}
        open={feedback.ok ? feedback.data.rows.filter((f) => f.status === "NEW").length : 0}
      >
        {!feedback.ok ? (
          <Failed error={feedback.error} />
        ) : feedback.data.rows.length ? (
          <ul className="space-y-3">
            {feedback.data.rows.map((f) => (
              <li key={f.id} className="card-surface space-y-2 p-4">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {f.rating ? (
                    <span className="text-gold" aria-label={`${f.rating} of 5 stars`}>
                      {"★".repeat(f.rating)}
                      <span className="text-slate-600">{"★".repeat(5 - f.rating)}</span>
                    </span>
                  ) : null}
                  <span className="chip border border-ink-700 text-slate-300">{f.status}</span>
                  {f.consentPublic ? (
                    <span className="chip border border-emerald-400/40 text-emerald-300">May show publicly{f.displayName ? ` as “${f.displayName}”` : ""}</span>
                  ) : (
                    <span className="chip border border-ink-700 text-slate-400">Private</span>
                  )}
                  <span className="text-xs text-slate-500">
                    {f.submitter ? `${f.submitter.displayName} (${f.submitter.email})` : "signed out"} · from {f.page ?? "–"} (
                    {f.source === "widget" ? "widget" : "page form"}) · {ago(f.createdAt)}
                  </span>
                </p>
                {f.message ? <p className="whitespace-pre-wrap text-sm text-slate-200">{f.message}</p> : null}
                <StatusButtons
                  endpoint="/api/admin/feedback"
                  id={f.id}
                  current={f.status === "APPROVED" ? "approve" : f.status === "HIDDEN" ? "hide" : f.status === "SPAM" ? "spam" : "reopen"}
                  options={[
                    ...(f.consentPublic ? [{ value: "approve", label: "Approve" }] : []),
                    { value: "hide", label: "Hide" },
                    { value: "spam", label: "Spam" },
                    { value: "reopen", label: "Reopen" },
                    DELETE,
                  ]}
                  destructiveConfirm="Delete this feedback for good?"
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No feedback yet" />
        )}
      </Section>

      <Section
        id="messages"
        title="Messages"
        count={contact.ok ? contact.data.length : null}
        open={contact.ok ? contact.data.filter((m) => m.status === "NEW").length : 0}
      >
        {!contact.ok ? (
          <Failed error={contact.error} />
        ) : contact.data.length ? (
          <ul className="space-y-3">
            {contact.data.map((m) => (
              <li key={m.id} className="card-surface space-y-2 p-4">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold text-white">{m.name}</span>
                  <span className="text-sm text-slate-300">{m.email}</span>
                  <span className="chip border border-ink-700 text-slate-300">
                    {isIn(CONTACT_CATEGORIES, m.category) ? CONTACT_CATEGORY_LABELS[m.category] : m.category}
                  </span>
                  <span className="text-xs text-slate-500">{ago(m.createdAt)}</span>
                </p>
                {m.subject ? <p className="text-sm font-semibold text-slate-100">{m.subject}</p> : null}
                <p className="whitespace-pre-wrap text-sm text-slate-200">{m.message}</p>
                <div className="flex flex-wrap items-center gap-3">
                  {replyMailto(m.email, m.subject) ? (
                    <a href={replyMailto(m.email, m.subject)!} className="text-brand-400 hover:underline text-sm">
                      Reply
                    </a>
                  ) : (
                    <span className="text-xs text-amber-300">No reply link: this address doesn&apos;t pass the email check</span>
                  )}
                  <StatusButtons
                    endpoint="/api/admin/contact"
                    id={m.id}
                    current={m.status}
                    options={CONTACT_OPTIONS}
                    destructiveConfirm="Delete this message for good?"
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No messages yet" />
        )}
      </Section>
    </div>
  );
}
