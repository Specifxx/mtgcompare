import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h, Fragment } from "react";
import { collectMentions } from "../src/components/blog/mentions";

const card = (id: number, slug: string) => ({ id, slug, name: slug, setId: 1, marketUsd: 100, low: {} });
function Table(_: { cards: unknown[] }) {
  return null;
}
function CardLink(_: { c: unknown }) {
  return null;
}

test("collects cards from props and links, in order of first mention", () => {
  const tree = [
    h("p", null, "Intro ", h(CardLink, { c: card(1, "lightning-bolt") }), " and ", h("a", { href: "/card/sol-ring" }, "Sol Ring")),
    h(Fragment, null, h(Table, { cards: [card(2, "counterspell"), card(1, "lightning-bolt")] })),
    h("div", null, h("a", { href: "/sealed/mh3-collector-booster-box" }, "box"), h("a", { href: "/sets/modern-horizons-3" }, "set"), h("a", { href: "https://example.com/card/x" }, "x")),
  ];
  const m = collectMentions(tree);
  assert.deepEqual(m.cards, ["lightning-bolt", "sol-ring", "counterspell"]);
  assert.deepEqual(m.sealed, ["mh3-collector-booster-box"]);
});

test("ignores plain text, nulls and lookalike objects", () => {
  assert.deepEqual(collectMentions(null), { cards: [], sealed: [] });
  assert.deepEqual(collectMentions(h("p", { data: { slug: "nope" } }, "text", false, 3)), { cards: [], sealed: [] });
});

test("finds links nested in a table's rows prop (SimpleTable rows = cells of markup)", () => {
  function SimpleTable(_: { rows: unknown[][] }) {
    return null;
  }
  const rows = [
    [h("a", { key: "n", href: "/sealed/otj-play-booster-box" }, "OTJ"), "US$100"],
    [h("a", { key: "n", href: "/sealed/mh3-collector-booster-box" }, "MH3"), "US$900"],
  ];
  const m = collectMentions([h("p", null, h("a", { href: "/sealed/mh3-collector-booster-box" }, "MH3")), h(SimpleTable, { rows })]);
  assert.deepEqual(m.sealed, ["mh3-collector-booster-box", "otj-play-booster-box"]);
});
