import type { Post } from "./types";

// Facts: TCGplayer's Union Arena rarities (category 81) on 2026-11-03: Common,
// Uncommon, Rare and Super Rare, each with 1-Star versions, Super Rare also 2-
// and 3-Star, plus Action Point cards; product names mark them (R*), (SR***).
export const post: Post = {
  slug: "union-arena-star-rarities-explained",
  title: "Union Arena star rarities explained: SR, SR*, SR** and SR***",
  description: "What the stars after a Union Arena rarity mean, why one card number can sell for a few dollars or a few hundred, and how to check you are buying the right version.",
  date: "2026-11-03",
  keywords: ["union arena rarities", "union arena sr***", "union arena star rarity", "union arena 3 star", "union arena super rare 3 star"],
  html: `
<p>Union Arena prints the same card in more than one version. The base card has a plain rarity: <b>C</b> (Common), <b>U</b> (Uncommon), <b>R</b> (Rare) or <b>SR</b> (Super Rare). Its special versions add stars: <b>R*</b>, <b>SR*</b>, <b>SR**</b> and <b>SR***</b>.</p>

<h2>Same number, different card</h2>
<p>A star version keeps the card's number. Rem (053) in the Re:ZERO set is UE24BT/REZ-1-053 whether it is the SR or the SR***, so a listing that shows only the number does not tell you which one you are buying. The more stars, the rarer the version, and the price gap between an SR and its SR*** is often a hundred times or more.</p>

<h2>What TCGplayer calls them</h2>
<ul>
<li><b>Super Rare 3-Star</b>: SR***, the set's top chase cards.</li>
<li><b>Super Rare 2-Star</b> and <b>1-Star</b>: SR** and SR*.</li>
<li><b>Rare 1-Star</b>, <b>Uncommon 1-Star</b>, <b>Common 1-Star</b>: alternate versions of lower-rarity cards.</li>
<li><b>Action Point</b> cards: the AP cards every deck uses, some with star versions too.</li>
</ul>

<h2>How this site keeps them apart</h2>
<p>A store or eBay listing is only matched to a card when its number and name agree, and when the listing names a rarity it must be that card's own. An "SR***" listing is never shown as the price of the plain SR, and the reverse.</p>

<h2>See the prices</h2>
<p>The <a href="/games/union-arena">Union Arena page</a> lists every set and the most valuable cards; the <a href="/cards">card list</a> filters by rarity.</p>
`,
};
