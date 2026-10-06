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

import { pickSessions, resolutionLabel, playbackMode } from "../server/sources/plex.js";
import { nextHostState } from "../server/sources/hosts.js";
import { parseXiaomiMessage } from "../server/sources/xiaomi.js";

describe("Plex", () => {
  const ep = {
    type: "episode",
    sessionKey: "12",
    grandparentTitle: "Frieren",
    parentIndex: 1,
    index: 2,
    title: "Magie ou pas, peu importe",
    grandparentThumb: "/library/metadata/5/thumb/1",
    viewOffset: 842000,
    duration: 1560000,
    User: { title: "Seb", thumb: "https://plex.tv/users/abc/avatar?c=1" },
    Player: { state: "playing" },
    Session: { location: "lan" },
    Media: [{ videoResolution: "1080" }],
  };
  const movie = {
    type: "movie",
    sessionKey: "13",
    title: "Dune",
    year: 2021,
    thumb: "/library/metadata/9/thumb/2",
    viewOffset: 10,
    duration: 100,
    User: { title: "Véro" },
    Player: { state: "paused" },
    Session: { location: "wan" },
    TranscodeSession: {},
    Media: [{ videoResolution: "4k" }],
  };
  const wrap = (...m) => ({ MediaContainer: { size: m.length, Metadata: m } });

  const playing = (m, viewOffset) => ({ ...m, viewOffset, Player: { state: "playing" } });

  test("aucune session", () => expect(pickSessions({ MediaContainer: { size: 0 } }, new Map())).toEqual([]));
  test("épisode", () =>
    expect(pickSessions(wrap(ep), new Map(), 0)).toEqual([
      {
        key: "12",
        state: "playing",
        title: "Frieren",
        subtitle: "S1 · É2 Magie ou pas, peu importe",
        viewOffset: 842000,
        duration: 1560000,
        user: "Seb",
        avatar: "/api/plex/image?path=https%3A%2F%2Fplex.tv%2Fusers%2Fabc%2Favatar%3Fc%3D1&w=52&h=52",
        cover: "/api/plex/image?path=%2Flibrary%2Fmetadata%2F5%2Fthumb%2F1&w=136&h=200",
        location: "lan",
        mode: "Lecture directe",
        quality: "1080p",
      },
    ]));
  test("film en pause, distant, transcodé, 4K", () => {
    const [s] = pickSessions(wrap(movie), new Map(), 0);
    expect([s.title, s.subtitle, s.state, s.location, s.mode, s.quality, s.avatar]).toEqual([
      "Dune", "2021", "paused", "wan", "Transcodage", "4K", null,
    ]);
  });
  test("plusieurs sessions : toutes affichées, dans l'ordre de démarrage", () => {
    const activity = new Map();
    expect(pickSessions(wrap(ep), activity, 0).map((s) => s.key)).toEqual(["12"]);
    // Le film démarre ensuite et avance : il reste sous l'épisode, l'ordre ne bouge pas.
    expect(pickSessions(wrap(ep, movie), activity, 2000).map((s) => s.key)).toEqual(["12", "13"]);
    expect(pickSessions(wrap(movie, playing(ep, 852000)), activity, 4000).map((s) => s.key)).toEqual(["12", "13"]);
  });
  test("au-delà du maximum : les plus récemment actives", () => {
    const activity = new Map();
    const a = { ...ep, sessionKey: "1" };
    const b = { ...ep, sessionKey: "2" };
    const c = { ...ep, sessionKey: "3" };
    pickSessions(wrap(a, b, c), activity, 0, 2);
    // Seules b et c avancent ensuite : a, inactive, est écartée.
    const keys = pickSessions(wrap(a, playing(b, 1), playing(c, 1)), activity, 5000, 2).map((s) => s.key);
    expect(keys).toEqual(["2", "3"]);
  });
  test("une session terminée disparaît", () => {
    const activity = new Map();
    pickSessions(wrap(ep, movie), activity, 0);
    expect(pickSessions(wrap(movie), activity, 2000).map((s) => s.key)).toEqual(["13"]);
    expect(activity.has("12")).toBe(false);
  });
  test("mode de lecture d'après la décision vidéo", () => {
    expect(playbackMode({})).toBe("Lecture directe");
    // Rogue One : vidéo copiée, seul l'audio EAC3 est transcodé
    expect(playbackMode({ TranscodeSession: { videoDecision: "copy", audioDecision: "transcode" } })).toBe("Flux en direct");
    expect(playbackMode({ TranscodeSession: { videoDecision: "transcode", audioDecision: "copy" } })).toBe("Transcodage");
    // Sans videoDecision : on lit la décision du flux vidéo
    expect(playbackMode({ TranscodeSession: {}, Media: [{ Part: [{ Stream: [{ streamType: 1, decision: "copy" }] }] }] })).toBe("Flux en direct");
  });
  test("résolutions", () => {
    expect(resolutionLabel("720")).toBe("720p");
    expect(resolutionLabel("sd")).toBe("SD");
    expect(resolutionLabel(undefined)).toBe("");
  });
});

