import { test, expect, describe } from "bun:test";
import { headerDate, isoWeek } from "../public/js/shared/time.js";
import { windCardinal } from "../public/js/shared/wind.js";
import { formatEventWhen, eventEndMs, zonedMidnightMs } from "../public/js/shared/agenda.js";
import { rainSentence } from "../public/js/shared/rain.js";
import { nextAnchor, interpolateOffset, formatDuration } from "../public/js/shared/plex.js";
import { sensorView } from "../public/js/shared/sensors.js";

const TZ = "Europe/Zurich";
// Mardi 6 octobre 2026, 21:13:11 à Zurich (UTC+2)
const NOW = new Date("2026-10-06T21:13:11+02:00");

describe("date d'en-tête", () => {
  test("format complet", () => expect(headerDate(NOW, TZ)).toBe("mardi 6 octobre · semaine 41"));
  test("semaine ISO aux bords d'année", () => {
    expect(isoWeek({ year: 2026, month: 1, day: 1 })).toBe(1);
    expect(isoWeek({ year: 2027, month: 1, day: 1 })).toBe(53);
    expect(isoWeek({ year: 2024, month: 12, day: 30 })).toBe(1);
  });
  test("le jour suit le fuseau, pas l'UTC", () => {
    expect(headerDate(new Date("2026-10-06T22:30:00Z"), TZ)).toBe("mercredi 7 octobre · semaine 41");
  });
});

describe("vent", () => {
  test.each([
    [0, "N"], [11, "N"], [12, "NNE"], [157.5, "SSE"], [160, "SSE"], [202.5, "SSO"],
    [270, "O"], [315, "NO"], [349, "N"], [360, "N"], [-90, "O"],
  ])("%p° → %p", (deg, out) => expect(windCardinal(deg)).toBe(out));
  test("valeur absente", () => expect(windCardinal(null)).toBe(""));
});

describe("ligne de date d'agenda", () => {
  const timed = (s, e) => ({ allDay: false, start: s, end: e });
  test("aujourd'hui", () =>
    expect(formatEventWhen(timed("2026-10-06T18:15:00+02:00", "2026-10-06T19:45:00+02:00"), NOW, TZ)).toBe(
      "Aujourd'hui · 18:15–19:45",
    ));
  test("demain", () =>
    expect(formatEventWhen(timed("2026-10-07T08:30:00+02:00", "2026-10-07T18:30:00+02:00"), NOW, TZ)).toBe(
      "Demain · 08:30–18:30",
    ));
  test("jour abrégé + numéro", () =>
    expect(formatEventWhen(timed("2026-10-08T08:30:00+02:00", "2026-10-08T18:30:00+02:00"), NOW, TZ)).toBe(
      "Jeu. 8 · 08:30–18:30",
    ));
  test("au-delà de 30 jours : jj.mm", () =>
    expect(formatEventWhen(timed("2026-11-24T10:00:00+01:00", "2026-11-24T11:00:00+01:00"), NOW, TZ)).toBe(
      "24.11 · 10:00–11:00",
    ));
  test("journée entière", () =>
    expect(formatEventWhen({ allDay: true, start: "2026-10-18", end: "2026-10-19" }, NOW, TZ)).toBe(
      "Dim. 18 · journée",
    ));
  test("plusieurs jours (fin exclusive)", () =>
    expect(formatEventWhen({ allDay: true, start: "2026-10-09", end: "2026-10-12" }, NOW, TZ)).toBe(
      "Ven. 9 – Dim. 11",
    ));
  test("horaire sur plusieurs jours", () =>
    expect(formatEventWhen(timed("2026-10-09T18:00:00+02:00", "2026-10-11T12:00:00+02:00"), NOW, TZ)).toBe(
      "Ven. 9 – Dim. 11",
    ));
  test("finit à minuit : reste sur un jour", () =>
    expect(formatEventWhen(timed("2026-10-09T22:00:00+02:00", "2026-10-10T00:00:00+02:00"), NOW, TZ)).toBe(
      "Ven. 9 · 22:00–00:00",
    ));
  test("changement d'heure : heure locale correcte de part et d'autre", () => {
    // Passage à l'heure d'hiver le 25 octobre 2026 à 03:00
    const now = new Date("2026-10-24T12:00:00+02:00");
    expect(formatEventWhen(timed("2026-10-24T08:30:00Z", "2026-10-24T09:30:00Z"), now, TZ)).toBe(
      "Aujourd'hui · 10:30–11:30",
    );
    expect(formatEventWhen(timed("2026-10-26T09:30:00Z", "2026-10-26T10:30:00Z"), now, TZ)).toBe(
      "Lun. 26 · 10:30–11:30",
    );
  });
  test("fin d'un événement journée en heure locale, même un jour de changement d'heure", () => {
    expect(zonedMidnightMs("2026-10-26", TZ)).toBe(Date.parse("2026-10-26T00:00:00+01:00"));
    expect(zonedMidnightMs("2026-10-25", TZ)).toBe(Date.parse("2026-10-25T00:00:00+02:00"));
    expect(eventEndMs({ allDay: true, start: "2026-03-28", end: "2026-03-30" }, TZ)).toBe(
      Date.parse("2026-03-30T00:00:00+02:00"),
    );
  });
});

