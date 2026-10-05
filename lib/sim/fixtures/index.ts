/**
 * Jeux de données OSM de test, utilisables hors ligne (tests, simulation).
 * Le typage inféré des JSON importés est trop large : conversion explicite via unknown.
 */
import type { OverpassResponse } from "../../overpass/parse";
import parcMonceau from "./paris-parc-monceau.json";
import bergeSeine from "./paris-berge-seine.json";
import rueMontorgueil from "./paris-rue-montorgueil.json";
import foret from "./foret-fontainebleau.json";
import campagne from "./campagne-beauce.json";
import vide from "./vide.json";

export const FIXTURES: Record<string, OverpassResponse> = {
  "paris-parc-monceau": parcMonceau as unknown as OverpassResponse,
  "paris-berge-seine": bergeSeine as unknown as OverpassResponse,
  "paris-rue-montorgueil": rueMontorgueil as unknown as OverpassResponse,
  "foret-fontainebleau": foret as unknown as OverpassResponse,
  "campagne-beauce": campagne as unknown as OverpassResponse,
  vide: vide as unknown as OverpassResponse,
};
