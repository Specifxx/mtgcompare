// Best catalogue match for one free-text line ("2x Elsa - Spirit of Winter
// 207/204"), used by Best Basket and the trade calculator.
import { products, refCents, setById } from "./data";
import { tokens } from "./slug";
import { shortName } from "./names";

export function bestMatch(q: string) {
  const want = tokens(q);
  if (!want.length) return null;
  const num = q.match(/\d+\s*\/\s*\d+|[A-Z]{1,4}\d{0,2}-\d{2,3}/i)?.[0]?.replace(/\s/g, "").toUpperCase();
  let best: { score: number; i: number } | null = null;
  const all = products();
  all.forEach((p, i) => {
    const hay = new Set(tokens(`${p.name} ${setById(p.setId)?.name ?? ""} ${p.number ?? ""}`));
    const hit = want.filter((w) => hay.has(w)).length / want.length;
    const nameTokens = tokens(p.name);
    const cover = nameTokens.filter((t) => want.includes(t)).length / Math.max(1, nameTokens.length);
    let score = hit * 2 + cover;
    if (num && p.number?.toUpperCase().replace(/\s/g, "") === num) score += 3;
    score += Math.log10(1 + (refCents(p.id) ?? 0)) * 0.01;
    if (hit >= 0.75 && (!best || score > best.score)) best = { score, i };
  });
  if (!best) return null;
  const p = all[(best as { i: number }).i];
  return { id: p.id, slug: p.slug, name: shortName(p.name), set: setById(p.setId)?.name ?? "", number: p.number, image: p.image, marketUsd: refCents(p.id) };
}


/** "2x Elsa", "Elsa x2", "2 Elsa" → { qty, query }. */
export function parseLine(line: string): { qty: number; query: string } | null {
  const t = line.trim().replace(/^[-*•]\s*/, "");
  if (!t) return null;
  let m = t.match(/^(\d{1,3})\s*x?\s+(.+)$/i);
  if (m) return { qty: Math.min(99, parseInt(m[1], 10)), query: m[2] };
  m = t.match(/^(.+?)\s+x\s?(\d{1,3})$/i);
  if (m) return { qty: Math.min(99, parseInt(m[2], 10)), query: m[1] };
  return { qty: 1, query: t };
}
