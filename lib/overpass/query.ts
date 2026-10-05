/** Construction de la requête Overpass QL (pure). */
import type { LatLon } from "../geo/geo";

export interface QueryOptions {
  radiusM: number;
  urbanRadiusM: number;
  timeoutS: number;
}

export const DEFAULT_QUERY: QueryOptions = { radiusM: 3000, urbanRadiusM: 300, timeoutS: 25 };

export function buildOverpassQuery(c: LatLon, o: QueryOptions = DEFAULT_QUERY): string {
  const a = `(around:${o.radiusM},${c.lat.toFixed(5)},${c.lon.toFixed(5)})`;
  const u = `(around:${o.urbanRadiusM},${c.lat.toFixed(5)},${c.lon.toFixed(5)})`;
  return `[out:json][timeout:${o.timeoutS}];
(
  wr[natural=wood]${a};
  wr[landuse=forest]${a};
  wr[leisure~"^(park|garden|playground|nature_reserve)$"]${a};
  wr[landuse~"^(grass|recreation_ground|village_green)$"]${a};
  wr[natural=water]${a};
  wr[waterway=riverbank]${a};
  way[waterway~"^(river|canal)$"][!tunnel]${a};
  way[natural=coastline]${a};
  wr[landuse~"^(farmland|meadow|orchard|vineyard)$"]${a};
  wr[landuse~"^(residential|commercial|retail|industrial)$"]${a};
  nwr[historic=memorial][memorial=statue]${a};
  nwr[tourism=artwork][artwork_type=statue]${a};
  nwr[historic=statue]${a};
  nwr[amenity=fountain]${a};
  nwr[historic=monument]${a};
  node[tourism=viewpoint]${a};
  node[natural=tree][denotation~"^(natural_monument|landmark)$"]${a};
);
out geom qt;
way[building]${u};
out count;`;
}
