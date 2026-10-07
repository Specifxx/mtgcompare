// Writes the favicon set from the HatMark geometry in src/components/Logo.tsx:
//   src/app/icon.svg (browsers), src/app/apple-icon.png (180),
//   public/icon-192.png and public/icon-512.png (manifest).
// Run: npm run icons
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { HAT_PATHS } from "../src/components/Logo";

function svg(tile: boolean, size = 64): string {
  const b = HAT_PATHS.brim;
  const hat = `
  <defs>
    <linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe28c"/><stop offset="1" stop-color="#e3a531"/></linearGradient>
    <linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8d262"/><stop offset="1" stop-color="#c7861f"/></linearGradient>
  </defs>
  ${tile ? '<rect x="0" y="0" width="64" height="64" rx="14" fill="#0a111e"/><rect x="1" y="1" width="62" height="62" rx="13" fill="none" stroke="#26385a" stroke-width="1.2"/>' : ""}
  <g ${tile ? 'transform="translate(5.5 3) scale(0.83)"' : ""}>
    <ellipse cx="${b.cx}" cy="${b.cy}" rx="${b.rx}" ry="${b.ry}" fill="url(#b)" stroke="#7d520e" stroke-width="1.6"/>
    <path d="${HAT_PATHS.brimLine}" stroke="#7d520e" stroke-width="1" fill="none" opacity="0.45"/>
    <path d="${HAT_PATHS.crown}" fill="url(#c)" stroke="#7d520e" stroke-width="1.6"/>
    <path d="${HAT_PATHS.band}" fill="#d92b33" stroke="#6e1016" stroke-width="1.2"/>
    <path d="${HAT_PATHS.shine}" stroke="#fff6cf" stroke-width="1.6" fill="none" opacity="0.75" stroke-linecap="round"/>
  </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${hat}</svg>`;
}

async function main() {
  const root = path.resolve(__dirname, "..");
  fs.writeFileSync(path.join(root, "src/app/icon.svg"), svg(true));
  fs.writeFileSync(path.join(root, "public/logo-mark.svg"), svg(false));
  const png = (size: number) => sharp(Buffer.from(svg(true, size)), { density: 300 }).resize(size, size).png().toBuffer();
  fs.writeFileSync(path.join(root, "src/app/apple-icon.png"), await png(180));
  fs.writeFileSync(path.join(root, "public/icon-192.png"), await png(192));
  fs.writeFileSync(path.join(root, "public/icon-512.png"), await png(512));
  console.log("icons written");
}

main();
