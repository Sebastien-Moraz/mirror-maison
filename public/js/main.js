import { zonedParts, dayNumber, parseDateOnly, hhmm, pad2, headerDate, WEEKDAYS_SHORT } from "./shared/time.js";
import { windCardinal } from "./shared/wind.js";
import { rainSentence } from "./shared/rain.js";
import { formatEventWhen, eventEndMs } from "./shared/agenda.js";
import { nextAnchor, interpolateOffset, formatDuration } from "./shared/plex.js";
import { sensorView } from "./shared/sensors.js";
import { alertText } from "./shared/alert.js";
import { weatherIcon, alertIcon, playIcon, pauseIcon, homeIcon, globeIcon } from "./icons.js";

const $ = (id) => document.getElementById(id);
const el = (tag, className, text) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
};

const cfg = await (await fetch("/api/config")).json();
const tz = cfg.timezone;
const state = {};

async function getSnapshot(path) {
  const res = await fetch(path, { cache: "no-store" });
  return res.json();
}

/** Interroge une route à intervalle régulier ; une erreur ne casse jamais les autres blocs. */
function poll(path, ms, key, render) {
  const run = async () => {
    try {
      const snap = await getSnapshot(path);
      // Une source en panne renvoie sa dernière valeur ; si elle n'en a jamais eu, on garde l'écran tel quel.
      if (snap.updatedAt != null) state[key] = snap.data;
    } catch (err) {
      console.warn(path, err);
    }
    safe(render);
  };
  run();
  setInterval(run, ms);
}

function safe(fn) {
  try {
    fn();
  } catch (err) {
    console.error(err);
  }
}

// --- Heure
function renderClock(now) {
  const p = zonedParts(now, tz);
  $("date").textContent = headerDate(now, tz);
  $("hm").textContent = hhmm(p);
  $("sec").textContent = pad2(p.second);
}

// --- Serveurs
function renderHosts() {
  const hosts = state.hosts ?? cfg.hosts.map((name) => ({ name, status: "unknown" }));
  $("hosts").replaceChildren(
    ...hosts.map((h) => {
      const li = el("li", h.status === "up" ? "" : h.status);
      li.append(el("span", "dot"), el("span", "", h.name));
      return li;
    }),
  );
}

// --- Météo actuelle + prévisions
let lastIconKey = "";
function renderWeather() {
  const w = state.weather;
  if (!w) return;
  const now = new Date();
  const c = w.current;
  const iconKey = `${c.code}/${c.isDay}`;
  if (iconKey !== lastIconKey) {
    $("now-icon").innerHTML = weatherIcon(c.code, c.isDay);
    lastIconKey = iconKey;
  }
  $("now-temp").textContent = `${c.temperature.toFixed(1)}°`;
  $("feel").textContent = `Ressenti ${c.apparent.toFixed(1)}°`;
  $("wind").textContent = `Vent ${Math.round(c.windSpeed)} km/h ${windCardinal(c.windDirection)} · Humidité ${Math.round(c.humidity)} %`;
  $("sun").textContent = `Soleil ${hhmm(zonedParts(new Date(w.sun.rise), tz))} – ${hhmm(zonedParts(new Date(w.sun.set), tz))}`;
  const t = cfg.thresholds;
  const rain = rainSentence(w.hourly, now, tz, { probability: t.rainProbability, mm: t.rainMm, windowHours: t.rainHours });
  $("rain").textContent = rain ?? "";
  $("rain").hidden = !rain;
  $("now").hidden = false;

  const today = dayNumber(zonedParts(now, tz));
  const days = w.daily.filter((d) => dayNumber(parseDateOnly(d.date)) >= today).slice(0, 5);
  $("forecast").replaceChildren(
    ...days.map((d) => {
      const p = parseDateOnly(d.date);
      const diff = dayNumber(p) - today;
      const label = diff === 0 ? "AUJ." : diff === 1 ? "DEMAIN" : WEEKDAYS_SHORT[p.weekday].toUpperCase();
      const box = el("div", "day");
      const icon = el("div", "day-icon");
      icon.innerHTML = weatherIcon(d.code, true);
      const temps = el("div", "day-temps");
      temps.append(el("span", "day-max", `${Math.round(d.max)}°`), el("span", "day-min", `${Math.round(d.min)}°`));
      box.append(el("div", "day-label", label), icon, temps);
      return box;
    }),
  );
}

// --- Alerte
$("alert-icon").innerHTML = alertIcon;
function renderAlert() {
  const a = state.alert;
  const active = a && (!a.end || a.end > Date.now());
  $("alert").hidden = !active;
  if (active) $("alert-text").textContent = alertText(a, new Date(), tz);
}

// --- Capteurs
const sensorRows = cfg.sensors.map((name) => {
  const li = el("li", "sensor");
  const n = el("span", "sensor-name", name);
  const t = el("span", "sensor-temp");
  const h = el("span", "sensor-hum");
  li.append(n, t, h);
  return { li, n, t, h };
});
$("sensors").replaceChildren(...sensorRows.map((r) => r.li));