describe("phrase de pluie", () => {
  const H = 3_600_000;
  const base = Date.parse("2026-10-06T21:00:00+02:00");
  const series = (rainyIdx, start = base, n = 14) =>
    Array.from({ length: n }, (_, i) => ({
      time: start + i * H,
      probability: rainyIdx.includes(i) ? 70 : 10,
      precipitation: 0,
    }));

  test("aucune heure pluvieuse → null", () => expect(rainSentence(series([]), NOW, TZ)).toBeNull());
  test("cette nuit de 02h à 05h", () =>
    expect(rainSentence(series([5, 6, 7]), NOW, TZ)).toBe("Pluie cette nuit de 02h à 05h"));
  test("seuil sur les millimètres", () => {
    const h = series([]);
    h[3].precipitation = 0.2;
    expect(rainSentence(h, NOW, TZ)).toBe("Pluie cette nuit de 00h à 01h");
  });
  test("probabilité 39 % ne compte pas", () => {
    const h = series([]);
    h[3].probability = 39;
    expect(rainSentence(h, NOW, TZ)).toBeNull();
  });
  test("cet après-midi dès 15h", () => {
    const now = new Date("2026-10-06T09:20:00+02:00");
    const h = series([6, 7, 8, 9, 10, 11], Date.parse("2026-10-06T09:00:00+02:00"), 12);
    expect(rainSentence(h, now, TZ)).toBe("Pluie cet après-midi dès 15h");
  });
  test("demain matin", () => {
    const now = new Date("2026-10-06T21:13:00+02:00");
    expect(rainSentence(series([10, 11]), now, TZ)).toBe("Pluie demain matin");
  });
  test("pluie en cours", () => {
    expect(rainSentence(series([0, 1]), NOW, TZ)).toBe("Pluie jusqu'à 23h");
  });
  test("ignore les heures passées et limite à 12 h", () => {
    expect(rainSentence(series([13]), NOW, TZ)).toBeNull();
    const past = series([0], base - 2 * H);
    expect(rainSentence(past, NOW, TZ)).toBeNull();
  });
});

describe("interpolation Plex", () => {
  const s = (o) => ({ key: "1", viewOffset: 10_000, duration: 60_000, state: "playing", ...o });
  test("avance en lecture", () => {
    const a = nextAnchor(null, s(), 1000);
    expect(interpolateOffset(a, 4000)).toBe(13_000);
  });
  test("viewOffset inchangé : on garde l'ancre (pas de retour en arrière)", () => {
    const a = nextAnchor(null, s(), 1000);
    const b = nextAnchor(a, s(), 3000);
    expect(interpolateOffset(b, 5000)).toBe(14_000);
  });
  test("nouveau viewOffset : recalage", () => {
    const a = nextAnchor(null, s(), 1000);
    const b = nextAnchor(a, s({ viewOffset: 20_000 }), 11_000);
    expect(interpolateOffset(b, 12_000)).toBe(21_000);
  });
  test("figé en pause", () => {
    const a = nextAnchor(nextAnchor(null, s(), 0), s({ state: "paused", viewOffset: 12_000 }), 5000);
    expect(interpolateOffset(a, 50_000)).toBe(12_000);
  });
  test("borné à la durée", () => expect(interpolateOffset(nextAnchor(null, s(), 0), 999_999)).toBe(60_000));
  test("changement de session", () => {
    const a = nextAnchor(null, s(), 0);
    const b = nextAnchor(a, s({ key: "2", viewOffset: 10_000 }), 7000);
    expect(interpolateOffset(b, 7000)).toBe(10_000);
  });
  test("format", () => {
    expect(formatDuration(842_000)).toBe("14:02");
    expect(formatDuration(1_560_000)).toBe("26:00");
    expect(formatDuration(5_025_000)).toBe("1:23:45");
  });
});

