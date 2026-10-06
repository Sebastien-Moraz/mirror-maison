// Agendas Google privés (ICS). Récurrences, exceptions et fuseaux développés par node-ical.
import ical from "node-ical";
import { fetchOk } from "../source.js";
import { pad2 } from "../../public/js/shared/time.js";

const DAY = 86_400_000;
const text = (v) => (typeof v === "object" && v !== null ? (v.val ?? "") : (v ?? "")).toString().trim();
// node-ical crée les dates « journée entière » à minuit local : on relit la date civile en local.
const localDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Texte ICS → prochains événements (en cours ou à venir), triés. */
export function upcomingEvents(icsText, { now = Date.now(), daysAhead = 60, max = 3 } = {}) {
  const data = ical.sync.parseICS(icsText);
  const from = new Date(now - 7 * DAY); // marge pour les événements longs déjà commencés
  const to = new Date(now + daysAhead * DAY);
  const out = [];

  for (const ev of Object.values(data)) {
    if (ev?.type !== "VEVENT" || !ev.start) continue;
    if (ev.recurrenceid && !ev.rrule) continue; // occurrence modifiée : gérée via l'événement parent
    let instances;
    try {
      instances = ical.expandRecurringEvent(ev, { from, to, expandOngoing: true });
    } catch (err) {
      console.error(`[agendas] événement ignoré (${err.message})`);
      continue;
    }
    for (const inst of instances) {
      if (text(inst.event?.status).toUpperCase() === "CANCELLED") continue;
      const start = inst.start;
      const end = inst.end ?? start;
      if (inst.isFullDay) {
        const s = localDate(start);
        let e = localDate(end);
        if (e <= s) e = localDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1));
        out.push({ title: text(inst.summary), allDay: true, start: s, end: e, _start: +start, _end: +new Date(e + "T00:00") });
      } else {
        out.push({ title: text(inst.summary), allDay: false, start: start.toISOString(), end: end.toISOString(), _start: +start, _end: +end });
      }
    }
  }

  return out
    .filter((e) => e._end > now && e._start < +to)
    .sort((a, b) => a._start - b._start || a.title.localeCompare(b.title))
    .slice(0, max)
    .map(({ _start, _end, ...e }) => e);
}

export function calendarsFetcher(config) {
  return async (prev) => {
    const errors = [];
    const result = await Promise.all(
      config.people.map(async (person, i) => {
        const base = { name: person.name, color: person.color };
        const url = process.env[person.env];
        try {
          if (!url) throw new Error(`${person.env} absent de .env`);
          const res = await fetchOk(url, { timeout: 30_000 });
          const events = upcomingEvents(await res.text(), {
            daysAhead: config.calendar.daysAhead,
            max: config.calendar.keep ?? 10,
          });
          return { ...base, events };
        } catch (err) {
          errors.push(`${person.name} : ${err.message}`);
          // L'agenda de cette personne garde sa dernière valeur ; les autres continuent.
          return prev?.[i] ?? { ...base, events: [] };
        }
      }),
    );
    if (errors.length === config.people.length) throw new Error(errors.join(" ; "));
    if (errors.length) console.error(`[agendas] ${errors.join(" ; ")}`);
    return result;
  };
}
