import { familySearchLinks } from "@/lib/family-search";

/**
 * "Searching another game?" under a search here: the same words on each other
 * card-game site (lib/family-search.ts), so a Riftbound or One Piece name typed
 * here finds its own site instead of a dead end. Search links, so nofollow: a
 * site-search results page is noindex on every sister site.
 */
export function FamilySearch({ q, className }: { q: string; className?: string }) {
  const links = familySearchLinks(q);
  if (!links.length) return null;
  return (
    <p data-family-search className={`text-sm text-muted ${className ?? ""}`}>
      Searching another game? Look up &ldquo;{q.trim().slice(0, 80)}&rdquo; on{" "}
      {links.map((l, i) => (
        <span key={l.key}>
          <a href={l.href} target="_blank" rel="noopener nofollow" className="font-semibold text-brand hover:underline">
            {l.name}
          </a>{" "}
          ({l.game}){i < links.length - 2 ? ", " : i === links.length - 2 ? " or " : "."}
        </span>
      ))}
    </p>
  );
}
