/**
 * Manifeste audio : produit par `pnpm audio:generate`, lu par l'app.
 * - `files` accumule tous les fichiers déjà générés (par hash) : on ne régénère jamais.
 * - `segments` relie chaque segment ACTUEL du contenu à son hash.
 */
import { z } from "zod";

export const AudioFileSchema = z.object({
  hash: z.string(),
  url: z.string(),
  durationS: z.number(),
  chars: z.number().int(),
  voiceId: z.string(),
  modelId: z.string(),
  outputFormat: z.string(),
  bytes: z.number().int(),
  createdAt: z.string(),
});
export type AudioFile = z.infer<typeof AudioFileSchema>;

export const AudioManifestSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string(),
  files: z.record(z.string(), AudioFileSchema),
  /** clé de segment (`questId/segmentId`) -> hash */
  segments: z.record(z.string(), z.string()),
});
export type AudioManifest = z.infer<typeof AudioManifestSchema>;

export function emptyManifest(): AudioManifest {
  return { version: 1, updatedAt: new Date(0).toISOString(), files: {}, segments: {} };
}

/** Entrée résolue envoyée au client pour une quête. */
export interface ResolvedAudio {
  key: string;
  url: string;
  durationS: number;
}
