// Copie three.js et la police Space Grotesk dans public/ : aucun CDN au runtime.
import { cpSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const nm = join(root, "node_modules");
const copies = [
  ["three/build/three.module.js", "public/vendor/three.module.js"],
  ["three/build/three.core.js", "public/vendor/three.core.js"],
  ...[300, 400, 500].map((w) => [
    `@fontsource/space-grotesk/files/space-grotesk-latin-${w}-normal.woff2`,
    `public/fonts/space-grotesk-${w}.woff2`,
  ]),
];

mkdirSync(join(root, "public/vendor"), { recursive: true });
mkdirSync(join(root, "public/fonts"), { recursive: true });
for (const [from, to] of copies) cpSync(join(nm, from), join(root, to));
console.log(`vendor: ${copies.length} fichiers copiés dans public/`);
