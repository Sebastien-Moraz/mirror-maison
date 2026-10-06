// Icônes en traits (sans remplissage), viewBox 24. Tracés inspirés de Lucide (licence ISC).

const svg = (body, stroke = 1.3) =>
  `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

// Nuage fermé, réduit et remonté pour laisser la place aux précipitations.
const CLOUD = `<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>`;
const smallCloud = `<g transform="translate(1.8 -2.6) scale(.85)" stroke-width="${(1.3 / 0.85).toFixed(2)}">${CLOUD}</g>`;

const SUN = `<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>`;
// Croissant réduit autour du centre, au gabarit de la maquette.
const MOON = `<g transform="translate(1.8 1.8) scale(.85)" stroke-width="${(1.3 / 0.85).toFixed(2)}"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></g>`;
const CLOUD_SUN = `<g transform="matrix(-1 0 0 1 24 0)"><path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M19.07 4.93l-1.41 1.41"/><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/></g>`;
const CLOUD_MOON = `<path d="M10.188 8.5A6 6 0 0 1 16 4a1 1 0 0 0 6 6 6 6 0 0 1-3 5.197"/><path d="M13 16a3 3 0 1 1 0 6H7a5 5 0 1 1 4.9-6Z"/>`;
const FOG = `<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/><path d="M16 17H7M17 21H9"/>`;
const DRIZZLE = `${smallCloud}<path d="M8 17.5v.01M12 18.5v.01M16 17.5v.01M10 21v.01M14 21v.01"/>`;
const RAIN = `${smallCloud}<path d="M8.6 17.6l-.8 2.6M11.6 17.6l-.8 2.6M14.6 17.6l-.8 2.6M17.6 17.6l-.8 2.6"/>`;
const SNOW = `${smallCloud}<path d="M8 17.5v.01M12 17.5v.01M16 17.5v.01M10 20.5v.01M14 20.5v.01"/>`;
const THUNDER = `${smallCloud}<path d="M12.5 14.5l-2 3.5h3l-2 3.5"/>`;

/** Icône météo pour un code WMO. */
export function weatherIcon(code, isDay = true) {
  if (code === 0 || code === 1) return svg(isDay ? SUN : MOON);
  if (code === 2) return svg(isDay ? CLOUD_SUN : CLOUD_MOON);
  if (code === 3) return svg(CLOUD);
  if (code === 45 || code === 48) return svg(FOG);
  if (code >= 51 && code <= 57) return svg(DRIZZLE);
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return svg(RAIN);
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return svg(SNOW);
  if (code >= 95) return svg(THUNDER);
  return svg(CLOUD);
}

export const alertIcon = svg(
  `<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>`,
  1.6,
);
export const playIcon = `<svg viewBox="0 0 15 15" width="100%" height="100%"><path d="M3 1.5v12l10-6z" fill="currentColor"/></svg>`;
export const pauseIcon = `<svg viewBox="0 0 15 15" width="100%" height="100%"><path d="M3 1.5h3v12H3zM9 1.5h3v12H9z" fill="currentColor"/></svg>`;
export const homeIcon = svg(
  `<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>`,
  2,
);
export const globeIcon = svg(
  `<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/>`,
  2,
);
