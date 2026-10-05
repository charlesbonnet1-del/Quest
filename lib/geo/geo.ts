/** Outils géographiques purs (WGS84). */

export interface LatLon {
  lat: number;
  lon: number;
}

const R = 6_371_008.8; // rayon moyen de la Terre, en mètres
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Distance orthodromique (formule de Haversine), en mètres. */
export function haversine(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Point atteint en partant de `p` sur `distanceM` mètres au cap `bearingDeg` (0 = nord). */
export function destination(p: LatLon, distanceM: number, bearingDeg: number): LatLon {
  const d = distanceM / R;
  const b = toRad(bearingDeg);
  const lat1 = toRad(p.lat);
  const lon1 = toRad(p.lon);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lon2 = lon1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: toDeg(lat2), lon: ((toDeg(lon2) + 540) % 360) - 180 };
}

export function bearing(a: LatLon, b: LatLon): number {
  const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Arrondit une position à une grille d'environ `stepM` mètres (100 m par défaut).
 * Utilisé avant tout envoi au serveur : la position précise ne quitte jamais le téléphone.
 */
export function roundPosition(p: LatLon, stepM = 100): LatLon {
  const latStep = stepM / 111_320;
  // On arrondit la latitude d'abord, puis la longitude sur la latitude arrondie
  // pour que deux points voisins tombent dans la même cellule.
  const lat = Math.round(p.lat / latStep) * latStep;
  const lonStepR = stepM / (111_320 * Math.max(0.1, Math.cos(toRad(lat))));
  const lon = Math.round(p.lon / lonStepR) * lonStepR;
  return { lat: Number(lat.toFixed(5)), lon: Number(lon.toFixed(5)) };
}

/** Projection locale équirectangulaire (mètres) autour d'une origine : précise sur quelques km. */
export function toLocalXY(origin: LatLon, p: LatLon): { x: number; y: number } {
  const kx = 111_320 * Math.cos(toRad(origin.lat));
  return { x: (p.lon - origin.lon) * kx, y: (p.lat - origin.lat) * 110_574 };
}

/** Point dans polygone (anneau fermé ou non), coordonnées [lon, lat]. Lancer de rayon. */
export function pointInRing(p: LatLon, ring: ReadonlyArray<readonly [number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as readonly [number, number];
    const [xj, yj] = ring[j] as readonly [number, number];
    if (yi > p.lat !== yj > p.lat && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance (m) entre un point et une polyligne [lon, lat][]. */
export function distanceToPolyline(p: LatLon, line: ReadonlyArray<readonly [number, number]>): number {
  if (line.length === 0) return Infinity;
  if (line.length === 1) {
    const [lon, lat] = line[0] as readonly [number, number];
    return haversine(p, { lat, lon });
  }
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i] as readonly [number, number];
    const [bx, by] = line[i + 1] as readonly [number, number];
    const a = toLocalXY(p, { lon: ax, lat: ay });
    const b = toLocalXY(p, { lon: bx, lat: by });
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / len2));
    const cx = a.x + t * dx;
    const cy = a.y + t * dy;
    best = Math.min(best, Math.hypot(cx, cy));
  }
  return best;
}

/** Aire approximative (m²) d'un anneau [lon, lat][] (formule du lacet en projection locale). */
export function ringAreaM2(ring: ReadonlyArray<readonly [number, number]>): number {
  if (ring.length < 3) return 0;
  const [lon0, lat0] = ring[0] as readonly [number, number];
  const o = { lat: lat0, lon: lon0 };
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [lj, aj] = ring[j] as readonly [number, number];
    const [li, ai] = ring[i] as readonly [number, number];
    const pj = toLocalXY(o, { lon: lj, lat: aj });
    const pi = toLocalXY(o, { lon: li, lat: ai });
    s += pj.x * pi.y - pi.x * pj.y;
  }
  return Math.abs(s) / 2;
}

/**
 * Décale une polyligne [lon, lat][] de `offsetM` mètres perpendiculairement
 * (positif = à gauche dans le sens de parcours).
 */
export function offsetLine(line: ReadonlyArray<readonly [number, number]>, offsetM: number): Array<[number, number]> {
  if (line.length < 2) return line.map(([a, b]) => [a, b]);
  const [lon0, lat0] = line[0] as readonly [number, number];
  const o = { lon: lon0, lat: lat0 };
  const kx = 111_320 * Math.cos(toRad(o.lat));
  const ky = 110_574;
  const xy = line.map(([lon, lat]) => toLocalXY(o, { lon, lat }));
  return xy.map((p, i) => {
    const prev = xy[Math.max(0, i - 1)] as { x: number; y: number };
    const next = xy[Math.min(xy.length - 1, i + 1)] as { x: number; y: number };
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const x = p.x + nx * offsetM;
    const y = p.y + ny * offsetM;
    return [Number((o.lon + x / kx).toFixed(6)), Number((o.lat + y / ky).toFixed(6))];
  });
}

/** Longueur d'une polyligne [lon, lat][] en mètres. */
export function lineLength(line: ReadonlyArray<readonly [number, number]>): number {
  let s = 0;
  for (let i = 1; i < line.length; i++) {
    const [a1, b1] = line[i - 1] as readonly [number, number];
    const [a2, b2] = line[i] as readonly [number, number];
    s += haversine({ lon: a1, lat: b1 }, { lon: a2, lat: b2 });
  }
  return s;
}
