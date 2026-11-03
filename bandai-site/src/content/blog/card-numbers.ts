import type { Post } from "./types";

// Facts: TCGplayer's card numbers in categories 81 (Union Arena), 80 (Fusion
// World) and 63 (Digimon) on 2026-11-03.
export const post: Post = {
  slug: "union-arena-fusion-world-digimon-card-numbers",
  title: "How to read Union Arena, Fusion World and Digimon card numbers",
  description: "What UE24BT/REZ-1-053, FB11-084 and BT25-104 mean, and why searching by card number is the quickest way to find the exact card you want at the best price.",
  date: "2026-11-03",
  keywords: ["union arena card number", "fusion world card number", "digimon card number", "fb01 card list", "digimon bt card number"],
  html: `
<p>Every card in these three games carries a code that says which set it is from and where it sits in that set. Searching by that code is the most reliable way to find one exact card.</p>

<h2>Union Arena: UE24BT/REZ-1-053</h2>
<ul>
<li><b>UE24BT</b>: the product it came from (UE booster 24, Re:ZERO).</li>
<li><b>REZ</b>: the series.</li>
<li><b>1</b>: the series' volume. A second volume of the same anime is printed as 2.</li>
<li><b>053</b>: the card's number. Action Point cards use AP and a number instead (REZ-1-AP05).</li>
</ul>
<p>Stores usually write only the last part, REZ-1-053. The star versions of a card share its number, so check the rarity too.</p>

<h2>Dragon Ball Super Fusion World: FB11-084</h2>
<p><b>FB11</b> is the eleventh booster set and <b>084</b> the card's number. Starter deck cards start with FS (FS02), and some other products use their own prefix, like ST01 in Story Booster 01. Alternate-art versions keep the base card's number.</p>

<h2>Digimon Card Game: BT25-104</h2>
<p><b>BT25</b> is booster set 25, <b>EX</b> marks extra boosters and <b>ST</b> starter decks; the number follows. TCGplayer adds the rarity after it (BT25-104 SEC), and Rare Pull and alternate-art versions keep the base card's number.</p>

<h2>Search by number</h2>
<p>Type a code like FB11-084 or BT25-104 into the search box on any page to jump straight to that card's prices at every store.</p>
`,
};
