/**
 * Génère les jeux de données OSM de test (format de réponse Overpass `out geom`) :
 * lib/sim/fixtures/*.json. Géométries tracées à la main, proches de la réalité,
 * pour tester la classification et jouer la simulation sans réseau.
 *   pnpm tsx scripts/make-fixtures.ts
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { destination, offsetLine } from "../lib/geo/geo";
import { SEINE_AXIS } from "../lib/sim/routes";

type P = [number, number];
let nextId = 1000;
const g = (r: P[]) => r.map(([lon, lat]) => ({ lat, lon }));
const close = (r: P[]): P[] => [...r, r[0] as P];
const way = (tags: Record<string, string>, ring: P[]) => ({ type: "way", id: nextId++, tags, geometry: g(ring) });
const node = (tags: Record<string, string>, lon: number, lat: number) => ({ type: "node", id: nextId++, lat, lon, tags });
const count = (n: number) => ({ type: "count", id: 0, tags: { nodes: "0", ways: String(n), relations: "0", total: String(n) } });
const rel = (tags: Record<string, string>, outers: P[][], inners: P[][] = []) => ({
  type: "relation",
  id: nextId++,
  tags: { type: "multipolygon", ...tags },
  members: [
    ...outers.map((r) => ({ type: "way", ref: nextId++, role: "outer", geometry: g(r) })),
    ...inners.map((r) => ({ type: "way", ref: nextId++, role: "inner", geometry: g(r) })),
  ],
});
/** Rectangle [ouest, sud, est, nord]. */
const rect = (w: number, s: number, e: number, n: number): P[] => close([[w, s], [e, s], [e, n], [w, n]]);
/** Polygone approximant un cercle. */
const circle = (lon: number, lat: number, rM: number, k = 12): P[] =>
  close(Array.from({ length: k }, (_, i) => {
    const d = destination({ lat, lon }, rM, (360 / k) * i);
    return [Number(d.lon.toFixed(6)), Number(d.lat.toFixed(6))] as P;
  }));

const out = (name: string, elements: unknown[]) => {
  const file = path.join("lib/sim/fixtures", `${name}.json`);
  writeFileSync(file, `${JSON.stringify({ version: 0.6, generator: "fixture (tracé à la main)", elements }, null, 1)}\n`);
  console.log(`${file} : ${elements.length} éléments`);
};

// ── Parc Monceau ───────────────────────────────────────────────
nextId = 1000;
out("paris-parc-monceau", [
  way({ leisure: "park", name: "Parc Monceau" }, close([
    [2.3062, 48.8787], [2.3079, 48.8776], [2.3106, 48.8783], [2.3116, 48.8799],
    [2.3106, 48.8814], [2.3088, 48.8813], [2.3070, 48.8805],
  ])),
  way({ natural: "water", water: "pond", name: "Bassin de la Naumachie" }, circle(2.3104, 48.88115, 14)),
  way({ leisure: "playground" }, circle(2.3086, 48.87795, 15, 8)),
  node({ historic: "memorial", memorial: "statue", name: "Monument à Guy de Maupassant" }, 2.30715, 48.8797),
  node({ tourism: "artwork", artwork_type: "statue", name: "Monument à Chopin" }, 2.3096, 48.87865),
  way({ landuse: "grass" }, rect(2.3082, 48.8793, 2.3094, 48.8800)),
  way({ landuse: "residential" }, rect(2.3000, 48.8800, 2.3062, 48.8840)),
  way({ landuse: "residential" }, rect(2.3062, 48.8814, 2.3140, 48.8850)),
  way({ landuse: "residential" }, rect(2.3116, 48.8760, 2.3180, 48.8814)),
  way({ landuse: "residential" }, rect(2.3020, 48.8740, 2.3116, 48.8776)),
  way({ landuse: "commercial" }, rect(2.2990, 48.8740, 2.3062, 48.8787)),
  count(180),
]);

