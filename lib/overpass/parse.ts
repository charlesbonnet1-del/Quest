/**
 * Conversion d'une réponse Overpass (`out geom`) en ContextData compact.
 * Pure : testée avec des réponses Overpass réalistes (tests/fixtures).
 */
import type { PoiType } from "../content/schema";
import { ringAreaM2, type LatLon } from "../geo/geo";
import type { AreaClass, ContextArea, ContextData, ContextLine, ContextPoi, Ring } from "../environment/types";
import { isClosed, roundRing, simplifyRing } from "./simplify";

type Tags = Record<string, string>;
interface GeomPoint {
  lat: number;
  lon: number;
}
interface OsmNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags?: Tags;
}
interface OsmWay {
  type: "way";
  id: number;
  geometry?: GeomPoint[];
  tags?: Tags;
}
interface OsmRelation {
  type: "relation";
  id: number;
  members?: Array<{ type: string; role: string; geometry?: GeomPoint[] }>;
  tags?: Tags;
}
interface OsmCount {
  type: "count";
  tags?: Tags;
}
export type OsmElement = OsmNode | OsmWay | OsmRelation | OsmCount;
export interface OverpassResponse {
  elements: OsmElement[];
}

export function areaClassOf(t: Tags): { cls: AreaClass; tag: string } | undefined {
  if (t.natural === "wood") return { cls: "foret", tag: "natural=wood" };
  if (t.landuse === "forest") return { cls: "foret", tag: "landuse=forest" };
  if (t.natural === "water") return { cls: "eau", tag: "natural=water" };
  if (t.waterway === "riverbank") return { cls: "eau", tag: "waterway=riverbank" };
  if (t.leisure && ["park", "garden", "playground", "nature_reserve"].includes(t.leisure)) {
    return { cls: "parc", tag: `leisure=${t.leisure}` };
  }
  if (t.landuse && ["grass", "recreation_ground", "village_green"].includes(t.landuse)) {
    return { cls: "parc", tag: `landuse=${t.landuse}` };
  }
  if (t.landuse && ["farmland", "meadow", "orchard", "vineyard"].includes(t.landuse)) {
    return { cls: "agricole", tag: `landuse=${t.landuse}` };
  }
  if (t.landuse && ["residential", "commercial", "retail", "industrial"].includes(t.landuse)) {
    return { cls: "bati", tag: `landuse=${t.landuse}` };
  }
  return undefined;
}

export function poiTypeOf(t: Tags): PoiType | undefined {
  if ((t.historic === "memorial" && t.memorial === "statue") || (t.tourism === "artwork" && t.artwork_type === "statue") || t.historic === "statue") {
    return "statue";
  }
  if (t.amenity === "fountain") return "fontaine";
  if (t.historic === "monument") return "monument";
  if (t.tourism === "viewpoint") return "point_de_vue";
  if (t.natural === "tree") return "arbre_remarquable";
  return undefined;
}

const toRing = (g: GeomPoint[]): Ring => g.map((p) => [p.lon, p.lat]);

/** Assemble des morceaux de chemins (membres de relation) en anneaux fermés. */
export function assembleRings(parts: Ring[]): Ring[] {
  const rings: Ring[] = [];
  const pool = parts.filter((p) => p.length >= 2).map((p) => [...p] as Ring);
  const same = (a?: [number, number], b?: [number, number]) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
  while (pool.length) {
    let cur = pool.shift() as Ring;
    let guard = 0;
    while (!isClosed(cur) && guard++ < 10_000) {
      const end = cur[cur.length - 1];
      const i = pool.findIndex((p) => same(p[0], end) || same(p[p.length - 1], end));
      if (i < 0) break;
      const next = pool.splice(i, 1)[0] as Ring;
      cur = same(next[0], end) ? [...cur, ...next.slice(1)] : [...cur, ...next.reverse().slice(1)];
    }
    if (cur.length >= 4) {
      if (!isClosed(cur)) cur.push(cur[0] as [number, number]);
      rings.push(cur);
    }
  }
  return rings;
}

