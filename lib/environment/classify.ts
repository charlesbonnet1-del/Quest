/**
 * Classification de l'environnement à partir des données OSM déjà téléchargées.
 * Fonction pure : aucune requête réseau, testée sur des jeux de données réalistes.
 *
 * Règles (par ordre de priorité, voir DECISIONS.md) :
 *  1. bord_eau : plan d'eau (≥ 1000 m²) ou rivière/canal/rivage à moins de 50 m ;
 *  2. foret    : sous un polygone natural=wood / landuse=forest ;
 *  3. parc     : sous un parc, jardin, aire de jeux, pelouse publique (grass ≥ 2000 m²) ;
 *  4. campagne : sous des terres agricoles, ou terres agricoles à < 150 m et pas de bâti à < 150 m ;
 *  5. ville    : sous / près (150 m) d'une zone bâtie, ou forte densité de bâtiments au départ ;
 *  6. sinon    : campagne si des terres agricoles sont à < 500 m, sinon default.
 */
import type { DetectedEnvironment, Environment } from "../content/schema";
import { distanceToPolyline, pointInRing, type LatLon } from "../geo/geo";
import type { AreaClass, ContextArea, ContextData } from "./types";

export interface ClassifyOptions {
  waterDistanceM: number;
  minWaterAreaM2: number;
  minGrassAreaM2: number;
  nearM: number;
  farmFallbackM: number;
  urbanBuildingsThreshold: number;
}

export const DEFAULT_CLASSIFY: ClassifyOptions = {
  waterDistanceM: 50,
  minWaterAreaM2: 1000,
  minGrassAreaM2: 2000,
  nearM: 150,
  farmFallbackM: 500,
  urbanBuildingsThreshold: 30,
};

export interface Classification {
  env: Environment;
  raison: string;
}

export function isInsideArea(p: LatLon, a: ContextArea): boolean {
  return a.outer.some((r) => pointInRing(p, r)) && !a.inner.some((r) => pointInRing(p, r));
}

/** Distance au contour d'une zone (0 si à l'intérieur). */
export function distanceToArea(p: LatLon, a: ContextArea): number {
  if (isInsideArea(p, a)) return 0;
  let best = Infinity;
  for (const r of [...a.outer, ...a.inner]) best = Math.min(best, distanceToPolyline(p, r));
  return best;
}

function nearest(p: LatLon, areas: ContextArea[], cls: AreaClass, filter?: (a: ContextArea) => boolean) {
  let best: { area: ContextArea; d: number } | undefined;
  for (const a of areas) {
    if (a.cls !== cls || (filter && !filter(a))) continue;
    const d = distanceToArea(p, a);
    if (!best || d < best.d) best = { area: a, d };
  }
  return best;
}

export function classify(p: LatLon, ctx: ContextData, o: ClassifyOptions = DEFAULT_CLASSIFY): Classification {
  if (ctx.source === "vide" || (ctx.areas.length === 0 && ctx.lines.length === 0 && !ctx.urban)) {
    return { env: "default", raison: "aucune donnée de contexte" };
  }

  // 1. Bord de l'eau
  const water = nearest(p, ctx.areas, "eau", (a) => a.areaM2 >= o.minWaterAreaM2);
  if (water && water.d <= o.waterDistanceM) {
    return { env: "bord_eau", raison: `${water.area.tag} à ${Math.round(water.d)} m` };
  }
  for (const l of ctx.lines) {
    const d = distanceToPolyline(p, l.coords);
    if (d <= o.waterDistanceM) return { env: "bord_eau", raison: `${l.tag} à ${Math.round(d)} m` };
  }

  // 2. Forêt
  const forest = ctx.areas.find((a) => a.cls === "foret" && isInsideArea(p, a));
  if (forest) return { env: "foret", raison: `sous ${forest.tag}` };

  // 3. Parc
  const park = ctx.areas.find(
    (a) => a.cls === "parc" && (a.tag !== "landuse=grass" || a.areaM2 >= o.minGrassAreaM2) && isInsideArea(p, a),
  );
  if (park) return { env: "parc", raison: `sous ${park.tag}` };

  // 4. Campagne
  const farm = nearest(p, ctx.areas, "agricole");
  const built = nearest(p, ctx.areas, "bati");
  if (farm && farm.d === 0) return { env: "campagne", raison: `sous ${farm.area.tag}` };
  const builtNear = built !== undefined && built.d <= o.nearM;
  if (farm && farm.d <= o.nearM && !builtNear) {
    return { env: "campagne", raison: `${farm.area.tag} à ${Math.round(farm.d)} m, pas de bâti proche` };
  }

  // 5. Ville
  if (builtNear) return { env: "ville", raison: `${built.area.tag} à ${Math.round(built.d)} m` };
  if (ctx.urban && ctx.urban.buildings >= o.urbanBuildingsThreshold) {
    return { env: "ville", raison: `${ctx.urban.buildings} bâtiments autour du départ` };
  }

  // 6. Repli
  if (farm && farm.d <= o.farmFallbackM) return { env: "campagne", raison: `${farm.area.tag} à ${Math.round(farm.d)} m` };
  return { env: "default", raison: "aucune règle ne s'applique" };
}

export type { DetectedEnvironment };
