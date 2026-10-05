/**
 * Pack hors ligne : tout ce qu'il faut pour jouer sans réseau.
 * - IndexedDB : contenu de la quête, contexte OSM, état du moteur (reprise).
 * - Cache Storage : fichiers audio.
 */
import { del, get, set } from "idb-keyval";
import type { EngineState } from "../engine/types";
import type { ContextData } from "../environment/types";
import { haversine, type LatLon } from "../geo/geo";
import type { QuestBundle } from "./bundle";

export const AUDIO_CACHE = "quete-audio-v1";

export interface StoredPack {
  bundle: QuestBundle;
  savedAt: string;
}

export async function fetchBundle(questId: string): Promise<QuestBundle> {
  const res = await fetch(`/api/quests/${encodeURIComponent(questId)}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Quête introuvable (${res.status})`);
  return (await res.json()) as QuestBundle;
}

/** Récupère la quête : réseau d'abord (version à jour), sinon le pack déjà enregistré. */
export async function loadBundle(questId: string): Promise<{ bundle: QuestBundle; fromCache: boolean }> {
  try {
    const bundle = await fetchBundle(questId);
    await set(`pack:${questId}`, { bundle, savedAt: new Date().toISOString() } satisfies StoredPack);
    return { bundle, fromCache: false };
  } catch (e) {
    const stored = await get<StoredPack>(`pack:${questId}`).catch(() => undefined);
    if (stored) return { bundle: stored.bundle, fromCache: true };
    throw e;
  }
}

// ── Contexte (données OSM) ─────────────────────────────────────
export async function saveContext(ctx: ContextData): Promise<void> {
  await set("contexte:dernier", ctx);
}

/** Dernier contexte enregistré, s'il couvre encore la position (rayon - 1 km). */
export async function loadCachedContext(p: LatLon): Promise<ContextData | null> {
  const ctx = await get<ContextData>("contexte:dernier").catch(() => undefined);
  if (!ctx) return null;
  return haversine(p, ctx.center) <= Math.max(0, ctx.radiusM - 1000) ? ctx : null;
}

// ── État du moteur (reprise après fermeture) ───────────────────
export const saveEngineState = (s: EngineState) => set(`etat:${s.questId}`, s);
export const loadEngineState = (questId: string) => get<EngineState>(`etat:${questId}`).catch(() => undefined);
export const clearEngineState = (questId: string) => del(`etat:${questId}`);

// ── Audio ──────────────────────────────────────────────────────
export async function getCachedAudioBlob(url: string): Promise<Blob | null> {
  if (typeof caches === "undefined") return null;
  const cache = await caches.open(AUDIO_CACHE);
  const res = await cache.match(url);
  return res ? res.blob() : null;
}

export interface DownloadProgress {
  done: number;
  total: number;
  failed: number;
}

/** Télécharge les fichiers manquants dans Cache Storage, dans l'ordre donné (3 à la fois). */
export async function downloadAudio(
  urls: string[],
  onProgress: (p: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<DownloadProgress> {
  const p: DownloadProgress = { done: 0, total: urls.length, failed: 0 };
  if (typeof caches === "undefined") {
    p.failed = urls.length;
    onProgress(p);
    return p;
  }
  const cache = await caches.open(AUDIO_CACHE);
  const queue = [...urls];
  const worker = async () => {
    while (queue.length && !signal?.aborted) {
      const url = queue.shift() as string;
      try {
        if (!(await cache.match(url))) {
          const res = await fetch(url, { signal });
          if (!res.ok) throw new Error(String(res.status));
          await cache.put(url, res);
        }
        p.done++;
      } catch {
        p.failed++;
      }
      onProgress({ ...p });
    }
  };
  onProgress({ ...p });
  await Promise.all([worker(), worker(), worker()]);
  return p;
}

/** Demande au navigateur de ne pas effacer le stockage (pack hors ligne) sous pression. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
