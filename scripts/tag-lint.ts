// Stops the build when a paid link would go out untagged (src/lib/tag-lint.ts).
import { tagLintProblems } from "../src/lib/tag-lint";

const problems = tagLintProblems();
if (problems.length) {
  console.error(`tag-lint: ${problems.length} paid link problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("tag-lint: every eBay and TCGplayer link builder is tagged in every market");
