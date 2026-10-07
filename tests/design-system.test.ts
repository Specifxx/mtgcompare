// RiftCompare's tests/design-system.test.ts, ported in wave 2 (2026-10-03):
// the halves that foundation owns — motion tokens, the reduced-motion rule,
// the ui/ primitives, focus rings, the retired OP-only classes. The chrome
// halves (header, rail, menu, template.tsx) arrive with the design track.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { DURATION, EASING, Z } from "../src/lib/motion-tokens";
import tailwindConfig from "../tailwind.config";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const readCode = (p: string) => read(p).replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\/\*[\s\S]*?\*\//g, "");

function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
  );
}
const SOURCES = [...walk("src/app"), ...walk("src/components")].filter((f) => /\.(tsx?|css)$/.test(f));

test("tailwind's motion/z-index tokens equal src/lib/motion-tokens.ts", () => {
  const extend = tailwindConfig.theme?.extend as Record<string, unknown>;
  const duration = extend.transitionDuration as Record<string, string>;
  assert.equal(duration.fast, `${DURATION.fast}ms`);
  assert.equal(duration.base, `${DURATION.base}ms`);
  assert.equal(duration.slow, `${DURATION.slow}ms`);
  assert.equal(duration.page, `${DURATION.page}ms`);

  const timing = extend.transitionTimingFunction as Record<string, string>;
  assert.equal(timing.out, EASING.out);
  assert.equal(timing["in-out"], EASING.inOut);
  assert.equal(timing.DEFAULT, EASING.out);

  const zIndex = extend.zIndex as Record<string, string>;
  for (const [name, value] of Object.entries(Z)) {
    assert.equal(zIndex[name], String(value), `zIndex.${name} must match Z.${name}`);
  }
});

test("the motion values are RiftCompare's, and the z order holds", () => {
  assert.deepEqual({ ...DURATION }, { fast: 120, base: 200, slow: 320, page: 150, count: 1100 });
  assert.equal(EASING.out, "cubic-bezier(0.16, 1, 0.3, 1)");
  assert.equal(EASING.inOut, "cubic-bezier(0.65, 0, 0.35, 1)");
  assert.deepEqual({ ...Z }, { rail: 45, flyout: 30, header: 40, bottombar: 40, dropdown: 50, overlay: 60, nudge: 70, toast: 80, sheet: 85, menu: 95, modal: 120, skip: 200 });
  // Every overlay outranks the page chrome; the modal outranks every other layer.
  for (const k of ["overlay", "nudge", "toast", "sheet", "menu", "modal"] as const) assert.ok(Z[k] > Z.rail && Z[k] > Z.header, k);
  for (const k of Object.keys(Z) as (keyof typeof Z)[]) if (k !== "modal" && k !== "skip") assert.ok(Z.modal > Z[k], `modal > ${k}`);
  const anim = (tailwindConfig.theme?.extend as Record<string, Record<string, string>>).animation;
  assert.equal(anim.marquee, "marquee 42s linear infinite");
  assert.equal(anim["fade-up"], "fade-up 0.5s ease-out both");
  assert.equal(anim["fade-in"], "fade-in 0.6s ease-out both");
});

test("src/lib/motion.ts exports the shared presence/reduced-motion primitives", () => {
  const code = readCode("src/lib/motion.ts");
  assert.match(code, /export function usePresence/);
  assert.match(code, /export function useReducedMotion/);
  assert.match(code, /export function prefersReducedMotion/);
});

