// Outils de dates indépendants du fuseau de la machine : tout passe par Intl.

const formatters = new Map();

function formatter(tz) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
    });
    formatters.set(tz, f);
  }
  return f;
}

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Composantes calendaires d'un instant dans le fuseau `tz`. weekday : 0 = dimanche. */
export function zonedParts(date, tz) {
  const p = {};
  for (const { type, value } of formatter(tz).formatToParts(date)) p[type] = value;
  return {
    year: +p.year,
    month: +p.month,
    day: +p.day,
    hour: +p.hour % 24,
    minute: +p.minute,
    second: +p.second,
    weekday: WEEKDAY_INDEX[p.weekday],
  };
}

/** Numéro de jour absolu (jours depuis 1970) d'une date civile, pour comparer des jours. */
export function dayNumber({ year, month, day }) {
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** Date civile "YYYY-MM-DD" → composantes, avec le jour de semaine. */
export function parseDateOnly(s) {
  const [year, month, day] = s.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, weekday };
}

/** Semaine ISO 8601 d'une date civile. */
export function isoWeek({ year, month, day }) {
  const d = new Date(Date.UTC(year, month - 1, day));
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d - yearStart) / 86_400_000 + 1) / 7);
}

export const pad2 = (n) => String(n).padStart(2, "0");
export const hhmm = (p) => `${pad2(p.hour)}:${pad2(p.minute)}`;

export const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
export const WEEKDAYS_SHORT = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];
export const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** « mardi 6 octobre · semaine 41 » */
export function headerDate(date, tz) {
  const p = zonedParts(date, tz);
  return `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS[p.month - 1]} · semaine ${isoWeek(p)}`;
}
