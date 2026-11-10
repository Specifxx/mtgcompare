// Writes public/flags/<code>.svg from components/Flag.tsx FLAGS (site review X1, 2026-11-10). Run after changing a flag:
//   npx tsx scripts/write-flags.tsx
import { mkdirSync, writeFileSync } from "node:fs";
import React, { createElement } from "react";
(globalThis as { React?: unknown }).React = React; // FLAGS bodies are JSX compiled to React.createElement under tsx
import { renderToStaticMarkup } from "react-dom/server";
import { FLAGS } from "../src/components/Flag";

mkdirSync("public/flags", { recursive: true });
for (const [code, f] of Object.entries(FLAGS)) {
  const svg = renderToStaticMarkup(createElement("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: f.box, preserveAspectRatio: "none" }, f.body()));
  writeFileSync(`public/flags/${code.toLowerCase()}.svg`, svg + "\n");
}
console.log(`wrote ${Object.keys(FLAGS).length} flags`);
