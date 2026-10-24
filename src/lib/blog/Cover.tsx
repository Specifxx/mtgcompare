// A post's thumbnail on /blog and under "More from the blog": the set's own cards (Scryfall's whole-card images, hotlinked
// unmodified, fanned over the brand band) for a post about a set, else the post's share image (/og/blog/<slug>). From the
// registry and the card lists alone: the index reads no data.
import { REALITY_FRACTURE_MYTHICS, scryfallNormal, STAR_TREK_MYTHICS, type ScryfallCard } from "@/content/set-reveals";
import type { Post } from "./index";

/** Three cards per set post, a different three per post so no two thumbnails are the same. */
export function coverCards(p: Pick<Post, "slug">, index: number): ScryfallCard[] | null {
  const list = p.slug.includes("star-trek") ? STAR_TREK_MYTHICS : p.slug.startsWith("reality-fracture") ? REALITY_FRACTURE_MYTHICS : null;
  if (!list || list.length < 3) return null;
  const start = (index * 3) % list.length;
  return [0, 1, 2].map((i) => list[(start + i) % list.length]);
}

export function PostCover({ post, index, eager = false }: { post: Post; index: number; eager?: boolean }) {
  const cards = coverCards(post, index);
  const loading = eager ? "eager" : "lazy";
  if (!cards)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/og/blog/${post.slug}`}
        alt=""
        width={1200}
        height={630}
        loading={loading}
        decoding="async"
        className="aspect-[1200/630] h-auto w-full bg-raised object-cover"
      />
    );
  return (
    <div aria-hidden="true" className="relative aspect-[1200/630] overflow-hidden bg-gradient-to-br from-[#2a1250] via-[#1d1340] to-[#0f1013]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_50%_100%,rgb(195_148_244/0.35),transparent_70%)]" />
      <div className="absolute inset-x-0 bottom-[-18%] flex items-end justify-center">
        {cards.map((c, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={c.number}
            src={scryfallNormal(c.image)}
            alt=""
            width={488}
            height={680}
            loading={loading}
            decoding="async"
            className={`w-[30%] rounded-[4.75%/3.5%] shadow-[0_10px_30px_-8px_rgb(0_0_0/0.7)] transition-transform duration-300 ${
              i === 0 ? "-mr-[6%] translate-y-[6%] -rotate-[9deg] group-hover:-rotate-[11deg]" : i === 2 ? "-ml-[6%] translate-y-[6%] rotate-[9deg] group-hover:rotate-[11deg]" : "relative z-10 group-hover:-translate-y-[3%]"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
