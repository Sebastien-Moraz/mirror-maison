// Une source interrogée à son rythme. Garde la dernière valeur valide et son horodatage :
// si la source tombe, on continue de servir l'ancienne valeur, avec l'erreur en plus.
// Avec `file`, cette valeur est aussi gardée sur disque et survit à un redémarrage hors ligne.
import { readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class Source {
  constructor(name, fetcher, intervalMs, { file } = {}) {
    this.name = name;
    this.fetcher = fetcher;
    this.intervalMs = intervalMs;
    this.file = file;
    this.value = null;
    this.updatedAt = null;
    this.error = null;
    this.timer = null;
    if (file) this.load();
  }

  load() {
    try {
      const saved = JSON.parse(readFileSync(this.file, "utf8"));
      this.value = saved.value;
      this.updatedAt = saved.updatedAt;
    } catch {
      // pas encore de cache : normal au premier démarrage
    }
  }

  async save() {
    try {
      await mkdir(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, JSON.stringify({ value: this.value, updatedAt: this.updatedAt }));
      await rename(tmp, this.file); // remplacement atomique : jamais de cache à moitié écrit
    } catch (err) {
      console.error(`[${this.name}] cache disque : ${err.message}`);
    }
  }

  async tick() {
    try {
      const value = await this.fetcher(this.value);
      if (value !== undefined) {
        this.value = value;
        this.updatedAt = Date.now();
        if (this.file) await this.save();
      }
      if (this.error) console.log(`[${this.name}] rétabli`);
      this.error = null;
    } catch (err) {
      // On ne journalise qu'au changement d'état pour ne pas inonder journald.
      if (this.error !== err.message) console.error(`[${this.name}] ${err.message}`);
      this.error = err.message;
    }
  }

  start() {
    const loop = async () => {
      await this.tick();
      this.timer = setTimeout(loop, this.intervalMs);
    };
    loop();
    return this;
  }

  snapshot() {
    return { data: this.value, updatedAt: this.updatedAt, error: this.error };
  }
}

/** fetch avec délai d'expiration et erreur explicite si le statut n'est pas 2xx. */
export async function fetchOk(url, { timeout = 15_000, ...options } = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${redact(url)}`);
  return res;
}

/** Retire tokens et chemins privés d'une URL avant de la journaliser. */
export function redact(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname.length > 24 ? "/…" : u.pathname}`;
  } catch {
    return "(url)";
  }
}
