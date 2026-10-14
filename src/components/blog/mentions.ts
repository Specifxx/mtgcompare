// Which cards and sealed products a post talks about, read from the post's own
// (unrendered) React tree — so the shop strip follows the post as it is
// written, with no list to keep in step. Pure: tests/blog-mentions.test.ts.
//
// A post names a card three ways, all found here: a CardLite in a prop (`c` on
// CardLink, the `cards` array on CardTable, anything shaped like one), or a
// link whose href is /card/<slug> or /sealed/<slug>.
//
// A price belongs to a (product, finish), so a mention keeps its UNIT too: a
// link's ?finish= (the card page's own parameter) or a card object's shown
// finish (`headFinish`, which a unit view sets). The shop strip then prices the
// unit the post priced: a foil row in a table is a foil row in the strip.
import { isValidElement, type ReactNode } from "react";
import { parseFinishParam, type Finish } from "@/lib/constants";
import type { CardLite } from "@/lib/data";

/** A card the post names, in the finish it names (null: the card page's default, the headline unit). */
export interface MentionUnit {
  slug: string;
  finish: Finish | null;
}

export interface Mentions {
  /** Card slugs, in order of first mention. */
  cards: string[];
  /** The same mentions as units, in order of first mention; one entry per (slug, finish). */
  units: MentionUnit[];
  /** Sealed product slugs, in order of first mention. */
  sealed: string[];
}

function isCardLike(v: unknown): v is { slug: string; headFinish?: unknown } {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === "number" && typeof o.slug === "string" && "marketUsd" in o && "low" in o && "setId" in o;
}

export function collectMentions(node: ReactNode, out: Mentions = { cards: [], units: [], sealed: [] }, depth = 0): Mentions {
  if (depth > 40 || node == null || typeof node === "boolean" || typeof node === "string" || typeof node === "number") return out;
  if (Array.isArray(node)) {
    for (const n of node) collectMentions(n as ReactNode, out, depth + 1);
    return out;
  }
  if (!isValidElement(node)) return out;
  const props = (node.props ?? {}) as Record<string, unknown>;
  const addCard = (slug: string, finish: Finish | null) => {
    if (!slug) return;
    if (!out.cards.includes(slug)) out.cards.push(slug);
    if (!out.units.some((u) => u.slug === slug && u.finish === finish)) out.units.push({ slug, finish });
  };
  // A prop can hold a card, a list of cards, or more markup: SimpleTable's
  // `rows` is an array of rows, each an array of cells that may be <Link>s.
  const walk = (v: unknown, d: number) => {
    if (d > 6) return;
    if (isCardLike(v)) addCard(v.slug, v.headFinish === "N" || v.headFinish === "F" ? v.headFinish : null);
    else if (Array.isArray(v)) for (const x of v) walk(x, d + 1);
    else if (isValidElement(v)) collectMentions(v, out, depth + 1);
  };
  for (const [k, v] of Object.entries(props)) {
    if (k === "children") continue;
    if (k === "href" && typeof v === "string") {
      const m = /^\/(card|sealed)\/([^/?#]+)(?:\?([^#]*))?/.exec(v);
      if (m) {
        const slug = decodeURIComponent(m[2]);
        if (m[1] === "card") addCard(slug, parseFinishParam(new URLSearchParams(m[3] ?? "").get("finish"))?.finish ?? null);
        else if (!out.sealed.includes(slug)) out.sealed.push(slug);
      }
    } else walk(v, 0);
  }
  collectMentions(props.children as ReactNode, out, depth + 1);
  return out;
}

/** One row of the shop strip: a card in one finish. `headline` is true when that finish is the card's own default (the plain lookup already holds its price). */
export interface ShopPick {
  id: number;
  slug: string;
  finish: Finish;
  headline: boolean;
}

/**
 * The units the shop strip prices, in order of first mention, one per (card,
 * finish): a mention's own finish, else the card's headline. `bySlug` is the
 * plain lookup of the mentioned slugs (headline units); a slug it lacks is
 * dropped. A pick that is not the headline needs a unit view
 * (getCardsByIds(ids, { unit })) before it can be shown.
 */
export function shopPicks(units: readonly MentionUnit[], bySlug: ReadonlyMap<string, Pick<CardLite, "id" | "headFinish">>, max = 6): ShopPick[] {
  const out: ShopPick[] = [];
  for (const u of units) {
    if (out.length >= max) break;
    const c = bySlug.get(u.slug);
    if (!c) continue;
    const finish = u.finish ?? c.headFinish;
    if (out.some((p) => p.id === c.id && p.finish === finish)) continue;
    out.push({ id: c.id, slug: u.slug, finish, headline: finish === c.headFinish });
  }
  return out;
}

/** The strip's cards for the picks: the headline lite, or the unit view of the named finish (absent: the pick is dropped, never shown in another finish). */
export function shopCards<T extends CardLite>(picks: readonly ShopPick[], bySlug: ReadonlyMap<string, T>, unitView: (id: number, finish: Finish) => T | undefined): T[] {
  return picks.map((p) => (p.headline ? bySlug.get(p.slug) : unitView(p.id, p.finish))).filter((c): c is T => c != null);
}
