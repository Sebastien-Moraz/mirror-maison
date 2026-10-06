// Progression Plex interpolée côté client.
// Plex ne renvoie un nouveau viewOffset que toutes les ~10 s : on ne recale l'ancre
// que lorsque la valeur change, sinon la barre reculerait à chaque requête.

/** Nouvelle ancre { key, viewOffset, at, state, duration } à partir d'une réponse serveur. */
export function nextAnchor(prev, session, now) {
  const same = prev && prev.key === session.key;
  if (same && prev.viewOffset === session.viewOffset && prev.state === session.state) {
    return { ...prev, duration: session.duration };
  }
  // En reprise de lecture, on repart de la position figée.
  return { key: session.key, viewOffset: session.viewOffset, at: now, state: session.state, duration: session.duration };
}

/** Position courante (ms), figée en pause, bornée à la durée. */
export function interpolateOffset(anchor, now) {
  if (!anchor) return 0;
  const elapsed = anchor.state === "playing" ? Math.max(0, now - anchor.at) : 0;
  const pos = anchor.viewOffset + elapsed;
  return anchor.duration ? Math.min(pos, anchor.duration) : pos;
}

/** 842000 → « 14:02 », 5025000 → « 1:23:45 » */
export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${String(m).padStart(2, "0")}:${ss}`;
}
