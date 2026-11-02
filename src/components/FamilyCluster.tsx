// "Other card games on sale" (DECISIONS.md "Sites that grow each other", 2026-11-02): one tile per sister
// card site, each with its best real store deal or pre-order today in this region (else the US), read from
// the committed data/public/family/family-cluster.json (lib/family.ts). One block per page; nothing when no
// sister has anything. Plain followed links: our own sites, one cluster, no commission.
import { familyTiles } from "@/lib/family";
import { blockHeading, familyMoney, tileNote } from "@/lib/family-network";
import type { Region } from "@/lib/regions";
import { Section } from "./Section";

export function FamilyCluster({ kind, region }: { kind: "deal" | "preorder"; region: Region }) {
  const tiles = familyTiles(kind, region);
  if (!tiles.length) return null;
  return (
    <Section id="other-games" title={blockHeading("cards", kind)} kicker="Today’s best store price on our sister sites">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(({ site, item, more }) => (
          <li key={site.id} className="card flex min-w-0 gap-3 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- the sister site's own hotlinked photo, like every product photo here */}
            {item.image ? <img src={item.image} alt="" aria-hidden="true" className="h-16 w-14 shrink-0 object-contain" loading="lazy" /> : null}
            <div className="min-w-0 text-sm">
              <p className="eyebrow">{site.topic} · {site.name}</p>
              <a href={item.url} rel="noopener" className="line-clamp-2 font-semibold hover:underline">{item.title}</a>
              <p>
                <span className="font-bold tabular-nums">{familyMoney(item.cents, item.currency)}</span> <span className="text-muted">at {item.store}</span>
              </p>
              <p className="text-xs text-muted">{tileNote(item)}</p>
              {more ? <a href={more} rel="noopener" className="text-xs font-semibold text-brand hover:underline">More on {site.name} →</a> : null}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