describe("ping", () => {
  test("down après 2 échecs consécutifs", () => {
    let s = nextHostState(undefined, true);
    s = nextHostState(s, false);
    expect(s.status).toBe("up");
    s = nextHostState(s, false);
    expect(s.status).toBe("down");
    expect(nextHostState(s, true).status).toBe("up");
  });
  test("inconnu tant que rien n'a répondu", () => expect(nextHostState(undefined, false).status).toBe("unknown"));
});

describe("Xiaomi", () => {
  test("report v1 (data en chaîne, centièmes)", () =>
    expect(
      parseXiaomiMessage('{"cmd":"report","model":"sensor_ht","sid":"158d0008ab2c11","data":"{\\"temperature\\":\\"2324\\",\\"humidity\\":\\"6215\\"}"}'),
    ).toEqual({ cmd: "report", sid: "158d0008ab2c11", model: "sensor_ht", temperature: 23.24, humidity: 62.15 }));
  test("température négative", () =>
    expect(parseXiaomiMessage('{"cmd":"read_ack","sid":"x","data":"{\\"temperature\\":\\"-525\\"}"}').temperature).toBe(-5.25));
  test("protocole v2 (params)", () =>
    expect(parseXiaomiMessage('{"cmd":"report","sid":"x","params":[{"temperature":1850},{"humidity":7000}]}')).toMatchObject({
      temperature: 18.5,
      humidity: 70,
    }));
  test("heartbeat sans mesure", () =>
    expect(parseXiaomiMessage('{"cmd":"heartbeat","sid":"x","data":"{\\"voltage\\":3005}"}')).toEqual({ cmd: "heartbeat", sid: "x", model: undefined }));
  test("capteur perdu : 10000 et humidité 0 → erreur, aucune valeur", () => {
    const m = parseXiaomiMessage(
      '{"cmd":"read_ack","model":"sensor_ht","sid":"158d00034f8c21","data":"{\\"voltage\\":3005,\\"temperature\\":\\"10000\\",\\"humidity\\":\\"0\\"}"}',
    );
    expect(m.error).toBe("valeur invalide");
    expect(m.temperature).toBeUndefined();
    expect(m.humidity).toBeUndefined();
  });
  test("No device → erreur", () =>
    expect(parseXiaomiMessage('{"cmd":"read_ack","sid":"158d00034f804c","data":"{\\"error\\":\\"No device\\"}"}').error).toBe("No device"));
  test("message invalide", () => expect(parseXiaomiMessage("pas du json")).toBeNull());
});

import { Source } from "../server/source.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("cache des sources", () => {
  test("une erreur garde la dernière valeur, avec l'erreur", async () => {
    let fail = false;
    const s = new Source("t", async () => {
      if (fail) throw new Error("hors ligne");
      return { temp: 11 };
    }, 1000);
    await s.tick();
    fail = true;
    await s.tick();
    expect(s.snapshot()).toMatchObject({ data: { temp: 11 }, error: "hors ligne" });
  });
  test("la dernière valeur survit à un redémarrage hors ligne", async () => {
    const dir = mkdtempSync(join(tmpdir(), "miroir-"));
    const file = join(dir, "x.json");
    try {
      await new Source("t", async () => ({ temp: 12 }), 1000, { file }).tick();
      const offline = new Source("t", async () => { throw new Error("hors ligne"); }, 1000, { file });
      await offline.tick();
      expect(offline.snapshot().data).toEqual({ temp: 12 });
      expect(offline.snapshot().updatedAt).toBeNumber();
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
