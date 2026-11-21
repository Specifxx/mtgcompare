
/** The family's Telegram channel: the same checked drops as the Discord hub (2026-11-21). */
export const TELEGRAM_URL = "https://t.me/tcgdealsrestocks";
// "Join the Discord" with a reason to join (owner, 2026-11-20: "5 months and 9 members"). The family's ONE hub server,
// "TCG Deals & Restocks", posts sealed restocks and deals twice a day; each site links its own never-expiring
// invite code so the server's Invites list counts the members each site brings. Server-rendered, no state, no pop-up,
// never above a price (under the price table and in the footer). DECISIONS.md, 2026-11-20.
export function DiscordCta({ href, className = "" }: { href: string | undefined | null; className?: string }) {
  if (!href) return null;
  return (
    <aside
      aria-label="Our Discord"
      className={`flex flex-col gap-3 rounded-xl border border-[#5865F2]/40 bg-[#5865F2]/10 p-4 text-left sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <div>
        <p className="text-sm font-bold">Restock and deal alerts, free on Discord and Telegram</p>
        <p className="mt-0.5 text-xs opacity-80">
          Sealed restocks and deals from the stores we track, posted twice a day and checked at the store first.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-[#5865F2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4752C4]"
        >
          Join the Discord
        </a>
        <a
          href={TELEGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-[#229ED9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1C8BC0]"
        >
          Telegram
        </a>
      </div>
    </aside>
  );
}
