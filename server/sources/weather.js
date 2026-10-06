// Météo Open-Meteo (sans clé).
import { fetchOk } from "../source.js";
import { zonedParts, pad2 } from "../../public/js/shared/time.js";

export function weatherUrl({ latitude, longitude }, tz) {
  const params = new URLSearchParams({
    latitude,
    longitude,
    timezone: tz,
    timeformat: "unixtime",
    wind_speed_unit: "kmh",
    forecast_days: 7,
    current: "temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,wind_direction_10m,relative_humidity_2m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset",
    hourly: "precipitation_probability,precipitation",
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

const dateOf = (sec, tz) => {
  const p = zonedParts(new Date(sec * 1000), tz);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
};

/** Réponse Open-Meteo → forme exposée au navigateur. */
export function parseWeather(json, tz, now = Date.now()) {
  const c = json.current;
  const d = json.daily;
  const today = dateOf(now / 1000, tz);
  const daily = d.time.map((t, i) => ({
    date: dateOf(t, tz),
    code: d.weather_code[i],
    max: Math.round(d.temperature_2m_max[i]),
    min: Math.round(d.temperature_2m_min[i]),
    rise: d.sunrise[i] * 1000,
    set: d.sunset[i] * 1000,
  }));
  const todayEntry = daily.find((x) => x.date === today) ?? daily[0];
  const h = json.hourly;
  const hourly = h.time
    .map((t, i) => ({ time: t * 1000, probability: h.precipitation_probability[i], precipitation: h.precipitation[i] }))
    .filter((x) => x.time + 3_600_000 > now)
    .slice(0, 24);

  return {
    current: {
      temperature: c.temperature_2m,
      apparent: c.apparent_temperature,
      code: c.weather_code,
      isDay: c.is_day === 1,
      windSpeed: c.wind_speed_10m,
      windDirection: c.wind_direction_10m,
      humidity: c.relative_humidity_2m,
    },
    sun: { rise: todayEntry.rise, set: todayEntry.set },
    daily: daily.map(({ date, code, max, min }) => ({ date, code, max, min })),
    hourly,
  };
}

export function weatherFetcher(config) {
  return async () => {
    const res = await fetchOk(weatherUrl(config.location, config.timezone));
    return parseWeather(await res.json(), config.timezone);
  };
}
