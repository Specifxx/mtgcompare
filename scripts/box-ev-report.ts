// Prints each set's box worth from the committed card prices: the check for whoever edits src/content/box-odds.
//   npx tsx scripts/box-ev-report.ts [set code]
import { BOX_ODDS } from "../src/content/box-odds";
import { boxEv, cardChances, notCounted, quantile, simulate, slotEvs } from "../src/lib/box-ev/model";
import { resolveSetBoxes } from "../src/lib/box-ev/load";

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const want = process.argv[2];
for (const odds of BOX_ODDS) {
  if (want && odds.code !== want) continue;
  const r = resolveSetBoxes(odds);
  if (!r) {
    console.log(odds.code, "no card file");
    continue;
  }
  for (const [kind, b] of Object.entries(r.boxes)) {
    if (!b) continue;
    const sim = simulate(b, 2000, 1);
    console.log(`\n${odds.code} ${kind}: EV ${usd(boxEv(b))} ($1 floor ${usd(boxEv(b, 100))}) median ${usd(quantile(sim, 0.5))} p10 ${usd(quantile(sim, 0.1))} p90 ${usd(quantile(sim, 0.9))}`);
    for (const s of slotEvs(b)) console.log(`   ${s.label.padEnd(40)} x${s.count}  ${usd(s.box)}`);
    for (const s of b.slots) {
      const sum = s.outcomes.reduce((t, o) => t + o.pct, 0);
      for (const o of s.outcomes) console.log(`     ${o.found ? " " : "!"} ${o.label.padEnd(52)} ${o.lt1 ? "<1%" : `${o.pct}%`}  cards ${o.cards.length} priced ${o.cards.filter((c) => c.v != null).length}`);
      console.log(`     [${s.label}] sum ${sum.toFixed(1)}%`);
    }
    for (const n of notCounted(b)) console.log("   not counted:", n.slot, "/", n.label, n.why);
    const top = cardChances(b).sort((a, c) => (c.v ?? 0) - (a.v ?? 0)).slice(0, 5);
    for (const c of top) console.log(`   top ${c.n}${c.foil ? " (foil)" : ""} ${usd(c.v ?? 0)} in box ${(c.inBox * 100).toFixed(1)}%`);
  }
}
