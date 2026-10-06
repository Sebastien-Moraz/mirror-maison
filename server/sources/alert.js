// Alertes météo Wetteralarm.ch (même endpoint que MMM-WetteralarmCH).
import { fetchOk } from "../source.js";

function toMs(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
  if (/^\d+$/.test(v)) return toMs(Number(v));
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

/** Alerte de niveau le plus élevé pour la région, ou null. */
export function pickAlert(json, { region, label }, now = Date.now()) {
  const wanted = region.toLowerCase();
  const matches = (json?.alarms ?? [])
    .filter((a) =>
      (a.regions ?? []).some((r) => [r.name_de, r.name_fr, r.name].some((n) => n?.toLowerCase() === wanted)),
    )
    .map((a) => ({ code: Number(a.code), level: Number(a.priority), start: toMs(a.valid_from), end: toMs(a.valid_to) }))
    .filter((a) => a.end == null || a.end > now)
    .sort((a, b) => b.level - a.level || (a.start ?? 0) - (b.start ?? 0));
  if (!matches.length) return null;
  const { code, level, end } = matches[0];
  return { code, level, region: label, end };
}

export function alertFetcher(config) {
  return async () => {
    const res = await fetchOk(config.alert.url);
    return pickAlert(await res.json(), config.alert);
  };
}
