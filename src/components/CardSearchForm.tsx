import { Icon } from "@/components/Icon";
import { CARDS_HUB } from "@/lib/cards";

// A plain GET form to the card search page: works without script. "Sheoldred", "FDN 101", "atraxa 196".
export function CardSearchForm({ q = "", className = "" }: { q?: string; className?: string }) {
  return (
    <form action={`${CARDS_HUB}/search`} method="get" role="search" aria-label="Search card prices" className={`flex items-center gap-2 rounded-full border border-line bg-surface p-1.5 pl-4 ${className}`}>
      <Icon name="search" size={18} className="shrink-0 text-faint" />
      <input name="q" type="search" defaultValue={q} placeholder="Card name, or set code and number (FDN 101)" aria-label="Card name, set or number" className="min-w-0 flex-1 bg-transparent py-1.5 text-base outline-none placeholder:text-faint" />
      <button type="submit" className="btn-primary min-h-10 px-5">
        Search
      </button>
    </form>
  );
}
