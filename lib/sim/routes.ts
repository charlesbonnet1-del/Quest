/**
 * Trajets prédéfinis pour le mode simulation (Paris).
 * Coordonnées [lon, lat] approximatives, tracées à la main sur des chemins piétons.
 * Chaque trajet est associé à un jeu de données OSM de test (lib/sim/fixtures) pour
 * pouvoir jouer hors ligne ; en ligne, la détection utilise Overpass aux coordonnées simulées.
 */
import { offsetLine } from "../geo/geo";

export interface SimRoute {
  id: string;
  nom: string;
  description: string;
  fixture: string;
  /** Nombre de tours à enchaîner pour atteindre ~1,5 km. */
  tours: number;
  points: Array<[number, number]>;
}

export const SIM_ROUTES: SimRoute[] = [
  {
    id: "parc",
    nom: "Parc Monceau",
    description: "Boucle dans les allées du parc (passe près d'une statue, d'un bassin et d'une aire de jeux).",
    fixture: "paris-parc-monceau",
    tours: 2,
    points: [
      [2.309, 48.8805],
      [2.3097, 48.88075],
      [2.3104, 48.8809],
      [2.3109, 48.8799],
      [2.3102, 48.8786],
      [2.3091, 48.8783],
      [2.308, 48.878],
      [2.3068, 48.8788],
      [2.307, 48.8796],
      [2.3072, 48.8802],
      [2.3081, 48.8804],
      [2.309, 48.8805],
    ],
  },
  {
    id: "berge",
    nom: "Berges de Seine",
    description: "Promenade sur la berge piétonne rive gauche, du musée d'Orsay vers le pont de l'Alma.",
    fixture: "paris-berge-seine",
    tours: 1,
    // Berge basse : à ~85 m au sud de l'axe du fleuve (le lit fait ~150 m de large).
    // Le parcours va d'est en ouest : le sud est à gauche, donc décalage positif.
    points: [],
  },
  {
    id: "rue",
    nom: "Rue Montorgueil",
    description: "Rues piétonnes du quartier Montorgueil – Saint-Denis (passe près de la fontaine des Innocents).",
    fixture: "paris-rue-montorgueil",
    tours: 1,
    points: [
      [2.3449, 48.8635],
      [2.3459, 48.8648],
      [2.3468, 48.866],
      [2.3476, 48.8672],
      [2.3483, 48.8685],
      [2.3488, 48.8697],
      [2.3499, 48.8694],
      [2.3496, 48.868],
      [2.3493, 48.8665],
      [2.349, 48.865],
      [2.3488, 48.8635],
      [2.3485, 48.862],
      [2.3483, 48.861],
      [2.347, 48.8612],
      [2.3458, 48.8618],
      [2.3449, 48.8625],
      [2.3449, 48.8635],
    ],
  },
];

/** Tracé approximatif de l'axe de la Seine entre Orsay et l'Alma, d'est en ouest. */
export const SEINE_AXIS: Array<[number, number]> = [
  [2.3335, 48.8592],
  [2.3290, 48.8607],
  [2.3245, 48.8620],
  [2.3200, 48.8632],
  [2.3150, 48.8639],
  [2.3100, 48.8641],
  [2.3050, 48.8636],
  [2.3010, 48.8628],
];

const berge = SIM_ROUTES.find((r) => r.id === "berge");
if (berge) berge.points = offsetLine(SEINE_AXIS.slice(1), 85);

export function getRoute(id: string): SimRoute | undefined {
  return SIM_ROUTES.find((r) => r.id === id);
}
