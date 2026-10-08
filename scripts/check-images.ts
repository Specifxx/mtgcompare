// scripts/check-images.ts (owner WP19, parity P04/P42; ported from RiftCompare's build-time image guard). A gate over the SOURCE, DB-free and network-free, run by ci.yml and ci-build.yml; exit 1 on a problem.
//
//   1. LARGE IMAGES   no file served out of public/ may exceed 150 KB (a card page is the heaviest page; a hero PNG of 2 MB is the usual regression).
//   2. MISSING ALT    every <img> and next/image <Image> in src/ carries an `alt` attribute. An explicitly EMPTY alt is allowed (the correct markup for a decorative image); an ABSENT one is not. The descriptive text of a card
//                     image (set, collector number, finish) is src/lib/image-alt.ts and tests/image-alt-text.test.ts (WP06); this is the backstop that nothing ships with no alt at all. Markdown images in src/lib are checked too.
//   3. SCRYFALL       Scryfall's image rules (contract 4.6): hotlink unmodified, never through the Next image optimiser. next.config.js must not list a Scryfall host in images.remotePatterns or images.domains.
//
// Separate from scripts/contract-checks/check-images.ts (WP01a), which checks the image URL FUNCTIONS of src/lib/images.ts against the fixtures.
import fs from "node:fs";
import path from "node:path";

export const MAX_BYTES = 150 * 1024;
const SERVED_IMAGE = /\.(png|jpe?g|webp|avif|gif)$/i;

/** Blank out COMMENTS ONLY, keeping every character position so line numbers stay right. Strings and template literals are left intact (but tracked, so a `//` inside one is not read as a comment): the embeddable widgets build HTML in template strings and those <img> need an alt too. */
export function blankComments(src: string): string {
  const out = src.split(""); let i = 0;
  const blank = (from: number, to: number): void => { for (let k = from; k < to && k < out.length; k++) if (out[k] !== "\n") out[k] = " "; };
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === "//") { const end = src.indexOf("\n", i); blank(i, end === -1 ? src.length : end); i = end === -1 ? src.length : end; continue; }
    if (two === "/*") { const end = src.indexOf("*/", i + 2); blank(i, end === -1 ? src.length : end + 2); i = end === -1 ? src.length : end + 2; continue; }
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") { let j = i + 1; while (j < src.length && src[j] !== ch) { if (src[j] === "\\") j++; j++; } i = j + 1; continue; }
    i++;
  }
  return out.join("");
}
/** The end of an opening tag, ignoring a `>` inside a JSX expression container (`className={a > b ? ...}`) or a quoted string. */
export function tagEnd(src: string, start: number): number {
  let depth = 0, quote: string | null = null;
  for (let j = start; j < src.length; j++) {
    const ch = src[j]!;
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0) return j;
  }
  return src.length - 1;
}
export interface Problem { rule: "LARGE IMAGE" | "MISSING ALT" | "SCRYFALL OPTIMISER"; where: string; message: string }
/** Tags without an alt attribute in one source file. `file` only labels the report. */
export function missingAlt(raw: string, file: string): Problem[] {
  const out: Problem[] = [], src = blankComments(raw), re = /<(img|Image)(?=[\s/>])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const tag = raw.slice(m.index, tagEnd(src, m.index) + 1);
    if (!/\balt\s*=/.test(tag)) out.push({ rule: "MISSING ALT", where: `${file}:${raw.slice(0, m.index).split("\n").length}`, message: `<${m[1]}> has no alt attribute. Use a descriptive alt (src/lib/image-alt.ts) or alt="" if the image is purely decorative.` });
  }
  return out;
}
/** Markdown images with no alt text (the article renderer passes `![](...)` straight to the <img>). */
export function markdownMissingAlt(raw: string, file: string): Problem[] {
  const out: Problem[] = [], re = /!\[([^\]]*)\]\(([^)]+)\)/g; let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) if (!m[1]!.trim()) out.push({ rule: "MISSING ALT", where: `${file}:${raw.slice(0, m.index).split("\n").length}`, message: `markdown image ![](${m[2]}) has no alt text.` });
  return out;
}
/** Scryfall hosts in the image optimiser's allow-list (contract 4.6: hotlink unmodified, never through the optimiser). */
export function scryfallInOptimiser(nextConfig: string): Problem[] {
  const code = blankComments(nextConfig), m = /images\s*:\s*\{([\s\S]*?)\n\s{0,4}\}/.exec(code);
  if (!m) return [];
  return /scryfall/i.test(m[1]!) ? [{ rule: "SCRYFALL OPTIMISER", where: "next.config.js", message: "a Scryfall host is in images.remotePatterns/domains: Scryfall images are hotlinked unmodified and must never go through the Next image optimiser" }] : [];
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.name === "node_modules" || e.name === ".next" ? [] : e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}
export function run(root: string): { problems: Problem[]; checked: number } {
  const problems: Problem[] = []; let checked = 0;
  for (const f of walk(path.join(root, "public")).filter((x) => SERVED_IMAGE.test(x))) {
    checked++; const bytes = fs.statSync(f).size;
    if (bytes > MAX_BYTES) problems.push({ rule: "LARGE IMAGE", where: path.relative(root, f), message: `${Math.round(bytes / 1024)} KB (budget ${MAX_BYTES / 1024} KB): resize or recompress the source` });
  }
  for (const f of walk(path.join(root, "src")).filter((x) => /\.tsx?$/.test(x))) {
    const raw = fs.readFileSync(f, "utf8"), rel = path.relative(root, f);
    checked += (blankComments(raw).match(/<(img|Image)(?=[\s/>])/g) ?? []).length;
    problems.push(...missingAlt(raw, rel));
    if (f.includes(`${path.sep}lib${path.sep}`)) problems.push(...markdownMissingAlt(raw, rel));
  }
  const nc = path.join(root, "next.config.js");
  if (fs.existsSync(nc)) problems.push(...scryfallInOptimiser(fs.readFileSync(nc, "utf8")));
  return { problems, checked };
}
if (process.argv[1] && /scripts[\\/]check-images\.ts$/.test(process.argv[1])) {
  const { problems, checked } = run(process.cwd());
  if (problems.length) {
    console.error(`\nImage guard FAILED: ${problems.length} problem(s)`);
    for (const p of problems) console.error(`  - ${p.rule}  ${p.where}: ${p.message}`);
    process.exit(1);
  }
  console.log(`[check-images] ${checked} images and tags checked: every one under ${MAX_BYTES / 1024} KB and carrying alt; no Scryfall host in the optimiser.`);
}