function centroid(r: Ring): LatLon {
  let lat = 0;
  let lon = 0;
  for (const [x, y] of r) {
    lon += x;
    lat += y;
  }
  return { lat: lat / r.length, lon: lon / r.length };
}

export interface ParseOptions {
  center: LatLon;
  radiusM: number;
  simplifyM: number;
  source?: ContextData["source"];
  now?: Date;
}

export function parseOverpass(resp: OverpassResponse, o: ParseOptions): ContextData {
  const areas: ContextArea[] = [];
  const lines: ContextLine[] = [];
  const pois: ContextPoi[] = [];
  let urban: ContextData["urban"];
  const prep = (r: Ring) => roundRing(simplifyRing(r, o.simplifyM));

  for (const el of resp.elements) {
    const t = el.tags ?? {};
    if (el.type === "count") {
      urban = { buildings: Number(t.ways ?? t.total ?? 0), radiusM: 300 };
      continue;
    }
    const id = `${el.type[0]}${el.id}`;
    const name = t.name;

    if (el.type === "node") {
      const pt = poiTypeOf(t);
      if (pt) pois.push({ id, type: pt, lat: el.lat, lon: el.lon, ...(name ? { name } : {}) });
      continue;
    }

    // Lignes d'eau
    if (el.type === "way" && el.geometry && (t.waterway === "river" || t.waterway === "canal" || t.natural === "coastline")) {
      if (t.tunnel) continue;
      lines.push({ id, cls: "eau", tag: t.natural === "coastline" ? "natural=coastline" : `waterway=${t.waterway}`, coords: prep(toRing(el.geometry)) });
      continue;
    }

    let outer: Ring[] = [];
    let inner: Ring[] = [];
    if (el.type === "way" && el.geometry) {
      const r = toRing(el.geometry);
      if (isClosed(r) && r.length >= 4) outer = [r];
    } else if (el.type === "relation" && el.members) {
      const outs = el.members.filter((m) => m.type === "way" && m.geometry && m.role !== "inner").map((m) => toRing(m.geometry as GeomPoint[]));
      const ins = el.members.filter((m) => m.type === "way" && m.geometry && m.role === "inner").map((m) => toRing(m.geometry as GeomPoint[]));
      outer = assembleRings(outs);
      inner = assembleRings(ins);
    }

    const ac = areaClassOf(t);
    const pt = poiTypeOf(t);
    if (outer.length === 0) continue;
    const areaM2 = Math.round(outer.reduce((s, r) => s + ringAreaM2(r), 0) - inner.reduce((s, r) => s + ringAreaM2(r), 0));

    if (ac) {
      areas.push({ id, cls: ac.cls, tag: ac.tag, outer: outer.map(prep), inner: inner.map(prep), areaM2, ...(name ? { name } : {}) });
      // Éléments surfaciques qui servent aussi de lieux d'intérêt.
      const big = outer[0] as Ring;
      const c = centroid(big);
      if (ac.tag === "natural=water" && areaM2 >= 200) pois.push({ id, type: "plan_eau", ...c, areaId: id, ...(name ? { name } : {}) });
      if (ac.cls === "foret" && areaM2 >= 5000) pois.push({ id, type: "foret", ...c, areaId: id, ...(name ? { name } : {}) });
      if (ac.tag === "leisure=playground") pois.push({ id, type: "aire_de_jeux", ...c, areaId: id, ...(name ? { name } : {}) });
    } else if (pt) {
      // Fontaine, statue... cartographiée en surface : on garde son centre.
      pois.push({ id, type: pt, ...centroid(outer[0] as Ring), ...(name ? { name } : {}) });
    }
  }

  return {
    version: 1,
    center: o.center,
    radiusM: o.radiusM,
    fetchedAt: (o.now ?? new Date()).toISOString(),
    source: o.source ?? "overpass",
    areas,
    lines,
    pois,
    ...(urban ? { urban } : {}),
  };
}
