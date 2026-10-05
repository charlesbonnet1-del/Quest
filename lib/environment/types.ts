/** Données de contexte (OSM simplifié) téléchargées à la préparation et gardées hors ligne. */
import type { PoiType } from "../content/schema";
import type { LatLon } from "../geo/geo";

export type Ring = Array<[number, number]>; // [lon, lat]

export type AreaClass = "foret" | "parc" | "eau" | "agricole" | "bati";

export interface ContextArea {
  id: string;
  cls: AreaClass;
  /** Étiquette OSM principale, ex. "leisure=park". */
  tag: string;
  outer: Ring[];
  inner: Ring[];
  areaM2: number;
  name?: string;
}

export interface ContextLine {
  id: string;
  cls: "eau";
  tag: string;
  coords: Ring;
}

export interface ContextPoi {
  id: string;
  type: PoiType;
  lat: number;
  lon: number;
  name?: string;
  /** Pour les éléments surfaciques (plan d'eau, forêt, aire de jeux) : distance mesurée au contour. */
  areaId?: string;
}

export interface ContextData {
  version: 1;
  center: LatLon;
  radiusM: number;
  fetchedAt: string;
  source: "overpass" | "fixture" | "vide";
  areas: ContextArea[];
  lines: ContextLine[];
  pois: ContextPoi[];
  /** Nombre de bâtiments dans un petit rayon autour du centre (densité urbaine au départ). */
  urban?: { buildings: number; radiusM: number };
}

export function emptyContext(center: LatLon): ContextData {
  return { version: 1, center, radiusM: 0, fetchedAt: new Date().toISOString(), source: "vide", areas: [], lines: [], pois: [] };
}
