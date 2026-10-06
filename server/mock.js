// Données de démo de la maquette (MOCK=1), datées par rapport au moment présent.
import config from "../config.js";
import { zonedParts } from "../public/js/shared/time.js";
import { zonedMidnightMs } from "../public/js/shared/agenda.js";

const tz = config.timezone;
const startedAt = Date.now();

function dateOnly(offsetDays) {
  const p = zonedParts(new Date(), tz);
  return new Date(Date.UTC(p.year, p.month - 1, p.day + offsetDays)).toISOString().slice(0, 10);
}
function at(offsetDays, time) {
  const [h, m] = time.split(":").map(Number);
  return zonedMidnightMs(dateOnly(offsetDays), tz) + (h * 60 + m) * 60_000;
}
const iso = (ms) => new Date(ms).toISOString();
const wrap = (data) => ({ data, updatedAt: Date.now(), error: null });

export function weather() {
  const hourStart = Math.floor(Date.now() / 3_600_000) * 3_600_000;
  const hourly = Array.from({ length: 24 }, (_, i) => {
    const time = hourStart + i * 3_600_000;
    const rainy = [2, 3, 4].includes(zonedParts(new Date(time), tz).hour);
    return { time, probability: rainy ? 75 : 10, precipitation: rainy ? 0.8 : 0 };
  });
  return wrap({
    current: {
      temperature: 11.5,
      apparent: 10.7,
      code: 0,
      isDay: false,
      windSpeed: 6,
      windDirection: 157,
      humidity: 68,
    },
    sun: { rise: at(0, "07:39"), set: at(0, "18:58") },
    daily: [
      [2, 19, 7],
      [61, 18, 9],
      [63, 14, 5],
      [2, 9, 3],
      [61, 12, 9],
    ].map(([code, max, min], i) => ({ date: dateOnly(i), code, max, min })),
    hourly,
  });
}

export function alert() {
  return wrap({ code: 6, level: 2, region: config.alert.label, end: at(1, "06:00") });
}

export function calendars() {
  const timed = (title, d, s, e) => ({ title, allDay: false, start: iso(at(d, s)), end: iso(at(d, e)) });
  const events = {
    Lionel: [timed("obi", 1, "08:30", "18:30"), timed("obi", 2, "08:30", "18:30"), timed("obi", 4, "07:45", "17:00")],
    Véro: [
      timed("Dentiste", 9, "11:15", "12:00"),
      { title: "Anniversaire Chloé", allDay: true, start: dateOnly(12), end: dateOnly(13) },
    ],
    Chloé: [timed("C1", 1, "18:15", "19:45"), timed("Gym", 3, "16:30", "21:30"), timed("C1", 8, "18:15", "19:45")],
    Seb: [timed("ORP Sentier", 15, "08:45", "09:45")],
  };
  return wrap(config.people.map((p) => ({ name: p.name, color: p.color, events: events[p.name] ?? [] })));
}

export function hosts() {
  return wrap(config.hosts.map((h) => ({ name: h.name, status: "up" })));
}

const SENSOR_VALUES = [
  [14.0, 68], [23.2, 62], [24.2, 59], [23.0, 65], [19.2, 64], [21.7, 66],
  [27.1, 65], [18.0, 65], [20.7, 86], [16.6, 75], null, null,
];
export function sensors() {
  const now = Date.now();
  return wrap(
    config.xiaomi.sensors.map((s, i) => {
      const v = SENSOR_VALUES[i];
      return v
        ? { name: s.name, temperature: v[0], humidity: v[1], lastSeen: now - 90_000 }
        : { name: s.name, temperature: 15.2, humidity: 70, lastSeen: now - 3 * 3_600_000 };
    }),
  );
}

export function plex() {
  const duration = 26 * 60_000;
  // La lecture avance réellement, et boucle, pour voir la barre bouger en démo.
  const viewOffset = (842_000 + Date.now() - startedAt) % duration;
  return wrap({
    key: "demo",
    state: "playing",
    title: "Frieren",
    subtitle: "S1 · É2 Magie ou pas, peu importe",
    viewOffset,
    duration,
    user: "Seb",
    avatar: null,
    cover: "/api/plex/image?path=demo",
    location: "lan",
    mode: "Lecture directe",
    quality: "1080p",
  });
}

export function plexImage() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="136" height="200" viewBox="0 0 136 200">
<rect width="136" height="200" fill="#1d2521"/>
<text x="68" y="104" fill="#6b746f" font-family="sans-serif" font-size="19" letter-spacing="2" text-anchor="middle">COVER</text></svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml" } });
}

