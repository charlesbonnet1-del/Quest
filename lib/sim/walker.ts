/** Parcours d'une polyligne à une distance donnée (interpolation), avec plusieurs tours possibles. */
import { haversine, type LatLon } from "../geo/geo";

export class RouteWalker {
  private readonly pts: LatLon[];
  private readonly cum: number[];
  readonly lapLength: number;

  constructor(points: ReadonlyArray<readonly [number, number]>, readonly tours = 1) {
    this.pts = points.map(([lon, lat]) => ({ lat, lon }));
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) {
      this.cum.push((this.cum[i - 1] as number) + haversine(this.pts[i - 1] as LatLon, this.pts[i] as LatLon));
    }
    this.lapLength = this.cum[this.cum.length - 1] ?? 0;
  }

  get length(): number {
    return this.lapLength * this.tours;
  }

  /** Position après `s` mètres (bornée à la fin du parcours). */
  at(s: number): LatLon {
    if (this.pts.length === 0) throw new Error("trajet vide");
    if (this.lapLength === 0) return this.pts[0] as LatLon;
    const clamped = Math.max(0, Math.min(s, this.length));
    const d = clamped >= this.length ? this.lapLength : clamped % this.lapLength;
    let i = 1;
    while (i < this.cum.length - 1 && (this.cum[i] as number) < d) i++;
    const a = this.pts[i - 1] as LatLon;
    const b = this.pts[i] as LatLon;
    const seg = (this.cum[i] as number) - (this.cum[i - 1] as number);
    const t = seg === 0 ? 0 : (d - (this.cum[i - 1] as number)) / seg;
    return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
  }
}
