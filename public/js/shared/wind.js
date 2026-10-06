const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];

/** Direction du vent en degrés → point cardinal français sur 16 secteurs. */
export function windCardinal(deg) {
  if (deg == null || Number.isNaN(+deg)) return "";
  const i = Math.round((((+deg % 360) + 360) % 360) / 22.5) % 16;
  return POINTS[i];
}
