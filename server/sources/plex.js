// Plex : session en cours et proxy d'images. Le token ne quitte jamais le serveur.
import { Source, fetchOk } from "../source.js";

const RESOLUTIONS = { "4k": "4K", sd: "SD" };
export const resolutionLabel = (r) => (r ? (RESOLUTIONS[String(r).toLowerCase()] ?? (/^\d+$/.test(r) ? `${r}p` : r)) : "");
const imageUrl = (path, w, h) => (path ? `/api/plex/image?path=${encodeURIComponent(path)}&w=${w}&h=${h}` : null);

/**
 * Réponse /status/sessions → session à afficher (ou null).
 * `activity` (Map sessionKey → { sig, at }) mémorise le dernier changement de chaque session
 * pour choisir la plus récemment active.
 */
export function pickSession(json, activity, now = Date.now()) {
  const items = (json?.MediaContainer?.Metadata ?? []).filter((m) =>
    ["playing", "paused", "buffering"].includes(m.Player?.state),
  );
  const seen = new Set();
  for (const m of items) {
    const key = String(m.sessionKey ?? m.Session?.id ?? m.ratingKey);
    seen.add(key);
    const sig = `${m.viewOffset}|${m.Player?.state}`;
    const prev = activity.get(key);
    if (!prev || prev.sig !== sig) activity.set(key, { sig, at: now });
  }
  for (const key of activity.keys()) if (!seen.has(key)) activity.delete(key);
  if (!items.length) return null;

  const keyOf = (m) => String(m.sessionKey ?? m.Session?.id ?? m.ratingKey);
  const m = items
    .slice()
    .sort((a, b) => activity.get(keyOf(b)).at - activity.get(keyOf(a)).at || (a.Player?.state === "playing" ? -1 : 1))[0];

  const episode = m.type === "episode";
  const media = m.Media?.[0] ?? {};
  return {
    key: keyOf(m),
    state: m.Player?.state === "paused" ? "paused" : "playing",
    title: episode ? m.grandparentTitle : m.title,
    subtitle: episode ? `S${m.parentIndex ?? "?"} · É${m.index ?? "?"} ${m.title ?? ""}`.trim() : m.year ? String(m.year) : "",
    viewOffset: Number(m.viewOffset ?? 0),
    duration: Number(m.duration ?? media.duration ?? 0),
    user: m.User?.title ?? "",
    avatar: imageUrl(m.User?.thumb, 52, 52),
    cover: imageUrl(episode ? (m.grandparentThumb ?? m.parentThumb ?? m.thumb) : m.thumb, 136, 200),
    location: m.Session?.location === "wan" ? "wan" : "lan",
    mode: m.TranscodeSession ? "Transcodage" : "Lecture directe",
    quality: resolutionLabel(media.videoResolution),
  };
}

export function createPlex(config) {
  const activity = new Map();
  let failures = 0;

  async function fetchSessions() {
    const { PLEX_URL, PLEX_TOKEN } = process.env;
    if (!PLEX_URL || !PLEX_TOKEN) throw new Error("PLEX_URL ou PLEX_TOKEN absent de .env");
    const res = await fetchOk(`${PLEX_URL.replace(/\/$/, "")}/status/sessions`, {
      timeout: 5_000,
      headers: { "X-Plex-Token": PLEX_TOKEN, Accept: "application/json" },
    });
    return res.json();
  }

  const source = new Source(
    "plex",
    async () => {
      try {
        const session = pickSession(await fetchSessions(), activity);
        failures = 0;
        return session;
      } catch (err) {
        // Plex injoignable plus de ~10 s : on masque le bloc plutôt que figer une lecture fantôme.
        if (++failures >= 5) source.value = null;
        throw err;
      }
    },
    config.intervals.plex,
  );

  // --- Proxy d'images, avec petit cache mémoire
  const cache = new Map();
  async function image(req) {
    const url = new URL(req.url);
    const path = url.searchParams.get("path") ?? "";
    const w = Math.min(600, Math.max(16, Number(url.searchParams.get("w")) || 136));
    const h = Math.min(900, Math.max(16, Number(url.searchParams.get("h")) || 200));
    const key = `${path}|${w}|${h}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 3_600_000) return imageResponse(hit);

    let upstream;
    if (path.startsWith("/library/") || path.startsWith("/photo/")) {
      const { PLEX_URL, PLEX_TOKEN } = process.env;
      const q = new URLSearchParams({ width: w, height: h, minSize: 1, upscale: 1, url: path });
      upstream = await fetchOk(`${PLEX_URL.replace(/\/$/, "")}/photo/:/transcode?${q}`, {
        headers: { "X-Plex-Token": PLEX_TOKEN },
      });
    } else if (/^https:\/\/([a-z0-9-]+\.)*plex\.tv\//i.test(path)) {
      upstream = await fetchOk(path); // avatars publics de plex.tv, sans token
    } else {
      return new Response("Chemin refusé", { status: 400 });
    }
    const entry = {
      at: Date.now(),
      type: upstream.headers.get("content-type") ?? "image/jpeg",
      body: new Uint8Array(await upstream.arrayBuffer()),
    };
    cache.set(key, entry);
    if (cache.size > 40) cache.delete(cache.keys().next().value);
    return imageResponse(entry);
  }
  const imageResponse = (e) => new Response(e.body, { headers: { "content-type": e.type, "cache-control": "max-age=3600" } });

  return { source, image, fetchSessions };
}
