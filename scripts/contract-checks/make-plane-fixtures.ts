// checks/make-plane-fixtures.ts (owner WP01b). Regenerates tests/fixtures/plane/*.json: ONE representative file of every published family from the deterministic mini tree (tests/helpers/plane-tree.ts, day 3, phase full), trimmed to a few rows.
// tests/plane-format.test.ts compares them with a fresh generation, so a change of any wire format is an explicit diff of these files in the pull request (WP01b writes the files, WP02 reads them: the two packages meet here).
//   run: npx tsx checks/make-plane-fixtures.ts
import fs from "node:fs";
import path from "node:path";
import { goldenFiles } from "../../tests/helpers/plane-golden";

const out = path.resolve(__dirname, "../../tests/fixtures/plane");
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (f.endsWith(".json")) fs.rmSync(path.join(out, f));
for (const [name, value] of Object.entries(goldenFiles())) fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(value, null, 1) + "\n");
console.log(`wrote ${Object.keys(goldenFiles()).length} fixtures to ${out}`);
