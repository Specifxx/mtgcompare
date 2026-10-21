// The by-country guide's body: per set, each market's cheapest Play and Collector Booster box in its own currency, then the FAQ.
import type { ReactNode } from "react";
import { money } from "@/lib/format";
import { FAMILY } from "../families";
import { COUNTRY_FAMILIES, countryFaqs, marketLines, setByCode, whereOpen } from "./country-prices";
import type { CountryData } from "./country-prices-data";
import { Lede, NoneYet, Prose, StackTable, type GuideSection } from "./kit";

export function countryOutline(data: CountryData): { intro: ReactNode; sections: GuideSection[] } {
  const sections: GuideSection[] = data.sets.map((code) => {
    const set = setByCode(code);
    const name = set?.name ?? code.toUpperCase();
    return {
      id: `set-${code}`,
      title: name,
      live: true,
      body: (
        <>
          {COUNTRY_FAMILIES.map((k) => {
            const lines = marketLines(data.cards, code, k);
            if (!lines.some((l) => l.p)) return null;
            return (
              <div key={k} className="card my-5 px-4 py-2 sm:px-5 sm:py-3">
                <h3 className="pt-2 font-display text-base font-bold">{FAMILY[k].label}</h3>
                <StackTable
                  caption={`${name} ${FAMILY[k].label}: the cheapest open listing in each market today`}
                  head={["Market", "Price", "Per pack", "Open at"]}
                  rows={lines.map((l) => ({
                    key: l.r.region,
                    th: (
                      <a href={l.p ? `/${l.r.region}/p/${l.p.slug}` : `/${l.r.region}`} className="font-semibold text-ink hover:text-brand hover:underline">
                        {l.r.name}
                      </a>
                    ),
                    cells: l.p ? [money(l.p.lowestPriceCents, l.r.market), l.perPack != null ? money(l.perPack, l.r.market) : "—", whereOpen(l.p)] : ["None right now", "—", "—"],
                  }))}
                />
              </div>
            );
          })}
        </>
      ),
    };
  });
  const lead = data.sets[0];
  const faqs = countryFaqs(lead ? { name: setByCode(lead)?.name ?? lead, lines: marketLines(data.cards, lead, "play-box") } : null);
  sections.push({
    id: "faq",
    title: "Questions",
    body: (
      <Prose>
        {faqs.map((f) => (
          <div key={f.q}>
            <h3>{f.q}</h3>
            <p>{f.a}</p>
          </div>
        ))}
      </Prose>
    ),
  });
  return {
    intro: (
      <Lede>
        What the cheapest Play Booster box and Collector Booster box of the newest sets cost today in each of the seven markets we compare. Every price is a store’s own, in
        its own currency, excluding shipping: we don’t convert currencies, so convert at your own card’s rate before comparing.
      </Lede>
    ),
    sections,
  };
}

export function CountryBody({ data }: { data: CountryData }) {
  const o = countryOutline(data);
  return (
    <>
      <div className="mt-8">{o.intro}</div>
      {data.sets.length === 0 && (
        <div className="mt-8">
          <NoneYet>No booster box is open in two or more markets right now.</NoneYet>
        </div>
      )}
      {o.sections.map((s) => (
        <section key={s.id} aria-labelledby={s.id} className="mt-12">
          <h2 id={s.id} className="mb-4 font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
            {s.title}
          </h2>
          {s.body}
        </section>
      ))}
    </>
  );
}
