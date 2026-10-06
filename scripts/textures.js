// Télécharge une fois les cartes NASA (jour : Blue Marble, nuit : Black Marble)
// et les redimensionne en 4096×2048 et 2048×1024 dans public/textures/.
import { mkdir, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";

const OUT = join(import.meta.dir, "../public/textures");
const SOURCES = {
  day: "https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg",
  night: "https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg",
};
const SIZES = [4096, 2048];
const force = process.argv.includes("--force");

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.error("Le module sharp est requis : bun install (il est en dépendance optionnelle).");
  process.exit(1);
}

const exists = (f) => stat(f).then(() => true, () => false);
await mkdir(OUT, { recursive: true });

for (const [name, url] of Object.entries(SOURCES)) {
  const targets = SIZES.map((w) => ({ w, file: join(OUT, `${name}-${w}.jpg`) }));
  if (!force && (await Promise.all(targets.map((t) => exists(t.file)))).every(Boolean)) {
    console.log(`${name} : déjà présent (--force pour retélécharger)`);
    continue;
  }
  console.log(`${name} : téléchargement ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`);
  const input = Buffer.from(await res.arrayBuffer());
  for (const { w, file } of targets) {
    const out = await sharp(input, { limitInputPixels: false })
      .resize(w, w / 2, { fit: "fill", kernel: "lanczos3" })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    await writeFile(file, out);
    console.log(`  → ${file} (${(out.length / 1e6).toFixed(1)} Mo)`);
  }
}
console.log("Textures prêtes.");