function renderSensors() {
  const now = Date.now();
  const byName = new Map((state.sensors ?? []).map((s) => [s.name, s]));
  sensorRows.forEach((row, i) => {
    const v = sensorView(byName.get(cfg.sensors[i]) ?? { name: cfg.sensors[i] }, now, cfg.thresholds);
    row.li.classList.toggle("offline", v.offline);
    row.t.textContent = v.temp;
    row.t.classList.toggle("warm", v.warm);
    row.h.textContent = v.hum;
    row.h.classList.toggle("humid", v.humid);
  });
}

// --- Agendas
function renderAgendas() {
  const now = new Date();
  const list = state.calendars ?? cfg.people.map((p) => ({ ...p, events: [] }));
  $("agendas").replaceChildren(
    ...list.map((person) => {
      const card = el("div", "card");
      const name = el("div", "card-name", person.name);
      name.style.color = person.color;
      const events = el("div", "events");
      person.events
        .filter((ev) => eventEndMs(ev, tz) > now.getTime())
        .slice(0, 3)
        .forEach((ev) => {
          const item = el("div", "event");
          item.append(el("div", "event-when", formatEventWhen(ev, now, tz)), el("div", "event-title", ev.title));
          events.append(item);
        });
      card.append(name, events);
      return card;
    }),
  );
}

// --- Plex
let anchor = null;
const plexShown = { cover: null, avatar: null, state: null };

function onPlexData() {
  const s = state.plex;
  anchor = s ? nextAnchor(anchor, s, Date.now()) : null;
  renderPlex();
}

function renderPlex() {
  const s = state.plex;
  $("plex").hidden = !s;
  if (!s) return;
  if (plexShown.state !== s.state) {
    $("plex-state").innerHTML = s.state === "paused" ? pauseIcon : playIcon;
    plexShown.state = s.state;
  }
  $("plex-title").textContent = s.title;
  $("plex-sub").textContent = s.subtitle ?? "";
  if (plexShown.cover !== s.cover) {
    $("plex-cover").src = s.cover ?? "";
    $("plex-cover").hidden = !s.cover;
    plexShown.cover = s.cover;
  }
  $("plex-user").textContent = s.user ?? "";
  $("plex-initial").textContent = (s.user ?? "?").slice(0, 1).toUpperCase();
  if (plexShown.avatar !== s.avatar) {
    const img = $("plex-avatar-img");
    img.hidden = !s.avatar;
    if (s.avatar) img.src = s.avatar;
    plexShown.avatar = s.avatar;
  }
  const loc = $("plex-loc");
  const lan = s.location !== "wan";
  loc.className = `plex-loc ${lan ? "lan" : "wan"}`;
  loc.innerHTML = `${lan ? homeIcon : globeIcon}<span>${lan ? "Local" : "Distant"}</span>`;
  $("plex-mode").textContent = [s.mode, s.quality].filter(Boolean).join(" · ");
  renderPlexProgress();
}

function renderPlexProgress() {
  if (!anchor || !state.plex) return;
  const pos = interpolateOffset(anchor, Date.now());
  $("plex-time").textContent = `${formatDuration(pos)} / ${formatDuration(anchor.duration)}`;
  $("plex-fill").style.width = `${anchor.duration ? (100 * pos) / anchor.duration : 0}%`;
}
$("plex-avatar-img").addEventListener("error", (e) => (e.target.hidden = true));
$("plex-cover").addEventListener("error", (e) => (e.target.hidden = true));

// --- Rechargements : chaque nuit à 04:00 et à chaque nouvelle version du serveur
const loadedAt = Date.now();
let version = null;
async function checkVersion() {
  try {
    const v = (await (await fetch("/api/version", { cache: "no-store" })).json()).version;
    if (version && v !== version) location.reload();
    version = v;
  } catch {
    // serveur en cours de redémarrage : on réessaie plus tard
  }
}

// --- Boucle de l'horloge, calée sur la seconde
let lastMinute = -1;
function tick() {
  const now = new Date();
  safe(() => renderClock(now));
  safe(renderPlexProgress);
  const p = zonedParts(now, tz);
  if (p.minute !== lastMinute) {
    lastMinute = p.minute;
    // Textes relatifs au temps : « Demain », phrase de pluie, capteurs hors ligne…
    safe(renderWeather);
    safe(renderAgendas);
    safe(renderSensors);
    safe(renderAlert);
    if (p.hour === 4 && p.minute === 0 && Date.now() - loadedAt > 5 * 60_000) location.reload();
  }
  setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
}
tick();

poll("/api/weather", 60_000, "weather", renderWeather);
poll("/api/alert", 60_000, "alert", renderAlert);
poll("/api/calendars", 60_000, "calendars", renderAgendas);
poll("/api/hosts", 15_000, "hosts", renderHosts);
poll("/api/sensors", 30_000, "sensors", renderSensors);
poll("/api/plex", 2_000, "plex", onPlexData);
renderHosts();
checkVersion();
setInterval(checkVersion, 60_000);

// Le globe est isolé : si WebGL échoue, le reste de la page continue.
import("./globe.js")
  .then((m) => m.startGlobe($("globe"), cfg.globe))
  .catch((err) => console.error("globe", err));
