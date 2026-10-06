// Diagnostic d'une source, à lancer sur le Pi : bun run check:<source>
// N'affiche jamais de token ni d'URL ICS.
import config from "../config.js";
import { weatherFetcher } from "../server/sources/weather.js";
import { alertFetcher, pickAlert } from "../server/sources/alert.js";
import { upcomingEvents } from "../server/sources/calendars.js";
import { createPlex, pickSessions } from "../server/sources/plex.js";
import { ping } from "../server/sources/hosts.js";
import { createXiaomi, parseXiaomiMessage } from "../server/sources/xiaomi.js";
import { createClouds } from "../server/sources/clouds.js";
import { formatEventWhen } from "../public/js/shared/agenda.js";
import { rainSentence } from "../public/js/shared/rain.js";
import { alertText } from "../public/js/shared/alert.js";
import { windCardinal } from "../public/js/shared/wind.js";
import { join } from "node:path";

process.env.TZ = config.timezone;
const tz = config.timezone;
const what = process.argv[2];
const show = (o) => console.log(JSON.stringify(o, null, 2));

const checks = {
  async weather() {
    const w = await weatherFetcher(config)();
    show(w.current);
    console.log(`Vent ${Math.round(w.current.windSpeed)} km/h ${windCardinal(w.current.windDirection)}`);
    console.table(w.daily);
    console.log("Phrase de pluie :", rainSentence(w.hourly, new Date(), tz) ?? "(aucune)");
  },

  async alert() {
    const res = await fetch(config.alert.url);
    const json = await res.json();
    console.log(`${json.alarms?.length ?? 0} alerte(s) en Suisse.`);
    const regions = new Set((json.alarms ?? []).flatMap((a) => (a.regions ?? []).map((r) => r.name_de)));
    if (regions.size) console.log("Régions concernées :", [...regions].join(", "));
    if (json.alarms?.[0]) show(json.alarms[0]);
    const a = pickAlert(json, config.alert);
    console.log(`Pour « ${config.alert.region} » :`, a ? alertText(a, new Date(), tz) : "aucune alerte");
  },

  async ics() {
    for (const p of config.people) {
      const url = process.env[p.env];
      if (!url) {
        console.log(`\n${p.name} : ${p.env} absent de .env`);
        continue;
      }
      try {
        const res = await fetch(url);
        const text = await res.text();
        const count = (text.match(/BEGIN:VEVENT/g) ?? []).length;
        console.log(`\n${p.name} : HTTP ${res.status}, ${count} VEVENT`);
        for (const e of upcomingEvents(text, { daysAhead: config.calendar.daysAhead, max: 5 })) {
          console.log(`  ${formatEventWhen(e, new Date(), tz).padEnd(28)} ${e.title}`);
        }
      } catch (err) {
        console.log(`\n${p.name} : erreur ${err.message}`);
      }
    }
  },

  async plex() {
    const plex = createPlex(config);
    const json = await plex.fetchSessions();
    const items = json?.MediaContainer?.Metadata ?? [];
    console.log(`${items.length} session(s)`);
    for (const m of items) {
      console.log(
        `- ${m.type} « ${m.grandparentTitle ?? m.title} » par ${m.User?.title} : ${m.Player?.state}, ` +
          `${m.Session?.location}, ${m.TranscodeSession ? "transcodage" : "direct"}, ${m.Media?.[0]?.videoResolution}, ` +
          `${m.viewOffset}/${m.duration} ms`,
      );
    }
    console.log("\nCe qui sera affiché :");
    show(pickSessions(json, new Map()));
  },

  async ping() {
    for (const h of config.hosts) console.log(`${(await ping(h.host)) ? "✔ up  " : "✘ down"} ${h.name} (${h.host})`);
  },

  async xiaomi() {
    const seconds = Number(process.argv[3]) || 20;
    const names = new Map(config.xiaomi.sensors.map((s) => [s.sid, s.name]));
    const x = createXiaomi(config).start();
    x.onMessage((raw, rinfo) => {
      const m = parseXiaomiMessage(raw);
      if (!m) return;
      const vals = [m.temperature != null && `${m.temperature}°`, m.humidity != null && `${m.humidity}%`].filter(Boolean);
      console.log(`${rinfo.address} ${m.cmd.padEnd(9)} ${m.sid} ${m.model ?? ""} ${names.get(m.sid) ?? "(sid inconnu)"} ${vals.join(" ")}`);
      if (process.argv.includes("--raw")) console.log("   ", raw.toString());
    });
    console.log(`Écoute pendant ${seconds} s (lectures envoyées à ${config.xiaomi.gateway})…\n`);
    await Bun.sleep(seconds * 1000);
    console.log("");
    console.table(x.snapshot().data.map((s) => ({ ...s, lastSeen: s.lastSeen ? new Date(s.lastSeen).toLocaleTimeString("fr-CH") : "jamais" })));
    process.exit(0);
  },

  async clouds() {
    const c = createClouds(config, join(import.meta.dir, "../data"));
    await c.source.tick();
    console.log(c.source.error ? `Erreur : ${c.source.error}` : "OK", await c.meta());
  },
};

if (!checks[what]) {
  console.log(`Usage : bun run check:<${Object.keys(checks).join("|")}>`);
  process.exit(1);
}
try {
  await checks[what]();
} catch (err) {
  console.error(`Échec : ${err.message}`);
  process.exit(1);
}
