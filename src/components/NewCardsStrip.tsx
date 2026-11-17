import Link from "@/components/Link";
import { CARDS_HUB, cardsLive } from "@/lib/cards";

// "New: MTG card prices" (owner, 2026-11-17: draw current visitors to the new card section). A slim line in the page, never a pop-up,
// an overlay or anything that moves: it sits where it is drawn and a visitor who closes it never sees it again (localStorage). The
// inline script hides it before paint for someone who closed it, so nothing shifts. Only while the card file has cards.
const KEY = "mtgc-new-cards-strip";

export function NewCardsStrip({ className = "" }: { className?: string }) {
  if (!cardsLive()) return null;
  return (
    <>
      <div id="new-cards-strip" className={`flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm ${className}`}>
        <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">New</span>
        <Link href={CARDS_HUB} prefetch={false} className="min-w-0 flex-1 font-semibold hover:text-brand">
          Card prices: the most valuable cards of every set, updated daily <span aria-hidden="true">→</span>
        </Link>
        <button
          type="button"
          aria-label="Close"
          className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:text-ink"
          data-close-new-cards=""
        >
          ×
        </button>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){var k=${JSON.stringify(KEY)},el=document.getElementById("new-cards-strip");if(!el)return;try{if(localStorage.getItem(k)){el.style.display="none";return}}catch(e){}var b=el.querySelector("[data-close-new-cards]");if(b)b.addEventListener("click",function(){el.style.display="none";try{localStorage.setItem(k,"1")}catch(e){}})})();`,
        }}
      />
    </>
  );
}
