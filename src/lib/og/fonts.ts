// The brand fonts for share images, bundled as TTF (satori cannot read WOFF2).
// next/og ships only Noto Sans Regular, so without these every "bold" heading
// silently renders at 400 and nothing looks like the site (DECISIONS, share
// images). Register every weight a composition uses: satori picks the nearest
// registered weight and never synthesises bold.
//
// Read from src/lib/og/fonts at runtime (nodejs routes only). next.config.js
// traces the folder into every opengraph-image function. Any failure returns
// [] and the image renders in Noto: degraded, never a 500.
import { readFile } from "node:fs/promises";
import path from "node:path";

type Weight = 400 | 600 | 700 | 900;
export interface OgFont {
  name: string;
  data: ArrayBuffer;
  weight: Weight;
  style: "normal";
}

export const OG_FONT_FILES: { name: string; file: string; weight: Weight }[] = [
  { name: "Cinzel", file: "Cinzel-900.ttf", weight: 900 },
  { name: "Archivo", file: "Archivo-900.ttf", weight: 900 },
  { name: "Inter", file: "Inter-600.ttf", weight: 600 },
  { name: "Inter", file: "Inter-700.ttf", weight: 700 },
  { name: "JetBrains Mono", file: "JetBrainsMono-700.ttf", weight: 700 },
];

export const OG_FONT_DIR = path.join(process.cwd(), "src", "lib", "og", "fonts");

/** TrueType (00 01 00 00 / "true") or CFF OpenType ("OTTO"); never WOFF/WOFF2. */
export function isSfnt(buf: Uint8Array): boolean {
  if (buf.length < 4) return false;
  const tag = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
  return (buf[0] === 0 && buf[1] === 1 && buf[2] === 0 && buf[3] === 0) || tag === "true" || tag === "OTTO";
}

let memo: Promise<OgFont[]> | null = null;

export function loadOgFonts(dir: string = OG_FONT_DIR): Promise<OgFont[]> {
  if (dir === OG_FONT_DIR && memo) return memo;
  const p = Promise.all(
    OG_FONT_FILES.map(async (f): Promise<OgFont> => {
      const buf = await readFile(path.join(dir, f.file));
      if (!isSfnt(buf)) throw new Error(`${f.file} is not a TTF/OTF font`);
      const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      return { name: f.name, data, weight: f.weight, style: "normal" };
    }),
  ).catch((err) => {
    console.error("[og] brand fonts unavailable, rendering in Noto:", err instanceof Error ? err.message : err);
    if (dir === OG_FONT_DIR) memo = null; // try again on the next render
    return [] as OgFont[];
  });
  if (dir === OG_FONT_DIR) memo = p;
  return p;
}
