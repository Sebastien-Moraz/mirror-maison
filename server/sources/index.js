// Démarre toutes les sources réelles. En mode démo, seuls les nuages (publics) tournent.
import { join } from "node:path";
import { Source } from "../source.js";
import { createClouds } from "./clouds.js";
import { weatherFetcher } from "./weather.js";
import { alertFetcher } from "./alert.js";
import { calendarsFetcher } from "./calendars.js";
import { createPlex } from "./plex.js";
import { hostsFetcher } from "./hosts.js";
import { createXiaomi } from "./xiaomi.js";

const DATA = join(import.meta.dir, "../../data");

export function startSources(config, { mock }) {
  const clouds = createClouds(config, DATA);
  clouds.source.start();
  if (mock) return { clouds };

  const i = config.intervals;
  const plex = createPlex(config);
  // Sources Internet : dernière valeur gardée sur disque pour survivre à un redémarrage sans connexion.
  const cache = (name) => ({ file: join(DATA, `${name}.json`) });
  return {
    clouds,
    weather: new Source("météo", weatherFetcher(config), i.weather, cache("weather")).start(),
    alert: new Source("alerte", alertFetcher(config), i.alert, cache("alert")).start(),
    calendars: new Source("agendas", calendarsFetcher(config), i.calendars, cache("calendars")).start(),
    hosts: new Source("ping", hostsFetcher(config), i.ping).start(),
    plex: plex.source.start(),
    plexImage: plex.image,
    sensors: createXiaomi(config).start(),
  };
}