describe("capteurs", () => {
  const now = Date.parse("2026-10-06T21:00:00Z");
  const t = { sensorOfflineMinutes: 30, warmTemp: 26, humidHigh: 80 };
  test("en ligne", () =>
    expect(sensorView({ name: "Salon", temperature: 23.24, humidity: 62.4, lastSeen: now - 60_000 }, now, t)).toEqual({
      name: "Salon", offline: false, temp: "23.2°", hum: "62%", warm: false, humid: false,
    }));
  test("hors ligne après 30 min", () => {
    const v = sensorView({ name: "Cave", temperature: 16, humidity: 70, lastSeen: now - 31 * 60_000 }, now, t);
    expect(v.offline).toBe(true);
    expect(v.temp).toBe("—");
    expect(v.hum).toBe("");
  });
  test("pile 30 min : encore en ligne", () =>
    expect(sensorView({ name: "x", temperature: 1, lastSeen: now - 30 * 60_000 }, now, t).offline).toBe(false));
  test("jamais vu", () => expect(sensorView({ name: "x" }, now, t).offline).toBe(true));
  test("seuils", () => {
    const v = sensorView({ name: "x", temperature: 26, humidity: 80, lastSeen: now }, now, t);
    expect(v.warm).toBe(true);
    expect(v.humid).toBe(true);
  });
});

import { alertText } from "../public/js/shared/alert.js";

describe("alerte", () => {
  const a = { code: 6, level: 2, region: "Jura vaudois", end: Date.parse("2026-10-07T06:00:00+02:00") };
  test("texte complet", () =>
    expect(alertText(a, NOW, TZ)).toBe("Alerte vent fort, niveau 2 · Jura vaudois, jusqu'à mercredi 06:00"));
  test("fin le jour même : heure seule", () =>
    expect(alertText({ ...a, end: Date.parse("2026-10-06T23:00:00+02:00") }, NOW, TZ)).toBe(
      "Alerte vent fort, niveau 2 · Jura vaudois, jusqu'à 23:00",
    ));
});

import { subsolarPoint, latLonToVector } from "../public/js/shared/sun.js";

describe("soleil", () => {
  test("équinoxe de mars à midi UTC : soleil au zénith près de l'équateur et de Greenwich", () => {
    const p = subsolarPoint(new Date("2026-03-20T12:00:00Z"));
    expect(Math.abs(p.lat)).toBeLessThan(0.5);
    expect(Math.abs(p.lon)).toBeLessThan(3);
  });
  test("solstice de juin : déclinaison ≈ +23.4°", () =>
    expect(subsolarPoint(new Date("2026-06-21T12:00:00Z")).lat).toBeCloseTo(23.43, 1));
  test("à 18:00 UTC début octobre : ≈ 93° O (équation du temps +12 min), déclinaison ≈ −5.3°", () => {
    const p = subsolarPoint(new Date("2026-10-06T18:00:00Z"));
    expect(p.lon).toBeCloseTo(-93, 0);
    expect(p.lat).toBeCloseTo(-5.3, 0);
  });
  test("repère de la sphère", () => {
    const [x, y, z] = latLonToVector(0, 90);
    expect([x, y, z].map((v) => Math.round(v))).toEqual([0, 0, -1]);
    expect(latLonToVector(90, 0)[1]).toBeCloseTo(1);
  });
});

import { tempColor } from "../public/js/shared/temp-color.js";

describe("couleur des températures", () => {
  test("bornes et milieu", () => {
    expect(tempColor(-20)).toBe("#8fb4ff");
    expect(tempColor(12)).toBe("#d0d0d0");
    expect(tempColor(40)).toBe("#ffad6b");
  });
  test("interpolation entre deux paliers", () => expect(tempColor(18)).toBe("#e8bf9e"));
});
