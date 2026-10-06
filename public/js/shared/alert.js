import { zonedParts, dayNumber, hhmm, pad2, WEEKDAYS } from "./time.js";

// Codes Wetteralarm.ch → type d'alerte
export const ALERT_TYPES = {
  1: "gel",
  2: "orages",
  3: "verglas",
  4: "fortes pluies",
  5: "neige",
  6: "vent fort",
  7: "crues",
};

/** « Alerte vent fort, niveau 2 · Jura vaudois, jusqu'à mercredi 06:00 » */
export function alertText(alert, now, tz) {
  const type = ALERT_TYPES[alert.code] ?? "météo";
  let text = `Alerte ${type}, niveau ${alert.level} · ${alert.region}`;
  if (alert.end) {
    const e = zonedParts(new Date(alert.end), tz);
    const diff = dayNumber(e) - dayNumber(zonedParts(now, tz));
    const day = diff === 0 ? "" : diff < 7 ? `${WEEKDAYS[e.weekday]} ` : `${pad2(e.day)}.${pad2(e.month)} `;
    text += `, jusqu'à ${day}${hhmm(e)}`;
  }
  return text;
}
