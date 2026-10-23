// Guide: Magic release dates and the pre-order calendar. Dates are sets.ts's (TCGplayer's group dates, Wizards' street dates); the
// open/listed counts are the region's today (more-data.ts setCountsOf). Pre-order wording follows release.ts isPreorderSet.
import type { RegionInfo } from "@/lib/regions";
import { formatRelease, isPreorderSet } from "@/lib/release";
import { openPreorderGuides } from "@/lib/preorder-guides";
import { SETS } from "@/lib/sets";
import { calendarSets, type GuideData } from "./data";
import { GUIDE_BY_SLUG } from "./index";
import { GuideBody, guideHref, Lede, LiveBlock, NextLinks, Prose, StackTable, storesPhrase, whereToBuy, type BodyProps, type GuideOutline } from "./kit";
import { faqSection, SetLink } from "./kit-more";

const GUIDE = GUIDE_BY_SLUG.get("magic-release-dates-preorder-calendar")!;

export function outline(r: RegionInfo, data: GuideData, now: Date = new Date()): GuideOutline {
  const sets = calendarSets(data.today);
  const upcoming = sets.filter((s) => isPreorderSet(s.code, now)).reverse();
  const out = sets.filter((s) => !isPreorderSet(s.code, now));
  const counts = data.sets ?? {};
  const pre = new Set(openPreorderGuides(data.today).map((g) => g.set.code));
  const row = (s: (typeof sets)[number]) => ({
    key: s.code,
    th: <SetLink r={r} slug={s.slug}>{s.name}</SetLink>,
    cells: [formatRelease(s.releaseDate), s.series, <span key="n">{counts[s.code] ? `${counts[s.code].open} of ${counts[s.code].products}` : "—"}</span>],
  });
  const next = upcoming[0] ?? null;
  return {
    intro: (
      <Lede>
        {next ? (
          <>
            The next Magic: The Gathering set is <strong>{next.name}</strong>, out in English on <strong>{formatRelease(next.releaseDate)}</strong>. Here is every upcoming set
            and the last twelve months of releases, with what {storesPhrase(r)} have open for each today.
          </>
        ) : (
          <>Here are the last twelve months of Magic: The Gathering releases, with what {storesPhrase(r)} have open for each today.</>
        )}
      </Lede>
    ),
    sections: [
      {
        id: "upcoming",
        title: "Upcoming sets and pre-orders",
        live: true,
        body: (
          <>
            <LiveBlock r={r} checked={data.checked}>
              {upcoming.length ? (
                <StackTable caption="Upcoming Magic sets: English release dates and products open for pre-order today" head={["Set", "English release", "Series", "Open of listed"]} rows={upcoming.map(row)} />
              ) : (
                <p className="text-sm text-muted">No upcoming set is announced in our calendar right now.</p>
              )}
            </LiveBlock>
            <NextLinks
              links={[
                ...upcoming.filter((s) => pre.has(s.code)).map((s) => ({ href: `/${r.region}/preorders/${s.slug}`, label: `${s.name} pre-orders`, icon: "calendar" as const })),
                { href: `/${r.region}/releases`, label: "The full release calendar", icon: "calendar" as const },
              ]}
            />
          </>
        ),
      },
      {
        id: "recent",
        title: "Released in the last twelve months",
        body: (
          <LiveBlock r={r} checked={data.checked}>
            <StackTable caption="Magic sets released in the last twelve months, and products in stock today" head={["Set", "English release", "Series", "Open of listed"]} rows={out.map(row)} />
          </LiveBlock>
        ),
      },
      {
        id: "dates",
        title: "About these dates",
        body: (
          <Prose>
            <p>
              The dates are English release dates. A store may ship a pre-order on the day or a little after; check each store’s pre-order terms. See{" "}
              <a href={guideHref(r, "how-to-preorder-magic-sets")}>how to pre-order Magic sets</a>.
            </p>
          </Prose>
        ),
      },
      faqSection([
        { q: "When is the next Magic: The Gathering set released?", a: next ? `${next.name} is out in English on ${formatRelease(next.releaseDate)}.` : "No upcoming set is in our calendar right now." },
        { q: `Can I pre-order it in ${r.inName}?`, a: next && counts[next.code]?.open ? `Yes: ${counts[next.code].open} ${next.name} products are open for pre-order at the stores MTG Compare checks today.` : "Not at the stores we compare yet; the table fills in as stores open pre-orders." },
        { q: "How many Magic sets come out a year?", a: `${SETS.filter((s) => s.releaseDate.startsWith(data.today.slice(0, 4))).length} English sets with sealed product in our calendar are dated ${data.today.slice(0, 4)}.` },
      ]),
      whereToBuy(r),
    ],
  };
}

export function Body({ r, data }: BodyProps) {
  return <GuideBody guide={GUIDE} r={r} outline={outline(r, data)} />;
}
