import { HubIntro } from "@/components/HubIntro";
import type { Metadata } from "next";
import Link from "next/link";
import { Pagination } from "@/components/Pagination";
import { Breadcrumbs, ColorDots, InShort } from "@/components/ui";
import { COLORS, COLOR_BIT, COLOR_LETTERS, colorsOfMask, identityName } from "@/lib/constants";
import { getCommanderPage } from "@/lib/data";
import { pageOg } from "@/lib/og/meta";

// /commanders: every card that can lead a Commander deck (ORACLE_FLAGS.COMMANDER: a legal Legendary Creature, a Legendary Vehicle or Spacecraft with power
// and toughness, or text that says it can be your commander), most-played first. The colour filter keeps commanders whose identity fits INSIDE the
// chosen colours. Read from the published files (ix/o and nm); rendered per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Commanders — Every Legal Commander, Decks & Prices",
  description: "Every Magic: The Gathering card that can be your commander, by colour identity, with the decks published for it and the price of each printing.",
  alternates: { canonical: "/commanders" },
  openGraph: pageOg("/commanders"),
};

type SP = { identity?: string; q?: string; page?: string };
const PER = 48;

const maskOfLetters = (s: string | undefined): number | undefined => {
  if (s == null) return undefined;
  let m = 0;
  for (const ch of s.toUpperCase()) if (ch in COLOR_BIT) m |= COLOR_BIT[ch as keyof typeof COLOR_BIT];
  return m;
};
const lettersOfMask = (m: number): string => COLOR_LETTERS.filter((l) => (m & COLOR_BIT[l]) !== 0).join("");

export default async function CommandersPage({ searchParams }: { searchParams: SP }) {
  const mask = maskOfLetters(searchParams.identity?.slice(0, 5));
  const q = (searchParams.q ?? "").slice(0, 60);
  const page = Math.max(1, Math.min(200, parseInt(searchParams.page ?? "1", 10) || 1));
  const res = await getCommanderPage({ identity: mask, q, page, per: PER }).catch(() => null);
  const params = { ...(mask != null ? { identity: lettersOfMask(mask) || "C" } : {}), ...(q ? { q } : {}) };
  const toggle = (l: (typeof COLOR_LETTERS)[number]): string => {
    const next = ((mask ?? 0) ^ COLOR_BIT[l]) & 31;
    return next ? `/commanders?identity=${lettersOfMask(next)}${q ? `&q=${encodeURIComponent(q)}` : ""}` : `/commanders${q ? `?q=${encodeURIComponent(q)}` : ""}`;
  };
  return (
    <div>
      <Breadcrumbs trail={[{ name: "Commanders" }]} />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Magic commanders</h1>
      <HubIntro path="/commanders" />
      <div className="mt-6">
        <InShort>
          {res ? `${res.total.toLocaleString("en-US")} cards can lead a Commander deck${mask != null ? ` in ${identityName(mask)} colours or fewer` : ""}.` : "The commander list is not available right now."}{" "}
          Each commander&apos;s page lists its printings and every deck published for it.
        </InShort>
      </div>

      <form action="/commanders" method="get" className="mt-4 flex flex-wrap items-center gap-2">
        {mask != null && <input type="hidden" name="identity" value={lettersOfMask(mask) || "C"} />}
        <label className="sr-only" htmlFor="commander-q">
          Search commanders
        </label>
        <input id="commander-q" name="q" defaultValue={q} placeholder="Search commanders" maxLength={60} className="input w-full sm:w-72" />
        <button type="submit" className="btn-ghost">
          Search
        </button>
        <span className="flex items-center gap-1.5 sm:ml-3" role="group" aria-label="Colour identity">
          {COLOR_LETTERS.map((l) => {
            const key = (Object.keys(COLORS) as (keyof typeof COLORS)[]).find((k) => COLORS[k].letter === l)!;
            const on = ((mask ?? 0) & COLOR_BIT[l]) !== 0;
            return (
              <Link
                key={l}
                href={toggle(l)}
                aria-pressed={on}
                title={COLORS[key].label}
                className={`grid h-9 w-9 place-items-center rounded-full text-xs font-bold ring-2 ${on ? "ring-white" : "opacity-50 ring-transparent"}`}
                style={{ background: COLORS[key].hex, color: "#111" }}
              >
                {l}
              </Link>
            );
          })}
          {mask != null && (
            <Link href={q ? `/commanders?q=${encodeURIComponent(q)}` : "/commanders"} className="ml-2 text-xs text-slate-400 hover:text-white">
              Clear colours
            </Link>
          )}
        </span>
      </form>

      {res && res.items.length === 0 ? (
        <p className="card-surface mt-6 p-6 text-center text-sm text-slate-400">No commander matches that search.</p>
      ) : (
        <div className="mt-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {(res?.items ?? []).map((o) => (
            <Link key={o.no} href={`/commanders/${o.slug}`} className="card-surface flex items-center gap-3 p-3 hover:border-ink-600">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-white">{o.name}</span>
                <span className="block truncate text-xs text-slate-400">{o.typeLine}</span>
                <span className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  <ColorDots colors={colorsOfMask(o.identity)} /> {identityName(o.identity)} · {o.nPrint} printing{o.nPrint === 1 ? "" : "s"}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
      {res && <Pagination page={page} totalPages={res.pages} params={params} basePath="/commanders" />}
    </div>
  );
}
