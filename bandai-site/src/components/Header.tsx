import Link from "@/components/Link";
import { SITE } from "@/site.config";
import { SearchBox } from "./SearchBox";
import { MarketPicker, ThemeToggle } from "./ClientPrefs";

export const NAV = [
  // Multi-game sites (SITE.lines): each game first, by its short name.
  ...(SITE.lines ?? []).map((l) => ({ href: `/games/${l.slug}`, label: l.short })),
  { href: "/cards", label: "Cards" },
  { href: "/sets", label: "Sets" },
  { href: "/sealed", label: "Sealed" },
  ...(SITE.kits ? [{ href: "/kits", label: SITE.kits.label }] : []),
  { href: "/movers", label: "Movers" },
  { href: "/tools/deal-finder", label: "Deals" },
  { href: "/tools", label: "Tools" },
  { href: "/preorders", label: "Pre-orders" },
  { href: "/blog", label: "Guides" },
  { href: "/forum", label: "Forum" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-ink-700/60 bg-ink-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3 sm:gap-4">
        <Link href="/" className="flex min-w-0 shrink items-center gap-2 overflow-x-clip whitespace-nowrap sm:shrink-0 sm:overflow-visible font-display text-base font-black leading-none sm:text-lg" aria-label={`${SITE.name} home`}>
          {/* In a host span so the Christmas Santa hat (globals.css .xmas-logo-hat) can sit on the icon. */}
          <span className="xmas-hat-host">
            <img src="/icon.svg" alt={`${SITE.name} logo`} width={34} height={34} className="h-[30px] w-[30px] shrink-0 rounded-lg sm:h-[34px] sm:w-[34px]" />
            <span aria-hidden="true" className="xmas-logo-hat" />
          </span>
          <span className="wordmark">{SITE.wordmark[0]}</span>{" "}
          <span className="text-fg">{SITE.wordmark[1]}</span>
          <span className="season-only ml-1 inline" aria-hidden>🎃</span>
        </Link>
        <nav className="hidden gap-1 whitespace-nowrap xl:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`rounded-md px-2.5 py-1.5 text-sm hover:bg-ink-800 text-fg/85`}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden w-56 md:block">
          <SearchBox />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
          <MarketPicker />
          <ThemeToggle />
        </div>
      </div>
      {/* Phones search too: on RiftCompare search is the most-used control. */}
      <div className="px-4 pb-2 md:hidden">
        <SearchBox />
      </div>
      <nav className="flex gap-1 overflow-x-auto px-4 pb-2 xl:hidden" aria-label="Main mobile">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="shrink-0 rounded-md px-2.5 py-1 text-sm text-fg/85 hover:bg-ink-800">
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
