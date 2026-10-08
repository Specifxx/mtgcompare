// Writes the logo and favicon set from the mark geometry in src/components/Logo.tsx:
//   src/app/icon.svg (browsers), src/app/apple-icon.png (180, full-bleed square),
//   public/logo-mark.svg (full colour), public/logo-mask.svg (BrandLogo's mask),
//   public/icon-192.png, public/icon-512.png (manifest) and
//   public/icon-maskable-512.png (manifest, purpose "maskable").
// Run: npm run icons
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { MARK_COLORS as C, MARK_PATHS } from "../src/components/Logo";

const TILE = "#0c0b14"; // = THEME_COLOR.dark
const GLOW = "#1d1740";
const EDGE = "#2f2b4d";

const defs = `
  <defs>
    <linearGradient id="v" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="${C.violetTop}"/><stop offset="1" stop-color="${C.violetBottom}"/></linearGradient>
    <linearGradient id="b" x1="0.4" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.brassTop}"/><stop offset="1" stop-color="${C.brassBottom}"/></linearGradient>
    <radialGradient id="g" cx="0.5" cy="0" r="0.9"><stop offset="0" stop-color="${GLOW}"/><stop offset="1" stop-color="${TILE}"/></radialGradient>
    <clipPath id="l"><path d="${MARK_PATHS.left}"/></clipPath>
  </defs>`;

const markGroup = (transform = "") => `
  <g${transform ? ` transform="${transform}"` : ""}>
    <path d="${MARK_PATHS.left}" fill="url(#v)"/>
    <path d="${MARK_PATHS.right}" fill="url(#b)"/>
    <path d="${MARK_PATHS.right}" fill="${C.ivory}" clip-path="url(#l)"/>
  </g>`;

type Tile = "rounded" | "square" | "none";
function svg(tile: Tile, size = 64, scale = 0.82): string {
  const t = ((64 - 64 * scale) / 2).toFixed(2);
  const bg =
    tile === "rounded"
      ? `<rect x="0" y="0" width="64" height="64" rx="14" fill="url(#g)"/><rect x="1" y="1" width="62" height="62" rx="13" fill="none" stroke="${EDGE}" stroke-width="1.2"/>`
      : tile === "square"
        ? `<rect x="0" y="0" width="64" height="64" fill="url(#g)"/>`
        : "";
  const g = tile === "none" ? markGroup() : markGroup(`translate(${t} ${t}) scale(${scale})`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${defs}\n  ${bg}${g}\n</svg>\n`;
}

// One-colour alpha mask for BrandLogo: both rhombi in one path, even-odd, so the
// overlap is a hole. Black on transparent; the CSS gradient shows through it.
const maskSvg = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">\n  <path fill="#000" fill-rule="evenodd" d="${MARK_PATHS.left}${MARK_PATHS.right}"/>\n</svg>\n`;

async function main() {
  const root = path.resolve(__dirname, "..");
  fs.writeFileSync(path.join(root, "src/app/icon.svg"), svg("rounded"));
  fs.writeFileSync(path.join(root, "public/logo-mark.svg"), svg("none"));
  fs.writeFileSync(path.join(root, "public/logo-mask.svg"), maskSvg());
  const png = (tile: Tile, size: number, scale?: number) => sharp(Buffer.from(svg(tile, size, scale)), { density: 300 }).resize(size, size).png().toBuffer();
  // iOS rounds the corners itself and fills transparency with black: ship a full-bleed square.
  fs.writeFileSync(path.join(root, "src/app/apple-icon.png"), await png("square", 180));
  fs.writeFileSync(path.join(root, "public/icon-192.png"), await png("rounded", 192));
  fs.writeFileSync(path.join(root, "public/icon-512.png"), await png("rounded", 512));
  // Maskable: full-bleed, mark inside the 80% safe zone (scale 0.6 keeps the mark inside the circle of radius 0.4 of the canvas).
  fs.writeFileSync(path.join(root, "public/icon-maskable-512.png"), await png("square", 512, 0.6));
  console.log("icons written");
}

main();
