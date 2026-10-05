/** Simplification de Douglas-Peucker en mètres (projection locale), pour alléger le pack hors ligne. */
import { toLocalXY } from "../geo/geo";
import type { Ring } from "../environment/types";

export function simplifyRing(ring: Ring, toleranceM: number): Ring {
  if (ring.length <= 4) return ring;
  const first = ring[0] as [number, number];
  const origin = { lon: first[0], lat: first[1] };
  const pts = ring.map(([lon, lat]) => toLocalXY(origin, { lon, lat }));
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, ring.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop() as [number, number];
    const a = pts[s] as { x: number; y: number };
    const b = pts[e] as { x: number; y: number };
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const p = pts[i] as { x: number; y: number };
      const d = len === 0 ? Math.hypot(p.x - a.x, p.y - a.y) : Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > toleranceM) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out = ring.filter((_, i) => keep[i] === 1);
  // Un anneau fermé doit garder au moins 4 points (triangle + fermeture).
  return out.length >= 4 || !isClosed(ring) ? out : ring;
}

export function isClosed(r: Ring): boolean {
  const a = r[0];
  const b = r[r.length - 1];
  return !!a && !!b && a[0] === b[0] && a[1] === b[1];
}

export function roundRing(r: Ring, decimals = 5): Ring {
  const f = 10 ** decimals;
  return r.map(([lon, lat]) => [Math.round(lon * f) / f, Math.round(lat * f) / f]);
}
