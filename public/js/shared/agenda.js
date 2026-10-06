import { zonedParts, dayNumber, parseDateOnly, hhmm, pad2, WEEKDAYS_SHORT } from "./time.js";

// Un événement : { title, allDay, start, end }
//  - allDay : start/end en "YYYY-MM-DD", end exclusif (convention iCalendar)
//  - sinon  : start/end en ISO 8601 (instants)

function dayLabel(parts, today) {
  const diff = dayNumber(parts) - today;
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Demain";
  if (Math.abs(diff) < 30) return `${WEEKDAYS_SHORT[parts.weekday]} ${parts.day}`;
  return `${pad2(parts.day)}.${pad2(parts.month)}`;
}

function shiftDays(dateOnly, days) {
  const p = parseDateOnly(dateOnly);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return d.toISOString().slice(0, 10);
}

/** « le jeu. 8 », ou « le 24.11 » au-delà de 30 jours. */
function onDay(parts, today) {
  const diff = dayNumber(parts) - today;
  if (Math.abs(diff) < 30) return `le ${WEEKDAYS_SHORT[parts.weekday].toLowerCase()} ${parts.day}`;
  return `le ${pad2(parts.day)}.${pad2(parts.month)}`;
}

/** Événement en cours : « Se termine dans 45 min », « Se termine à 18:30 », « Se termine demain à 10:00 »… */
function formatEnding(ev, now, tz, today) {
  if (ev.allDay) {
    const last = parseDateOnly(shiftDays(ev.end ?? shiftDays(ev.start, 1), -1));
    const diff = dayNumber(last) - today;
    if (diff <= 0) return "Se termine ce soir";
    if (diff === 1) return "Se termine demain";
    return `Se termine ${onDay(last, today)}`;
  }
  const endMs = new Date(ev.end).getTime();
  const minutes = Math.max(1, Math.ceil((endMs - now.getTime()) / 60_000));
  if (minutes < 60) return `Se termine dans ${minutes} min`;
  const e = zonedParts(new Date(endMs), tz);
  const diff = dayNumber(e) - today;
  if (e.hour === 0 && e.minute === 0 && diff === 1) return "Se termine à minuit";
  if (diff === 0) return `Se termine à ${hhmm(e)}`;
  if (diff === 1) return `Se termine demain à ${hhmm(e)}`;
  if (Math.abs(diff) < 30) return `Se termine ${onDay(e, today)} à ${hhmm(e)}`;
  return `Se termine ${onDay(e, today)}`;
}

/** Ligne de date d'un événement d'agenda, relative à `now`. */
export function formatEventWhen(ev, now, tz) {
  const today = dayNumber(zonedParts(now, tz));
  const startMs = ev.allDay ? zonedMidnightMs(ev.start, tz) : new Date(ev.start).getTime();
  const ongoing = startMs <= now.getTime() && now.getTime() < eventEndMs(ev, tz);
  // Une seule journée entière, aujourd'hui : « Aujourd'hui · journée » reste plus naturel.
  const singleDay = ev.allDay && shiftDays(ev.start, 1) === (ev.end ?? shiftDays(ev.start, 1));
  if (ongoing && !singleDay) return formatEnding(ev, now, tz, today);

  if (ev.allDay) {
    const first = parseDateOnly(ev.start);
    const last = parseDateOnly(shiftDays(ev.end ?? shiftDays(ev.start, 1), -1));
    if (dayNumber(last) <= dayNumber(first)) return `${dayLabel(first, today)} · journée`;
    return `${dayLabel(first, today)} – ${dayLabel(last, today)}`;
  }

  const s = zonedParts(new Date(ev.start), tz);
  const e = zonedParts(new Date(ev.end ?? ev.start), tz);
  const days = dayNumber(e) - dayNumber(s);
  const endsAtMidnight = e.hour === 0 && e.minute === 0;
  if (days === 0 || (days === 1 && endsAtMidnight)) {
    return `${dayLabel(s, today)} · ${hhmm(s)}–${hhmm(e)}`;
  }
  const lastDay = endsAtMidnight ? zonedParts(new Date(new Date(ev.end) - 1), tz) : e;
  return `${dayLabel(s, today)} – ${dayLabel(lastDay, today)}`;
}

/** Fin d'un événement en ms, pour savoir s'il est encore en cours. */
export function eventEndMs(ev, tz) {
  if (!ev.allDay) return new Date(ev.end ?? ev.start).getTime();
  return zonedMidnightMs(ev.end ?? shiftDays(ev.start, 1), tz);
}

/** Instant de minuit d'une date civile dans le fuseau `tz`. */
export function zonedMidnightMs(dateOnly, tz) {
  const p = parseDateOnly(dateOnly);
  let t = Date.UTC(p.year, p.month - 1, p.day);
  // Deux corrections suffisent, même autour d'un changement d'heure.
  for (let i = 0; i < 2; i++) {
    const z = zonedParts(new Date(t), tz);
    const asUtc = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second);
    t -= asUtc - Date.UTC(p.year, p.month - 1, p.day);
  }
  return t;
}