// ── Berges de Seine (Orsay → Alma) ─────────────────────────────
nextId = 2000;
const north = offsetLine(SEINE_AXIS, -75); // rive droite
const south = offsetLine(SEINE_AXIS, 75); // rive gauche
const riverArea = close([...north, ...[...south].reverse()]);
// La surface du fleuve est en général une relation multipolygone découpée en morceaux.
const half = Math.floor(riverArea.length / 2);
out("paris-berge-seine", [
  way({ waterway: "river", name: "La Seine" }, SEINE_AXIS),
  rel({ natural: "water", water: "river", name: "La Seine" }, [riverArea.slice(0, half + 1), riverArea.slice(half)]),
  way({ landuse: "residential" }, close([...offsetLine(SEINE_AXIS, 130), ...[...offsetLine(SEINE_AXIS, 600)].reverse()])),
  way({ landuse: "commercial" }, close([...offsetLine(SEINE_AXIS, -130), ...[...offsetLine(SEINE_AXIS, -600)].reverse()])),
  way({ leisure: "park", name: "Jardins des Champs-Élysées" }, rect(2.3080, 48.8650, 2.3170, 48.8680)),
  node({ tourism: "viewpoint" }, 2.31995, 48.86245),
  node({ historic: "memorial", memorial: "statue", name: "Le Zouave" }, 2.30335, 48.86265),
  count(60),
]);

// ── Rue Montorgueil – Saint-Denis ──────────────────────────────
nextId = 3000;
out("paris-rue-montorgueil", [
  way({ landuse: "residential" }, rect(2.3430, 48.8600, 2.3530, 48.8720)),
  way({ landuse: "retail", name: "Forum des Halles" }, rect(2.3440, 48.8605, 2.3470, 48.8618)),
  way({ leisure: "garden", name: "Jardin Nelson Mandela" }, rect(2.3405, 48.8612, 2.3438, 48.8630)),
  node({ amenity: "fountain", name: "Fontaine des Innocents" }, 2.34805, 48.86085),
  node({ historic: "monument", name: "Porte Saint-Denis" }, 2.35215, 48.86945),
  count(420),
]);

// ── Forêt (Fontainebleau) : relation avec clairière intérieure en plusieurs morceaux ──
nextId = 4000;
const forestOuter: P[] = close([[2.6500, 48.3900], [2.7100, 48.3900], [2.7100, 48.4300], [2.6500, 48.4300]]);
out("foret-fontainebleau", [
  rel({ landuse: "forest", name: "Forêt de Fontainebleau" },
    [forestOuter.slice(0, 3), forestOuter.slice(2)],
    [rect(2.6800, 48.4080, 2.6830, 48.4100)]),
  way({ natural: "water", name: "Mare aux Fées" }, circle(2.6650, 48.4150, 30)),
  node({ tourism: "viewpoint", name: "Point de vue du Cassepot" }, 2.6900, 48.4200),
  node({ natural: "tree", denotation: "natural_monument", name: "Chêne Jupiter" }, 2.6720, 48.4010),
  way({ landuse: "residential" }, rect(2.7100, 48.3950, 2.7300, 48.4100)),
  count(0),
]);

// ── Campagne (Beauce) : champs + petit village ─────────────────
nextId = 5000;
out("campagne-beauce", [
  way({ landuse: "farmland", crop: "wheat" }, rect(1.6000, 48.3000, 1.6200, 48.3150)),
  way({ landuse: "farmland" }, rect(1.6200, 48.3000, 1.6400, 48.3150)),
  way({ landuse: "meadow" }, rect(1.6000, 48.3150, 1.6150, 48.3200)),
  way({ landuse: "residential", name: "Hameau" }, rect(1.6210, 48.3160, 1.6260, 48.3200)),
  count(4),
]);

// ── Zone sans données ──────────────────────────────────────────
out("vide", [count(0)]);
