/** Avertissement (non bloquant) si le coucher du soleil tombe avant la fin estimée de la quête. */
import { getTimes } from "suncalc";
import type { LatLon } from "../geo/geo";

export interface SunsetCheck {
  warn: boolean;
  sunset: Date | null;
  message: string | null;
}

export function checkSunset(p: LatLon, now: Date, durationMin: number): SunsetCheck {
  const times = getTimes(now, p.lat, p.lon);
  const sunset = times.sunset instanceof Date && !Number.isNaN(times.sunset.getTime()) ? times.sunset : null;
  if (!sunset) return { warn: false, sunset: null, message: null };
  const end = new Date(now.getTime() + durationMin * 60_000);
  const fmt = (d: Date) => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  const sunrise = times.sunrise instanceof Date ? times.sunrise : null;
  if (now >= sunset || (sunrise && now < sunrise)) {
    return { warn: true, sunset, message: `Il fait nuit (coucher du soleil à ${fmt(sunset)}). Restez dans un lieu bien éclairé.` };
  }
  if (end > sunset) {
    return {
      warn: true,
      sunset,
      message: `Le soleil se couche à ${fmt(sunset)}, avant la fin estimée de la quête (${fmt(end)}). Prévoyez de rentrer avant la nuit.`,
    };
  }
  return { warn: false, sunset, message: null };
}
