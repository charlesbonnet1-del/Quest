/**
 * Client Overpass côté serveur : liste d'endpoints configurable, délai maximal,
 * bascule vers l'endpoint suivant en cas d'échec, cache mémoire par cellule (~100 m).
 * Ne journalise JAMAIS les coordonnées.
 */
import { roundPosition, type LatLon } from "../geo/geo";
import type { ContextData } from "../environment/types";
import { parseOverpass, type OverpassResponse } from "./parse";
import { buildOverpassQuery, DEFAULT_QUERY } from "./query";

export const DEFAULT_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

export function overpassEndpoints(env: NodeJS.ProcessEnv = process.env): string[] {
  const list = env.OVERPASS_ENDPOINTS?.split(",").map((s) => s.trim()).filter(Boolean);
  return list && list.length ? list : DEFAULT_ENDPOINTS;
}

export function overpassTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  return Number(env.OVERPASS_TIMEOUT_MS || 20_000);
}

const TTL_MS = 24 * 3600 * 1000;
const MAX_ENTRIES = 500;
const cache = new Map<string, { at: number; data: ContextData }>();

export class OverpassError extends Error {}

export async function fetchContext(
  pos: LatLon,
  opts: { endpoints?: string[]; timeoutMs?: number; fetchImpl?: typeof fetch; radiusM?: number } = {},
): Promise<ContextData> {
  // Toujours arrondir côté serveur aussi (ne jamais faire confiance au client).
  const center = roundPosition(pos, 100);
  const radiusM = opts.radiusM ?? DEFAULT_QUERY.radiusM;
  const key = `${center.lat},${center.lon},${radiusM}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const endpoints = opts.endpoints ?? overpassEndpoints();
  const timeoutMs = opts.timeoutMs ?? overpassTimeoutMs();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const query = buildOverpassQuery(center, { ...DEFAULT_QUERY, radiusM, timeoutS: Math.ceil(timeoutMs / 1000) });
  const errors: string[] = [];
  for (const url of endpoints) {
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Quete-MVP/0.1 (application familiale, contact via le dépôt)",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        errors.push(`${new URL(url).host} : HTTP ${res.status}`);
        continue;
      }
      const json = (await res.json()) as OverpassResponse;
      const data = parseOverpass(json, { center, radiusM, simplifyM: 3 });
      if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
      cache.set(key, { at: Date.now(), data });
      return data;
    } catch (e) {
      errors.push(`${new URL(url).host} : ${(e as Error).name === "TimeoutError" ? "délai dépassé" : (e as Error).message}`);
    }
  }
  throw new OverpassError(`Overpass indisponible (${errors.join(" ; ")})`);
}

export function clearContextCache(): void {
  cache.clear();
}
