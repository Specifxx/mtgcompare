import { SITE } from "@/site.config";
import { familySearchLinks } from "@/lib/family-search";

/**
 * "Searching another game?" under /cards search results: the same words on
 * each card-game sister site (lib/family-search.ts), so a Pokémon or One Piece
 * name typed here finds its own site instead of a dead end. Search links, so
 * nofollow: a site-search results page is noindex on every sister site.
 */
export function FamilySearch({ q, className = "" }: { q: string; className?: string }) {
  const links = familySearchLinks(SITE.sisterSites, q);
  if (!links.length) return null;
  return (
    <p data-family-search className={`text-sm text-muted ${className}`}>
      Searching another game? Look up “{q.trim().slice(0, 80)}” on{" "}
      {links.map((l, i) => (
        <span key={l.name}>
          <a href={l.href} target="_blank" rel="noopener nofollow" className="link">
            {l.name}
          </a>{" "}
          ({l.game}){i < links.length - 2 ? ", " : i === links.length - 2 ? " or " : "."}
        </span>
      ))}
    </p>
  );
}
