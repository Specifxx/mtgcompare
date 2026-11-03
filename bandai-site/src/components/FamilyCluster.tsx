// "Also in this cluster" (DECISIONS.md "Sites that grow each other", 2026-11-02): one tile per sister
// site in the cluster, each with its best real deal or pre-order today, read from the committed
// family-cluster.json (lib/family.ts). One block per page; nothing when no sister has anything.
// Plain followed links: our own sites, one cluster, no commission.
import { familyTiles } from "@/lib/family";
import { blockHeading, familyMoney, tileNote, type ClusterId, type FamilyRegion } from "@/lib/family-network";

export function FamilyCluster({ cluster, kind, region = "US", title }: { cluster: ClusterId; kind: "deal" | "preorder"; region?: FamilyRegion; title?: string }) {
  const tiles = familyTiles(cluster, kind, region);
  if (!tiles.length) return null;
  const heading = title ?? blockHeading(cluster, kind);
  return (
    <section className="flex flex-col gap-3" aria-labelledby={`family-${cluster}`}>
      <div>
        <h2 id={`family-${cluster}`} className="text-lg font-bold">{heading}</h2>
        <p className="text-sm text-muted">Today&apos;s best store price on each of our sister sites, checked by their own daily price import.</p>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(({ site, item, more }) => (
          <li key={site.id} className="card-surface flex min-w-0 gap-3 p-3">
            {item.image ? <img src={item.image} alt={item.title} className="h-16 w-14 shrink-0 object-contain" loading="lazy" /> : null}
            <div className="min-w-0 text-sm">
              <p className="text-xs uppercase tracking-wide text-brand-400">{site.topic} · {site.name}</p>
              <a href={item.url} rel="noopener" className="line-clamp-2 font-semibold hover:underline">{item.title}</a>
              <p>
                <span className="font-bold tabular-nums">{familyMoney(item.cents, item.currency)}</span> <span className="text-muted">at {item.store}</span>
              </p>
              <p className="text-xs text-muted">{tileNote(item)}</p>
              {more ? <a href={more} rel="noopener" className="text-xs link">More on {site.name} →</a> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
