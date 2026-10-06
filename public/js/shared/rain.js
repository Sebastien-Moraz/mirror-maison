import { zonedParts, dayNumber, pad2 } from "./time.js";

// hours : [{ time (ms), probability (%), precipitation (mm) }] triées, pas d'une heure.

function period(hour) {
  if (hour < 6 || hour >= 22) return "nuit";
  if (hour < 12) return "matin";
  if (hour < 18) return "après-midi";
  return "soir";
}

function periodLabel(p, dayOffset, nowHour) {
  const per = period(p.hour);
  // La nuit qui suit la soirée en cours reste « cette nuit ».
  if (per === "nuit" && (dayOffset === 0 || (dayOffset === 1 && p.hour < 6 && nowHour >= 12))) return "cette nuit";
  if (dayOffset === 0) {
    return { matin: "ce matin", "après-midi": "cet après-midi", soir: "ce soir" }[per];
  }
  return `demain ${per === "nuit" ? "soir" : per}`;
}

/**
 * Phrase de pluie sur les prochaines heures, ou null s'il ne pleut pas.
 * « Pluie cette nuit de 02h à 05h », « Pluie cet après-midi dès 15h », « Pluie demain matin ».
 */
export function rainSentence(hours, now, tz, { probability = 40, mm = 0.2, windowHours = 12 } = {}) {
  const nowMs = +now;
  const window = hours.filter((h) => h.time + 3_600_000 > nowMs).slice(0, windowHours);
  const rainy = window.map((h) => (h.probability ?? 0) >= probability || (h.precipitation ?? 0) >= mm);
  const i = rainy.indexOf(true);
  if (i < 0) return null;
  let j = i;
  while (j < window.length && rainy[j]) j++;

  const toEnd = j === window.length;
  const endHour = toEnd ? null : `${pad2(zonedParts(new Date(window[j].time), tz).hour)}h`;
  if (i === 0) return toEnd ? "Pluie en cours" : `Pluie jusqu'à ${endHour}`;

  const nowP = zonedParts(now, tz);
  const s = zonedParts(new Date(window[i].time), tz);
  const dayOffset = dayNumber(s) - dayNumber(nowP);
  const label = periodLabel(s, dayOffset, nowP.hour);
  const startHour = `${pad2(s.hour)}h`;

  if (toEnd) return label.startsWith("demain") ? `Pluie ${label}` : `Pluie ${label} dès ${startHour}`;
  return `Pluie ${label} de ${startHour} à ${endHour}`;
}
