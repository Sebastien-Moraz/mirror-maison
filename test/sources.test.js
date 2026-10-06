// Comme le serveur : les dates « journée entière » de node-ical sont en heure locale.
process.env.TZ = "Europe/Zurich";

import { test, expect, describe } from "bun:test";
import { parseWeather } from "../server/sources/weather.js";
import { pickAlert } from "../server/sources/alert.js";
import openMeteo from "./fixtures/open-meteo.json";

const TZ = "Europe/Zurich";

describe("météo", () => {
  const now = 1791316800 * 1000; // 6 oct 2026 22:00 Zurich
  const w = parseWeather(openMeteo, TZ, now);
  test("actuel", () => {
    expect(w.current.temperature).toBe(10.9);
    expect(w.current.isDay).toBe(false);
    expect(w.current.windDirection).toBe(169);
  });
  test("jours en date locale, arrondis", () => {
    expect(w.daily[0]).toEqual({ date: "2026-10-06", code: 45, max: 19, min: 7 });
    expect(w.daily[1].date).toBe("2026-10-07");
  });
  test("soleil du jour", () => expect(w.sun.rise).toBe(1791265193000));
  test("heures à venir seulement", () => {
    expect(w.hourly[0].time).toBe(now);
    expect(w.hourly).toHaveLength(24);
  });
});

describe("alerte Wetteralarm", () => {
  const now = Date.parse("2026-10-06T21:00:00+02:00");
  const alarm = (o) => ({
    code: 6,
    priority: 1,
    valid_from: "2026-10-06T12:00:00+02:00",
    valid_to: "2026-10-07T06:00:00+02:00",
    regions: [{ name_de: "VD Jura" }],
    ...o,
  });
  const opts = { region: "VD Jura", label: "Jura vaudois" };
  test("aucune alerte", () => expect(pickAlert({ alarms: [] }, opts, now)).toBeNull());
  test("autre région ignorée", () =>
    expect(pickAlert({ alarms: [alarm({ regions: [{ name_de: "Lavaux" }] })] }, opts, now)).toBeNull());
  test("niveau le plus élevé", () => {
    const a = pickAlert({ alarms: [alarm(), alarm({ priority: 2, code: 4 })] }, opts, now);
    expect(a).toEqual({ code: 4, level: 2, region: "Jura vaudois", end: Date.parse("2026-10-07T06:00:00+02:00") });
  });
  test("alerte terminée ignorée", () =>
    expect(pickAlert({ alarms: [alarm({ valid_to: "2026-10-06T20:00:00+02:00" })] }, opts, now)).toBeNull());
  test("horodatage unix en secondes", () =>
    expect(pickAlert({ alarms: [alarm({ valid_to: 1791352800 })] }, opts, now).end).toBe(1791352800000));
});

import { upcomingEvents } from "../server/sources/calendars.js";
import { formatEventWhen } from "../public/js/shared/agenda.js";
const ics = await Bun.file(new URL("./fixtures/agenda.ics", import.meta.url)).text();

describe("agendas ICS", () => {
  const now = Date.parse("2026-10-06T21:13:00+02:00");
  const lines = (opts) =>
    upcomingEvents(ics, { now, max: 10, ...opts }).map((e) => `${formatEventWhen(e, new Date(now), TZ)} ${e.title}`);

  test("récurrence, EXDATE, occurrence modifiée, journée, en cours, changement d'heure", () => {
    expect(lines({ daysAhead: 30 })).toEqual([
      "Lun. 5 – Ven. 9 Vacances", // en cours : reste affiché jusqu'à sa fin
      "Demain · 18:15–19:45 C1",
      // 14 octobre exclu (EXDATE)
      "Dim. 18 · journée Anniversaire Chloé",
      "Mer. 21 · 17:00–18:30 C1 (avancé)", // RECURRENCE-ID
      "Mer. 28 · 18:15–19:45 C1", // après le passage à l'heure d'hiver du 25 : toujours 18:15 locale
      "Mer. 4 · 18:15–19:45 C1",
    ]);
  });
  test("3 premiers seulement, annulés et passés exclus", () => {
    const evs = upcomingEvents(ics, { now, max: 3 });
    expect(evs.map((e) => e.title)).toEqual(["Vacances", "C1", "Anniversaire Chloé"]);
  });
  test("journée entière en dates civiles, fin exclusive", () => {
    const anniv = upcomingEvents(ics, { now, max: 10 }).find((e) => e.title === "Anniversaire Chloé");
    expect(anniv).toEqual({ title: "Anniversaire Chloé", allDay: true, start: "2026-10-18", end: "2026-10-19" });
  });
  test("un événement terminé disparaît", () => {
    const later = Date.parse("2026-10-10T00:30:00+02:00");
    expect(upcomingEvents(ics, { now: later, max: 1 })[0].title).not.toBe("Vacances");
  });
});