test("the reduced-motion @media block is the LAST rule in globals.css", () => {
  const css = read("src/app/globals.css");
  const lastReducedMotion = css.lastIndexOf("@media (prefers-reduced-motion: reduce)");
  assert.ok(lastReducedMotion > -1, "expected the reduced-motion block to exist");
  const closeBrace = css.indexOf("\n}", lastReducedMotion);
  const tail = css.slice(closeBrace + 2).replace(/\/\*[\s\S]*?\*\//g, "").trim();
  assert.equal(tail, "", "the reduced-motion block must stay the LAST rule in globals.css — anything animated must be declared before it");
  const block = css.slice(lastReducedMotion, closeBrace);
  assert.match(block, /animation-delay: 0s !important;/);
  assert.match(block, /#nprogress \{ display: none !important; \}/);
});

test("ui/Dialog.tsx hidden states use motion-safe:, never a bare opacity-0", () => {
  const code = readCode("src/components/ui/Dialog.tsx");
  assert.doesNotMatch(code, /(?<!motion-safe:)(?<!sm:motion-safe:)\bopacity-0\b/);
  assert.match(code, /motion-safe:opacity-0/);
});

test("the ui/ primitives are RiftCompare's, with OP's body flag", () => {
  for (const f of ["Dialog", "EmptyState", "SegmentedTabs", "Skeleton", "Toast", "Tooltip"]) {
    assert.ok(existsSync(join(ROOT, `src/components/ui/${f}.tsx`)), `ui/${f}.tsx`);
  }
  const dialog = read("src/components/ui/Dialog.tsx");
  for (const name of ["useScrollLock", "useModalFlag", "useEscapeLayer"]) assert.match(dialog, new RegExp(`export function ${name}`));
  assert.match(dialog, /document\.body\.dataset\.ocDialog = "1"/);
  assert.doesNotMatch(dialog, /rcDialog/);
  assert.match(dialog, /export type DialogPlacement = "center" \| "top" \| "sheet" \| "right";/);
  const css = read("src/app/globals.css");
  assert.match(css, /body\[data-oc-dialog\] \.above-bottombar\.left-4/);
  assert.doesNotMatch(css, /data-rc-/);
  // The nudges yield to the same flag.
  assert.match(read("src/lib/nudge-runtime.ts"), /dataset\.ocDialog === "1"/);
  // Wave 1's Dialog is a thin re-export that keeps its default-export callers working.
  const shim = readCode("src/components/Dialog.tsx");
  assert.match(shim, /from "\.\/ui\/Dialog"/);
  assert.match(shim, /export default function Dialog/);
  assert.doesNotMatch(shim, /createPortal|requestAnimationFrame/, "no second overlay implementation");
  // PlanDialog uses the shared, refcounted hooks instead of its own lock/flag.
  const plan = readCode("src/components/PlanDialog.tsx");
  assert.match(plan, /useScrollLock\(true\)/);
  assert.match(plan, /useModalFlag\(true\)/);
  assert.match(plan, /useEscapeLayer\(true, onClose\)/);
  assert.doesNotMatch(plan, /dataset\.ocDialog/);
});

test("the old ui.tsx EmptyState is gone; every caller uses ui/EmptyState", () => {
  assert.doesNotMatch(read("src/components/ui.tsx"), /export function EmptyState/);
  for (const f of SOURCES.filter((p) => p.endsWith(".tsx"))) {
    const src = read(f);
    if (!/<EmptyState\b/.test(src) || f === "src/components/ui/EmptyState.tsx") continue;
    assert.match(src, /import \{ EmptyState \} from "@\/components\/ui\/EmptyState"/, f);
  }
});

test("no component hand-rolls the double-rAF entrance — usePresence() covers them", () => {
  const offenders = walk("src/components")
    .filter((f) => f.endsWith(".tsx"))
    .filter((f) => /requestAnimationFrame\(\(\) => requestAnimationFrame\(/.test(readCode(f)));
  assert.deepEqual(offenders, []);
});

test("every outline-none in src/**/*.tsx carries a focus-visible: ring in the same className", () => {
  const offenders: string[] = [];
  for (const f of SOURCES.filter((p) => p.endsWith(".tsx") && !p.includes("/ui/"))) {
    readCode(f)
      .split("\n")
      .forEach((line, i) => {
        if (/\boutline-none\b/.test(line) && !/focus-visible:/.test(line)) offenders.push(`${f}:${i + 1}`);
      });
  }
  assert.deepEqual(offenders, []);
});

test("OP Compare's retired design vocabulary is gone: no straw, no sea, no comic face, no prose-op", () => {
  const cfg = read("tailwind.config.ts");
  const css = read("src/app/globals.css");
  assert.doesNotMatch(cfg, /straw|brand:\s*\[|bob/, "no straw token, no font-brand family, no bob animation");
  assert.doesNotMatch(cfg, /\b300: v\("brand-300"\)/, "brand-300 stays undefined, as on RiftCompare");
  for (const cls of ["--c-straw", "--hero-sea", ".sea-grid", ".btn-straw", ".eyebrow {", ".link {", ".prose-op", ".data-table", ".font-brand"]) {
    assert.ok(!css.includes(cls), `${cls} must be gone from globals.css`);
  }
  const offenders: string[] = [];
  for (const f of SOURCES) {
    const src = f.endsWith(".css") ? read(f) : readCode(f);
    if (/\b(?:text|bg|border|ring|from|to|via)-straw\b|\bfont-brand\b|\bsea-grid\b|var\(--hero-sea\)|\banimate-bob\b|\bprose-op\b|"data-table|className="eyebrow|className="link\b/.test(src)) offenders.push(f);
  }
  assert.deepEqual(offenders, []);
  assert.ok(!existsSync(join(ROOT, "src/lib/theme.ts")));
});

test("fonts: RiftCompare's next/font block on <html>, Fraunces headings, mono numerals", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /import \{ Inter, JetBrains_Mono, Fraunces \} from "next\/font\/google";/);
  assert.match(layout, /const inter = Inter\(\{ subsets: \["latin"\], variable: "--font-sans", display: "swap" \}\);/);
  assert.match(layout, /JetBrains_Mono\(\{ subsets: \["latin"\], variable: "--font-mono", display: "swap", preload: false \}\)/);
  assert.match(layout, /weight: \["600", "700", "900"\],\s*style: \["normal"\],\s*variable: "--font-display",\s*display: "swap",/);
  assert.match(layout, /<html lang="en" data-theme="light" className=\{`\$\{inter\.variable\} \$\{jetbrainsMono\.variable\} \$\{fraunces\.variable\}`\}/);
  assert.match(layout, /<body className="min-h-screen bg-ink-950">/);
  assert.doesNotMatch(readCode("src/app/layout.tsx"), /Luckiest_Guy|Archivo/, "Archivo is the homepage's own import");
  const css = read("src/app/globals.css");
  assert.match(css, /h1, h2, h3 \{\s*font-family: var\(--font-display\), Georgia, serif;\s*font-weight: 700;\s*letter-spacing: -0\.01em;/);
  assert.match(css, /\.rb-eyebrow \{\s*font-family: var\(--font-display\), Georgia, serif;\s*font-weight: 700;\s*text-transform: uppercase;\s*letter-spacing: 0\.08em;\s*font-size: 0\.75rem;/);
  assert.match(css, /\.rb-display-sans h1,[\s\S]*?font-family: var\(--font-riftbound\)/);
  const cfg = read("tailwind.config.ts");
  assert.match(cfg, /display: \["var\(--font-display\)", "Georgia", "Cambria", "Times New Roman", "serif"\]/);
});

test("the layout's main container: skip link, the rail wrapper, container-app on <main>; pages add no outer container", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /href="#main-content"[\s\S]{0,400}Skip to main content/);
  assert.match(layout, /focus:z-\[200\][^"]*focus:min-h-11[^"]*focus:ring-2 focus:ring-brand-400/);
  assert.match(layout, /<div className="pl-\[var\(--sidenav-w\)\]">\s*<main id="main-content" className="container-app min-w-0 py-6">/);
  assert.match(layout, /viewport: Viewport = \{ themeColor: "#f4f6f8" \}/);
  const offenders = walk("src/app")
    .filter((f) => /page\.tsx$/.test(f))
    .filter((f) => /return \(\s*<(?:div|article|section)\s+className="[^"]*\bcontainer-app\b/.test(read(f)));
  assert.deepEqual(offenders, [], "the layout already wraps every page in container-app py-6");
});
