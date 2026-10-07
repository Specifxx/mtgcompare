// Which cards and sealed products a post talks about, read from the post's own
// (unrendered) React tree — so the shop strip follows the post as it is
// written, with no list to keep in step. Pure: tests/blog-mentions.test.ts.
//
// A post names a card three ways, all found here: a CardLite in a prop (`c` on
// CardLink, the `cards` array on CardTable, anything shaped like one), or a
// link whose href is /card/<slug> or /sealed/<slug>.
import { isValidElement, type ReactNode } from "react";

export interface Mentions {
  /** Card slugs, in order of first mention. */
  cards: string[];
  /** Sealed product slugs, in order of first mention. */
  sealed: string[];
}

function isCardLike(v: unknown): v is { slug: string } {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === "number" && typeof o.slug === "string" && "marketUsd" in o && "low" in o && "setId" in o;
}

export function collectMentions(node: ReactNode, out: Mentions = { cards: [], sealed: [] }, depth = 0): Mentions {
  if (depth > 40 || node == null || typeof node === "boolean" || typeof node === "string" || typeof node === "number") return out;
  if (Array.isArray(node)) {
    for (const n of node) collectMentions(n as ReactNode, out, depth + 1);
    return out;
  }
  if (!isValidElement(node)) return out;
  const props = (node.props ?? {}) as Record<string, unknown>;
  const addCard = (slug: string) => {
    if (slug && !out.cards.includes(slug)) out.cards.push(slug);
  };
  // A prop can hold a card, a list of cards, or more markup: SimpleTable's
  // `rows` is an array of rows, each an array of cells that may be <Link>s.
  const walk = (v: unknown, d: number) => {
    if (d > 6) return;
    if (isCardLike(v)) addCard(v.slug);
    else if (Array.isArray(v)) for (const x of v) walk(x, d + 1);
    else if (isValidElement(v)) collectMentions(v, out, depth + 1);
  };
  for (const [k, v] of Object.entries(props)) {
    if (k === "children") continue;
    if (k === "href" && typeof v === "string") {
      const m = /^\/(card|sealed)\/([^/?#]+)/.exec(v);
      if (m) {
        const slug = decodeURIComponent(m[2]);
        if (m[1] === "card") addCard(slug);
        else if (!out.sealed.includes(slug)) out.sealed.push(slug);
      }
    } else walk(v, 0);
  }
  collectMentions(props.children as ReactNode, out, depth + 1);
  return out;
}
