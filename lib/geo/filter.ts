/**
 * Filtrage des positions GPS pour la marche à pied.
 * - ignore les points imprécis (précision > maxAccuracyM) ;
 * - ignore les sauts irréalistes (vitesse > maxSpeedMps) ;
 * - n'ajoute de la distance que si l'on s'est éloigné d'au moins minStepM du dernier point
 *   retenu (évite que la dérive GPS à l'arrêt fasse grimper le compteur).
 * Si plusieurs points d'affilée sont rejetés comme « sauts » mais cohérents entre eux,
 * on se recale dessus (sans compter la distance) : c'était le point d'ancrage qui était faux.
 */
import { haversine, type LatLon } from "./geo";

export interface PositionFix extends LatLon {
  /** Précision horizontale (m), rayon de confiance à 68 %. */
  accuracy: number;
  /** Horodatage en ms (horloge du fournisseur de position). */
  timestamp: number;
}

export interface FilterOptions {
  maxAccuracyM: number;
  maxSpeedMps: number;
  minStepM: number;
  /** Nombre de « sauts » cohérents d'affilée avant de se recaler. */
  resyncAfter: number;
}

export const DEFAULT_FILTER: FilterOptions = {
  maxAccuracyM: 30,
  // Marche rapide ~1,7 m/s, enfant qui court ~3-4 m/s ; marge pour le bruit GPS.
  maxSpeedMps: 4.5,
  minStepM: 6,
  resyncAfter: 4,
};

export type FilterResult =
  | { accepted: true; deltaM: number; position: PositionFix }
  | { accepted: false; reason: "precision" | "saut" | "immobile" | "horodatage"; position: PositionFix };

export class PositionFilter {
  private anchor: PositionFix | null = null;
  private jumps: PositionFix[] = [];
  readonly opts: FilterOptions;

  constructor(opts: Partial<FilterOptions> = {}) {
    this.opts = { ...DEFAULT_FILTER, ...opts };
  }

  /** Dernière position retenue (référence pour la distance). */
  get last(): PositionFix | null {
    return this.anchor;
  }

  reset(): void {
    this.anchor = null;
    this.jumps = [];
  }

  push(fix: PositionFix): FilterResult {
    if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lon) || fix.accuracy > this.opts.maxAccuracyM) {
      return { accepted: false, reason: "precision", position: fix };
    }
    if (!this.anchor) {
      this.anchor = fix;
      return { accepted: true, deltaM: 0, position: fix };
    }
    const dt = (fix.timestamp - this.anchor.timestamp) / 1000;
    if (dt <= 0) return { accepted: false, reason: "horodatage", position: fix };
    const d = haversine(this.anchor, fix);
    // Tolérance : la vitesse apparente peut être gonflée par l'imprécision des deux points.
    const tolerance = (this.anchor.accuracy + fix.accuracy) / 2;
    if (d - tolerance > this.opts.maxSpeedMps * dt) {
      this.jumps.push(fix);
      if (this.jumps.length >= this.opts.resyncAfter && this.jumpsAreConsistent()) {
        this.anchor = fix;
        this.jumps = [];
      }
      return { accepted: false, reason: "saut", position: fix };
    }
    this.jumps = [];
    if (d < Math.max(this.opts.minStepM, Math.min(fix.accuracy, this.anchor.accuracy) * 0.5)) {
      return { accepted: false, reason: "immobile", position: fix };
    }
    this.anchor = fix;
    return { accepted: true, deltaM: d, position: fix };
  }

  private jumpsAreConsistent(): boolean {
    for (let i = 1; i < this.jumps.length; i++) {
      const a = this.jumps[i - 1] as PositionFix;
      const b = this.jumps[i] as PositionFix;
      const dt = Math.max(1, (b.timestamp - a.timestamp) / 1000);
      if (haversine(a, b) > this.opts.maxSpeedMps * dt + 10) return false;
    }
    return true;
  }
}
