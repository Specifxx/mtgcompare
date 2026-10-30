import Link from "@/components/Link";
import { CreatorAvatar } from "@/components/creators/CreatorAvatar";
import { featuredCreators } from "@/lib/creators";

// The homepage's way into /creators (owner, 2026-10-30: "have it show on the homepage, as in a link to the creator page"), like
// RiftCompare's CreatorsTeaser: the featured creators' faces and the newest one's name. Static data, server HTML, one followed link.
export function CreatorsTeaser() {
  const creators = featuredCreators().slice(0, 5);
  const first = creators[0];
  if (!first) return null;
  return (
    <Link
      href="/creators"
      className="card group flex flex-col gap-4 p-4 transition-shadow hover:shadow-lift sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div className="flex items-center gap-4">
        <div className="flex shrink-0 -space-x-3">
          {creators.map((c) => (
            <span key={c.slug} className="rounded-full ring-2 ring-[#c13584]/60 ring-offset-2 ring-offset-surface">
              <CreatorAvatar creator={c} size={56} decorative />
            </span>
          ))}
        </div>
        <div className="min-w-0 text-left">
          <p className="eyebrow">Featured creator</p>
          <p className="mt-0.5 font-display text-lg font-bold leading-snug group-hover:text-brand">
            {first.name}
            {first.links[0]?.handle && <span className="ml-2 text-sm font-medium text-muted">{first.links[0].handle}</span>}
          </p>
          <p className="text-sm text-muted">{first.blurb}</p>
        </div>
      </div>
      <span className="btn-ghost min-h-11 shrink-0 px-4">Meet our creators →</span>
    </Link>
  );
}
