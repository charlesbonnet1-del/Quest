/**
 * Fournisseur de position SIMULÉ (mode ?sim=1).
 * - position de départ libre ;
 * - « avancer de N mètres » (le long du trajet chargé, sinon vers l'est) ;
 * - rejeu d'un trajet prédéfini ou d'un GPX à vitesse réglable.
 * Son horloge est accélérée avec la vitesse de rejeu : écarts et silences de défi aussi.
 */
import type { Clock } from "../engine/clock";
import type { PositionFix } from "../geo/filter";
import { destination, type LatLon } from "../geo/geo";
import type { PositionErrorKind, PositionProvider } from "../geo/provider";
import { RouteWalker } from "./walker";

export const WALK_SPEED_MPS = 1.3;

export class SimClock implements Clock {
  private acc = 0;
  private lastReal = Date.now();
  readonly base = Date.now();
  speed = 1;

  now(): number {
    const r = Date.now();
    this.acc += (r - this.lastReal) * this.speed;
    this.lastReal = r;
    return this.base + this.acc;
  }

  jump(ms: number): void {
    this.now();
    this.acc += ms;
  }
}

export interface SimStatus {
  position: LatLon | null;
  routeId: string | null;
  routeDistanceM: number;
  routeLengthM: number;
  playing: boolean;
  speed: number;
}

export class SimulatedProvider implements PositionProvider {
  readonly kind = "simule" as const;
  readonly clock = new SimClock();
  private onFix: ((f: PositionFix) => void) | null = null;
  private pos: LatLon | null = null;
  private walker: RouteWalker | null = null;
  private routeId: string | null = null;
  private routeDist = 0;
  private playing = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSim = 0;
  private listeners = new Set<(s: SimStatus) => void>();

  constructor(start?: LatLon) {
    this.pos = start ?? null;
  }

  start(onFix: (fix: PositionFix) => void, _onError: (kind: PositionErrorKind, message: string) => void): void {
    this.onFix = onFix;
    if (this.pos) this.emitFix();
    if (!this.timer) {
      this.lastSim = this.clock.now();
      this.timer = setInterval(() => this.tick(), 500);
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.onFix = null;
    this.playing = false;
  }

  subscribe(fn: (s: SimStatus) => void): () => void {
    this.listeners.add(fn);
    fn(this.status());
    return () => this.listeners.delete(fn);
  }

  status(): SimStatus {
    return {
      position: this.pos,
      routeId: this.routeId,
      routeDistanceM: this.routeDist,
      routeLengthM: this.walker?.length ?? 0,
      playing: this.playing,
      speed: this.clock.speed,
    };
  }

  get position(): LatLon | null {
    return this.pos;
  }

  setStart(p: LatLon): void {
    this.pos = p;
    this.walker = null;
    this.routeId = null;
    this.routeDist = 0;
    this.playing = false;
    this.emitFix();
  }

  loadRoute(id: string, points: ReadonlyArray<readonly [number, number]>, tours = 1): void {
    this.walker = new RouteWalker(points, tours);
    this.routeId = id;
    this.routeDist = 0;
    this.pos = this.walker.at(0);
    this.playing = false;
    this.emitFix();
  }

  setSpeed(speed: number): void {
    this.clock.now();
    this.clock.speed = Math.max(0.25, Math.min(50, speed));
    this.notify();
  }

  play(): void {
    if (!this.walker) return;
    this.lastSim = this.clock.now();
    this.playing = true;
    this.notify();
  }

  pausePlayback(): void {
    this.playing = false;
    this.notify();
  }

  /** Avance instantanément de `meters` (points intermédiaires tous les 5 m, à vitesse de marche). */
  advance(meters: number, bearingDeg = 90): void {
    if (!this.pos) return;
    const step = 5;
    for (let done = 0; done < meters; done += step) {
      const d = Math.min(step, meters - done);
      this.clock.jump((d / WALK_SPEED_MPS) * 1000);
      if (this.walker) {
        this.routeDist = Math.min(this.walker.length, this.routeDist + d);
        this.pos = this.walker.at(this.routeDist);
      } else {
        this.pos = destination(this.pos, d, bearingDeg);
      }
      this.emitFix();
    }
    this.lastSim = this.clock.now();
  }

  private tick(): void {
    const now = this.clock.now();
    const dt = (now - this.lastSim) / 1000;
    this.lastSim = now;
    if (!this.playing || !this.walker) {
      // Même immobile, on émet une position de temps en temps (comme un vrai GPS).
      if (this.pos && Math.random() < 0.5) this.emitFix();
      return;
    }
    this.routeDist = Math.min(this.walker.length, this.routeDist + WALK_SPEED_MPS * dt);
    this.pos = this.walker.at(this.routeDist);
    if (this.routeDist >= this.walker.length) this.playing = false;
    this.emitFix();
  }

  private emitFix(): void {
    if (this.pos && this.onFix) this.onFix({ ...this.pos, accuracy: 5, timestamp: this.clock.now() });
    this.notify();
  }

  private notify(): void {
    const s = this.status();
    for (const l of this.listeners) l(s);
  }
}

/** Lecture minimale d'un fichier GPX (trkpt / rtept / wpt). */
export function parseGpx(xml: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const re = /<(?:trkpt|rtept)\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const attrs = m[1] ?? "";
    const lat = /lat\s*=\s*"([-\d.]+)"/.exec(attrs)?.[1];
    const lon = /lon\s*=\s*"([-\d.]+)"/.exec(attrs)?.[1];
    if (lat && lon) out.push([Number(lon), Number(lat)]);
  }
  return out;
}
