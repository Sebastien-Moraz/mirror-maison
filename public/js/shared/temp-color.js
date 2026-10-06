// Échelle divergente de température : bleu (froid) → gris neutre (≈ 12°) → orange (chaud).
// Deux teintes et un milieu sans teinte, jamais d'arc-en-ciel ; les valeurs restent écrites à côté.

const STOPS = [
  [0, [0x8f, 0xb4, 0xff]], // bleu du miroir
  [12, [0xd0, 0xd0, 0xd0]], // neutre
  [24, [0xff, 0xad, 0x6b]], // orange « chaud » du miroir
];

const hex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

export function tempColor(t) {
  if (t <= STOPS[0][0]) return hex(STOPS[0][1]);
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i];
    if (t <= t1) {
      const [t0, c0] = STOPS[i - 1];
      const k = (t - t0) / (t1 - t0);
      return hex(c0.map((v, j) => v + (c1[j] - v) * k));
    }
  }
  return hex(STOPS.at(-1)[1]);
}
