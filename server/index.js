// Serveur du miroir : page statique + API JSON. Tous les secrets restent ici.
import { join, normalize, sep, relative } from "node:path";
import { readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import config from "../config.js";
import * as mock from "./mock.js";
import { startSources } from "./sources/index.js";

process.env.TZ = config.timezone;
const MOCK = process.env.MOCK === "1";
const ROOT = join(import.meta.dir, "..");
const PUBLIC = join(ROOT, "public");

const json = (body, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

// Chaque bloc est indépendant : une exception dans l'un ne touche pas les autres.
function api(provider) {
  return async (req) => {
    try {
      const out = await provider(req);
      return out instanceof Response ? out : json(out);
    } catch (err) {
      console.error(`[api] ${new URL(req.url).pathname}: ${err.message}`);
      return json({ data: null, error: err.message }, 500);
    }
  };
}

// --- Version : change dès qu'un fichier servi ou la config change → la page se recharge.
let version = "";
async function computeVersion() {
  const hash = createHash("sha1");
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "textures") await walk(full);
      } else {
        const s = await stat(full);
        hash.update(`${relative(ROOT, full)}:${s.size}:${s.mtimeMs}\n`);
      }
    }
  }
  await walk(PUBLIC);
  const c = await stat(join(ROOT, "config.js"));
  hash.update(`config:${c.mtimeMs}`);
  version = hash.digest("hex").slice(0, 12);
}
await computeVersion();
setInterval(() => computeVersion().catch(() => {}), 60_000);

// --- Sources
const sources = startSources(config, { mock: MOCK });
const snap = (name) => () => (MOCK ? mock[name]() : sources[name].snapshot());

const clientConfig = {
  timezone: config.timezone,
  thresholds: config.thresholds,
  people: config.people.map(({ name, color }) => ({ name, color })),
  maxEvents: config.calendar.maxEvents,
  hosts: config.hosts.map(({ name }) => name),
  sensors: config.xiaomi.sensors.map(({ name }) => name),
  globe: { textureSize: config.globe.textureSize, center: config.globe.center },
  mock: MOCK,
};

// --- Fichiers statiques
async function serveStatic(pathname) {
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const full = normalize(join(PUBLIC, rel));
  if (!full.startsWith(PUBLIC + sep)) return new Response("Not found", { status: 404 });
  const file = Bun.file(full);
  if (!(await file.exists())) return new Response("Not found", { status: 404 });
  const immutable = /^(fonts|vendor|textures)\//.test(rel);
  return new Response(file, {
    headers: { "cache-control": immutable ? "public, max-age=86400" : "no-cache" },
  });
}

const server = Bun.serve({
  port: config.port,
  hostname: "0.0.0.0",
  routes: {
    "/api/config": () => json(clientConfig),
    "/api/version": () => json({ version }),
    "/api/weather": api(snap("weather")),
    "/api/alert": api(snap("alert")),
    "/api/calendars": api(snap("calendars")),
    "/api/plex": api(snap("plex")),
    "/api/hosts": api(snap("hosts")),
    "/api/sensors": api(snap("sensors")),
    "/api/plex/image": api((req) => (MOCK ? mock.plexImage() : sources.plexImage(req))),
    "/api/clouds": api(() => sources.clouds.meta()),
    "/api/clouds/:size": api((req) => sources.clouds.image(req.params.size)),
    "/api/*": () => json({ error: "not found" }, 404),
  },
  fetch: (req) => serveStatic(new URL(req.url).pathname),
  error(err) {
    console.error(`[http] ${err.message}`);
    return new Response("Erreur interne", { status: 500 });
  },
});

console.log(`Miroir sur http://localhost:${server.port}${MOCK ? " (mode démo)" : ""} — version ${version}`);
