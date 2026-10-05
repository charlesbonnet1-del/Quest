/**
 * Lecture du contenu sur disque (Node uniquement : scripts et routes serveur au build).
 * Ajouter une quête = déposer un fichier JSON dans content/quests/.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { AudioManifestSchema, emptyManifest, type AudioManifest } from "./manifest";
import { PoiLinesSchema, QuestSchema, type PoiLines, type Quest } from "./schema";

export const CONTENT_DIR = path.join(process.cwd(), "content");
export const QUESTS_DIR = path.join(CONTENT_DIR, "quests");
export const POI_FILE = path.join(CONTENT_DIR, "poi.json");
export const MANIFEST_FILE = path.join(CONTENT_DIR, "audio-manifest.json");

export interface LoadedFile<T> {
  file: string;
  data?: T;
  error?: string;
}

function formatZod(err: z.ZodError): string {
  return err.issues.map((i) => `  - ${i.path.join(".") || "(racine)"} : ${i.message}`).join("\n");
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function questFiles(dir = QUESTS_DIR): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => path.join(dir, f));
}

export function loadQuestFile(file: string): LoadedFile<Quest> {
  try {
    const r = QuestSchema.safeParse(readJson(file));
    if (!r.success) return { file, error: formatZod(r.error) };
    return { file, data: r.data };
  } catch (e) {
    return { file, error: `JSON illisible : ${(e as Error).message}` };
  }
}

/** Charge toutes les quêtes valides ; lève une erreur si l'une est invalide. */
export function loadAllQuests(dir = QUESTS_DIR): Quest[] {
  const out: Quest[] = [];
  for (const f of questFiles(dir)) {
    const r = loadQuestFile(f);
    if (!r.data) throw new Error(`Quête invalide ${path.basename(f)} :\n${r.error}`);
    out.push(r.data);
  }
  const ids = new Set<string>();
  for (const q of out) {
    if (ids.has(q.id)) throw new Error(`Identifiant de quête en double : ${q.id}`);
    ids.add(q.id);
  }
  return out;
}

export function loadPoiFile(file = POI_FILE): LoadedFile<PoiLines> {
  try {
    const r = PoiLinesSchema.safeParse(readJson(file));
    if (!r.success) return { file, error: formatZod(r.error) };
    return { file, data: r.data };
  } catch (e) {
    return { file, error: `JSON illisible : ${(e as Error).message}` };
  }
}

export function loadPoiLines(file = POI_FILE): PoiLines {
  const r = loadPoiFile(file);
  if (!r.data) throw new Error(`poi.json invalide :\n${r.error}`);
  return r.data;
}

export function loadManifest(file = MANIFEST_FILE): AudioManifest {
  if (!existsSync(file)) return emptyManifest();
  return AudioManifestSchema.parse(readJson(file));
}
