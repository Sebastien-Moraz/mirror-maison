// Point subsolaire (latitude = déclinaison, longitude où le soleil est au zénith) depuis l'heure UTC.
// Formules approchées de l'Astronomical Almanac, précision ~0.1°, largement suffisante ici.

const RAD = Math.PI / 180;

export function subsolarPoint(date) {
  const d = date.getTime() / 86_400_000 - 10_957.5; // jours depuis J2000.0
  const g = (357.529 + 0.98560028 * d) * RAD; // anomalie moyenne
  const q = 280.459 + 0.98564736 * d; // longitude moyenne
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD; // longitude écliptique
  const e = (23.439 - 0.00000036 * d) * RAD; // obliquité
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / RAD;
  const decl = Math.asin(Math.sin(e) * Math.sin(L)) / RAD;
  const gmst = (18.697374558 + 24.06570982441908 * d) * 15; // temps sidéral de Greenwich, en degrés
  const lon = ((((ra - gmst + 180) % 360) + 360) % 360) - 180;
  return { lat: decl, lon };
}

/**
 * Vecteur unitaire d'un point (lat, lon) dans le repère de la sphère three.js
 * (SphereGeometry : longitude 0 sur +X, 90° E sur −Z, nord sur +Y).
 */
export function latLonToVector(lat, lon) {
  const la = lat * RAD;
  const lo = lon * RAD;
  return [Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)];
}
