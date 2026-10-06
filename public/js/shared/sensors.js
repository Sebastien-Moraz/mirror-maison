// État d'affichage d'un capteur : { name, temperature, humidity, lastSeen (ms) }.

export function sensorView(sensor, now, { sensorOfflineMinutes = 30, warmTemp = 26, humidHigh = 80 } = {}) {
  const offline =
    sensor.temperature == null || !sensor.lastSeen || now - sensor.lastSeen > sensorOfflineMinutes * 60_000;
  if (offline) return { name: sensor.name, offline: true, temp: "—", hum: "", warm: false, humid: false };
  return {
    name: sensor.name,
    offline: false,
    temp: `${sensor.temperature.toFixed(1)}°`,
    hum: sensor.humidity == null ? "" : `${Math.round(sensor.humidity)}%`,
    warm: sensor.temperature >= warmTemp,
    humid: sensor.humidity != null && sensor.humidity >= humidHigh,
  };
}
