/**
 * Fournisseur de position abstrait. Deux implémentations :
 * - GeolocationProvider : API Geolocation du navigateur (watchPosition) ;
 * - SimulatedProvider (lib/sim/provider.ts) : positions simulées pour tester au bureau.
 */
import type { Clock } from "../engine/clock";
import type { PositionFix } from "./filter";

export type PositionErrorKind = "refusee" | "indisponible" | "delai" | "non_supportee";

export interface PositionProvider {
  readonly kind: "reel" | "simule";
  readonly clock: Clock;
  start(onFix: (fix: PositionFix) => void, onError: (kind: PositionErrorKind, message: string) => void): void;
  stop(): void;
}

export class GeolocationProvider implements PositionProvider {
  readonly kind = "reel" as const;
  readonly clock: Clock = { now: () => Date.now() };
  private watchId: number | null = null;

  start(onFix: (fix: PositionFix) => void, onError: (kind: PositionErrorKind, message: string) => void): void {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      onError("non_supportee", "La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    if (this.watchId !== null) return;
    this.watchId = navigator.geolocation.watchPosition(
      (p) =>
        onFix({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          accuracy: p.coords.accuracy,
          // On utilise l'horloge locale plutôt que p.timestamp (parfois incohérent sur iOS).
          timestamp: Date.now(),
        }),
      (e) => {
        const kind: PositionErrorKind = e.code === e.PERMISSION_DENIED ? "refusee" : e.code === e.TIMEOUT ? "delai" : "indisponible";
        onError(kind, e.message);
      },
      // Haute précision indispensable à pied. maximumAge laisse le système réutiliser
      // une position récente : un peu moins de réveils du GPS, donc de batterie.
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 30_000 },
    );
  }

  stop(): void {
    if (this.watchId !== null && typeof navigator !== "undefined") navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }
}

/** Demande ponctuelle de position (préparation). */
export function getCurrentPosition(timeoutMs = 20_000): Promise<PositionFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(Object.assign(new Error("Géolocalisation non disponible"), { kind: "non_supportee" }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy, timestamp: Date.now() }),
      (e) =>
        reject(
          Object.assign(new Error(e.message), {
            kind: e.code === e.PERMISSION_DENIED ? "refusee" : e.code === e.TIMEOUT ? "delai" : "indisponible",
          }),
        ),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 10_000 },
    );
  });
}
