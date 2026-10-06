// Passerelle Xiaomi/Aqara, protocole LAN (comme MMM-XiaomiLAN) :
// UDP, multicast 224.0.0.50:9898 pour les « report » et « heartbeat »,
// commandes « read » par sid envoyées en unicast à la passerelle sur le port 9898.
import dgram from "node:dgram";

const MULTICAST = "224.0.0.50";
const PORT = 9898;

const valid = (v, min, max) => (Number.isFinite(v) && v >= min && v <= max ? v : undefined);

/** Message brut → { cmd, sid, temperature?, humidity? } (protocole v1 « data » et v2 « params »). */
export function parseXiaomiMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return null;
  }
  if (!msg?.sid) return null;
  const fields = {};
  if (typeof msg.data === "string") {
    try {
      Object.assign(fields, JSON.parse(msg.data));
    } catch {}
  } else if (msg.data && typeof msg.data === "object") Object.assign(fields, msg.data);
  if (Array.isArray(msg.params)) for (const p of msg.params) Object.assign(fields, p);

  const out = { cmd: msg.cmd, sid: msg.sid, model: msg.model };
  // La passerelle répond « No device » pour un capteur inconnu, et 10000 (humidité 0) pour un capteur perdu.
  if (fields.error) return { ...out, error: String(fields.error) };
  if (fields.temperature != null) {
    out.temperature = valid(parseInt(fields.temperature, 10) / 100, -50, 90);
    if (out.temperature === undefined) return { ...out, error: "valeur invalide", temperature: undefined };
  }
  if (fields.humidity != null) out.humidity = valid(parseInt(fields.humidity, 10) / 100, 0, 100);
  return out;
}

export function createXiaomi(config, { log = console } = {}) {
  const { gateway, sensors } = config.xiaomi;
  const known = new Set(sensors.map((s) => s.sid));
  const state = new Map(); // sid → { temperature, humidity, lastSeen }
  let socket;
  let lastError = null;
  let lastMessageAt = null;
  const listeners = [];

  function handle(raw) {
    const m = parseXiaomiMessage(raw);
    if (!m) return;
    lastMessageAt = Date.now();
    if (!known.has(m.sid) || m.error) return;
    const s = state.get(m.sid) ?? {};
    // Toute nouvelle du capteur (report, heartbeat, read_ack) prouve qu'il est en ligne.
    s.lastSeen = Date.now();
    if (m.temperature !== undefined) s.temperature = m.temperature;
    if (m.humidity !== undefined) s.humidity = m.humidity;
    state.set(m.sid, s);
  }

  function readAll() {
    sensors.forEach((s, i) =>
      setTimeout(() => {
        const cmd = Buffer.from(JSON.stringify({ cmd: "read", sid: s.sid }));
        socket?.send(cmd, PORT, gateway, (err) => err && (lastError = err.message));
      }, i * 250),
    );
  }

  function openSocket() {
    socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    socket.on("message", handle);
    for (const fn of listeners) socket.on("message", fn);
    socket.on("error", (err) => {
      if (lastError !== err.message) log.error(`[xiaomi] ${err.message}`);
      lastError = err.message;
      if (err.code === "EADDRINUSE" || err.syscall === "bind") {
        // Port pris (ex. MagicMirror encore lancé) : on réessaie dans une minute.
        socket.close();
        socket = null;
        setTimeout(openSocket, 60_000);
      }
    });
    socket.bind(PORT, () => {
      try {
        socket.addMembership(MULTICAST);
        lastError = null;
      } catch (err) {
        log.error(`[xiaomi] multicast : ${err.message}`);
        lastError = err.message;
      }
      readAll();
    });
  }

  function start() {
    openSocket();
    setInterval(readAll, config.intervals.xiaomiRead);
    return api;
  }

  const api = {
    start,
    onMessage(fn) {
      listeners.push(fn);
      socket?.on("message", fn);
    },
    snapshot() {
      const data = sensors.map((s) => ({ name: s.name, ...(state.get(s.sid) ?? {}) }));
      return { data, updatedAt: lastMessageAt ?? Date.now(), error: lastError };
    },
  };
  return api;
}
