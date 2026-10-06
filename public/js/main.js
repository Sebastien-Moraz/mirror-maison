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
  const hm = hhmm(p);
  $("hm").textContent = hm;
  $("hm").dataset.lead = hm[0];
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
  renderHourly();

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

// --- Bandeau des 12 prochaines heures (affiché seulement quand la place le permet, voir fitLayout)
const SVG_NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs, text) => {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
};

function renderHourly() {
  const w = state.weather;
  const hours = (w?.hourly ?? []).filter((h) => h.time + 3_600_000 > Date.now() && h.temperature != null).slice(0, 12);
  const box = $("hourly");
  box.dataset.available = hours.length === 12 ? "1" : "";
  if (hours.length < 12) return box.replaceChildren();

  const head = el("div", "hourly-row");
  for (const [i, h] of hours.entries()) {
    const col = el("div");
    col.style.display = "flex";
    col.style.flexDirection = "column";
    col.style.alignItems = "center";
    const label = el("div", `hourly-label${i === 0 ? " now" : ""}`, `${pad2(zonedParts(new Date(h.time), tz).hour)}h`);
    const icon = el("div", "hourly-icon");
    icon.innerHTML = weatherIcon(h.code, h.isDay);
    col.append(label, icon);
    head.append(col);
  }

  // Courbe de température : une seule série, valeurs écrites au-dessus de chaque point.
  const W = 952, H = 84, top = 34, bottom = 76;
  const temps = hours.map((h) => h.temperature);
  const min = Math.min(...temps), max = Math.max(...temps);
  const y = (t) => (max === min ? (top + bottom) / 2 : bottom - ((t - min) / (max - min)) * (bottom - top));
  const x = (i) => ((i + 0.5) * W) / hours.length;
  const svg = svgEl("svg", { class: "hourly-curve", viewBox: `0 0 ${W} ${H}`, "aria-label": "Température des 12 prochaines heures" });
  svg.append(svgEl("polyline", { class: "line", points: temps.map((t, i) => `${x(i)},${y(t)}`).join(" ") }));
  temps.forEach((t, i) => {
    svg.append(svgEl("circle", { class: "dot", cx: x(i), cy: y(t), r: 4 }));
    svg.append(svgEl("text", { class: "temp", x: x(i), y: y(t) - 13 }, `${Math.round(t)}°`));
  });

  // Probabilité de pluie, seulement pour les heures qui comptent comme pluvieuses
  const t = cfg.thresholds;
  const rainy = hours.map((h) => (h.probability ?? 0) >= t.rainProbability || (h.precipitation ?? 0) >= t.rainMm);
  const parts = [head, svg];
  if (rainy.some(Boolean)) {
    const rain = el("div", "hourly-row");
    hours.forEach((h, i) => rain.append(el("div", "hourly-rain", rainy[i] ? `${h.probability ?? 0}%` : "")));
    parts.push(rain);
  }
  box.replaceChildren(...parts);
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

// --- Agendas : 3 événements, davantage quand la place le permet (voir fitLayout)
let agendaMax = cfg.maxEvents ?? 3;
function setAgendaMax(n) {
  if (n === agendaMax) return;
  agendaMax = n;
  renderAgendas();
}

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
        .slice(0, agendaMax)
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

// --- Plex : une carte par lecture en cours, réutilisée tant que la session dure
const plexCards = new Map(); // key → { root, parts, anchor, shown }
const plexTemplate = $("plex-card").content.firstElementChild;

function createPlexCard() {
  const root = plexTemplate.cloneNode(true);
  const q = (sel) => root.querySelector(sel);
  const parts = {
    cover: q(".plex-cover img"),
    state: q(".plex-state"),
    title: q(".plex-title"),
    time: q(".plex-time"),
    sub: q(".plex-sub"),
    initial: q(".plex-initial"),
    avatar: q(".plex-avatar img"),
    user: q(".plex-user"),
    loc: q(".plex-loc"),
    mode: q(".plex-mode"),
    fill: q(".plex-fill"),
  };
  parts.cover.addEventListener("error", () => (parts.cover.hidden = true));
  parts.avatar.addEventListener("error", () => (parts.avatar.hidden = true));
  return { root, parts, anchor: null, shown: {} };
}

function onPlexData() {
  const sessions = Array.isArray(state.plex) ? state.plex : state.plex ? [state.plex] : [];
  const now = Date.now();
  const keys = new Set(sessions.map((s) => s.key));
  for (const [key, card] of plexCards) if (!keys.has(key)) plexCards.delete(key) && card.root.remove();
  for (const s of sessions) {
    let card = plexCards.get(s.key);
    if (!card) plexCards.set(s.key, (card = createPlexCard()));
    card.anchor = nextAnchor(card.anchor, s, now);
    card.session = s;
  }
  const list = $("plex");
  sessions.forEach((s, i) => {
    const card = plexCards.get(s.key);
    if (list.children[i] !== card.root) list.insertBefore(card.root, list.children[i] ?? null);
    safe(() => renderPlexCard(card));
  });
  fitLayout();
}

// Mise en page selon la place réelle (alerte, titres sur deux lignes, lectures Plex) : on mesure.
//  - lecture(s) Plex : mise en page de la maquette, cartes ajustées par fitPlex ;
//  - aucune lecture : bandeau horaire et jusqu'à 5 événements par agenda, tant que ça tient.
const MAX_ROOMY_EVENTS = 5;
function fitLayout() {
  const screen = document.querySelector(".screen");
  const fits = () => screen.scrollHeight <= screen.clientHeight;
  const roomy = $("plex").children.length === 0;
  screen.classList.toggle("roomy", roomy);
  const hourly = $("hourly");
  if (!roomy) {
    hourly.hidden = true;
    setAgendaMax(cfg.maxEvents ?? 3);
    return fitPlex();
  }
  hourly.hidden = !hourly.dataset.available;
  for (let n = MAX_ROOMY_EVENTS; n >= (cfg.maxEvents ?? 3); n--) {
    setAgendaMax(n);
    if (fits()) return;
  }
  hourly.hidden = true;
}

// La place sous les agendas varie (alerte, titres sur deux lignes) : on mesure plutôt que deviner.
// Pour n cartes (de toutes à une), on essaie le format normal puis le compact ; les cartes
// écartées sont les plus anciennes.
function fitPlex() {
  const screen = document.querySelector(".screen");
  const cards = [...$("plex").children];
  const fits = () => screen.scrollHeight <= screen.clientHeight;
  const layout = (n, compact) =>
    cards.forEach((c, i) => {
      c.hidden = i < cards.length - n;
      c.classList.toggle("compact", compact);
    });
  for (let n = cards.length; n >= 1; n--) {
    for (const compact of [false, true]) {
      layout(n, compact);
      if (fits()) return;
    }
  }
}

function renderPlexCard({ session: s, parts: p, shown }) {
  if (shown.state !== s.state) p.state.innerHTML = s.state === "paused" ? pauseIcon : playIcon;
  p.title.textContent = s.title;
  p.sub.textContent = s.subtitle ?? "";
  if (shown.cover !== s.cover) {
    p.cover.hidden = !s.cover;
    if (s.cover) p.cover.src = s.cover;
  }
  p.user.textContent = s.user ?? "";
  p.initial.textContent = (s.user || "?").slice(0, 1).toUpperCase();
  if (shown.avatar !== s.avatar) {
    p.avatar.hidden = !s.avatar;
    if (s.avatar) p.avatar.src = s.avatar;
  }
  const lan = s.location !== "wan";
  if (shown.lan !== lan) {
    p.loc.className = `plex-loc ${lan ? "lan" : "wan"}`;
    p.loc.innerHTML = `${lan ? homeIcon : globeIcon}<span>${lan ? "Local" : "Distant"}</span>`;
  }
  p.mode.textContent = [s.mode, s.quality].filter(Boolean).join(" · ");
  Object.assign(shown, { state: s.state, cover: s.cover, avatar: s.avatar, lan });
  renderPlexProgress();
}

function renderPlexProgress() {
  const now = Date.now();
  for (const { anchor, parts } of plexCards.values()) {
    const pos = interpolateOffset(anchor, now);
    parts.time.textContent = `${formatDuration(pos)} / ${formatDuration(anchor.duration)}`;
    parts.fill.style.width = `${anchor.duration ? (100 * pos) / anchor.duration : 0}%`;
  }
}

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
    safe(fitLayout);
    safe(renderSensors);
    safe(renderAlert);
    if (p.hour === 4 && p.minute === 0 && Date.now() - loadedAt > 5 * 60_000) location.reload();
  }
  setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
}
tick();

poll("/api/weather", 60_000, "weather", () => (renderWeather(), fitLayout()));
poll("/api/alert", 60_000, "alert", () => (renderAlert(), fitLayout()));
poll("/api/calendars", 60_000, "calendars", () => (renderAgendas(), fitLayout()));
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
