// Live data inside blog posts, so "updated daily" is true without anyone
// editing them. Tokens in a post's html:
//   {{price:ID}}             TCGplayer market price of product ID
//   {{toplist:SETID:N}}      table of the N most valuable cards in a set
//   {{topall:N}}             the N most valuable cards in the game
//   {{rarity:NAME:N}}        the N most valuable cards of one rarity
//   {{sealed:SETID}}         the set's sealed products, cheapest in-stock offer
//   {{card:ID}}              link to a product page with its name
//   {{attrstats:FACET}}      per value of an attribute hub (SITE.cardHubs): cards, median, $10+, most valuable
import { byValue, priceOf, productById, products, productsInSet, refCents, setById, summaryOf } from "./data";
import { money, pct } from "./format";
import { shortName } from "./names";
import { escapeHtml } from "./html";
import { sourceNameServer } from "./sources";
import type { Product } from "./site-types";
import { facetStats } from "./hubs";

function table(rows: Product[], withSet: boolean): string {
  const tr = rows
    .map((p, i) => {
      const e = summaryOf(p.id);
      return `<tr><td>${i + 1}</td><td><a href="/card/${p.slug}">${escapeHtml(shortName(p.name))}</a>${p.number ? ` <span style="opacity:.6">${escapeHtml(p.number)}</span>` : ""}</td>${withSet ? `<td>${escapeHtml(setById(p.setId)?.name ?? "")}</td>` : ""}<td>${escapeHtml(p.rarity ?? "")}</td><td><b>${money(refCents(p.id))}</b></td><td>${pct(e.change7d)}</td></tr>`;
    })
    .join("");
  return `<table><thead><tr><th>#</th><th>Card</th>${withSet ? "<th>Set</th>" : ""}<th>Rarity</th><th>Market</th><th>7d</th></tr></thead><tbody>${tr}</tbody></table>`;
}

export function renderPost(html: string): string {
  return html
    .replace(/\{\{price:(\d+)\}\}/g, (_, id) => money(refCents(Number(id))))
    .replace(/\{\{card:(\d+)\}\}/g, (_, id) => {
      const p = productById(Number(id));
      return p ? `<a href="/card/${p.slug}">${escapeHtml(shortName(p.name))}</a>` : "";
    })
    .replace(/\{\{toplist:(\d+):(\d+)\}\}/g, (_, s, n) => table(byValue(productsInSet(Number(s)).filter((p) => p.kind === "card")).slice(0, Number(n)), false))
    .replace(/\{\{topall:(\d+)\}\}/g, (_, n) => table(byValue(products().filter((p) => p.kind === "card")).slice(0, Number(n)), true))
    .replace(/\{\{rarity:([^:}]+):(\d+)\}\}/g, (_, r, n) => table(byValue(products().filter((p) => p.kind === "card" && p.rarity === r)).slice(0, Number(n)), true))
    .replace(/\{\{attrstats:([a-z0-9-]+)\}\}/g, (_, f) => {
      const rows = facetStats(f)
        .map((r) => `<tr><td><a href="/cards/${f}/${r.hub.slug}">${escapeHtml(r.hub.label)}</a></td><td>${r.count}</td><td>${money(r.median)}</td><td>${r.over10}</td><td>${r.top ? `<a href="/card/${r.top.slug}">${escapeHtml(shortName(r.top.name))}</a> ${money(refCents(r.top.id))}` : "—"}</td></tr>`)
        .join("");
      return rows ? `<table><thead><tr><th></th><th>Cards</th><th>Median</th><th>$10+</th><th>Most valuable</th></tr></thead><tbody>${rows}</tbody></table>` : "";
    })
    .replace(/\{\{sealed:(\d+)\}\}/g, (_, s) => {
      const rows = byValue(productsInSet(Number(s)).filter((p) => p.kind === "sealed"))
        .map((p) => {
          const best = priceOf(p.id).offers.find((o) => o.inStock && o.source !== "tcgplayer");
          return `<tr><td><a href="/card/${p.slug}">${escapeHtml(shortName(p.name))}</a></td><td>${money(refCents(p.id))}</td><td>${best ? `${money(best.cents, best.currency)} at ${escapeHtml(sourceNameServer(best))}` : "—"}</td></tr>`;
        })
        .join("");
      return `<table><thead><tr><th>Product</th><th>TCGplayer market</th><th>Cheapest store listing</th></tr></thead><tbody>${rows}</tbody></table>`;
    });
}
