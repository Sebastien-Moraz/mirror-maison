// Nuages en direct (clouds.matteason.co.uk), mis en cache sur disque toutes les 3 h.
// On sert toujours la dernière image valide, même si Internet tombe.
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Source, fetchOk } from "../source.js";

const SIZES = { 4096: "4096x2048", 2048: "2048x1024" };
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function createClouds(config, dataDir) {
  const file = (size) => join(dataDir, `clouds-${size}.png`);

  async function download(size) {
    const url = config.globe.cloudsUrl.replace("{size}", SIZES[size]);
    const buf = Buffer.from(await (await fetchOk(url, { timeout: 120_000 })).arrayBuffer());
    if (buf.length < 50_000 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
      throw new Error(`image nuages ${size} invalide (${buf.length} octets)`);
    }
    const tmp = `${file(size)}.tmp`;
    await writeFile(tmp, buf);
    await rename(tmp, file(size)); // remplacement atomique
  }

  async function mtime(size) {
    try {
      return (await stat(file(size))).mtimeMs;
    } catch {
      return null;
    }
  }

  const source = new Source(
    "nuages",
    async () => {
      await mkdir(dataDir, { recursive: true });
      const maxAge = config.intervals.clouds - 60_000;
      for (const size of Object.keys(SIZES)) {
        const m = await mtime(size);
        if (m == null || Date.now() - m > maxAge) await download(size);
      }
      return { updatedAt: await mtime(4096) };
    },
    15 * 60_000, // vérifie souvent, ne télécharge que si l'image a plus de 3 h
  );

  return {
    source,
    async meta() {
      return { updatedAt: await mtime(4096), error: source.error };
    },
    async image(size) {
      size = String(size).replace(/\.png$/, "");
      if (!SIZES[size]) return new Response("Not found", { status: 404 });
      const f = Bun.file(file(size));
      if (!(await f.exists())) return new Response("Pas encore de nuages", { status: 404 });
      return new Response(f, { headers: { "content-type": "image/png", "cache-control": "no-cache" } });
    },
  };
}
