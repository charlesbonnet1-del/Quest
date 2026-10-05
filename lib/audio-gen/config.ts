/**
 * Configuration de la génération audio, lue depuis les variables d'environnement.
 * Aucune de ces variables n'est exposée au client (pas de préfixe NEXT_PUBLIC_).
 */
export interface AudioGenConfig {
  apiKey: string | undefined;
  modelId: string;
  voices: { narrateur: string | undefined; heros: string | undefined };
  outputFormat: string;
  languageCode: string | undefined;
  /** Coût estimé pour 1000 caractères, dans la devise de `currency`. */
  costPer1kChars: number;
  currency: string;
  concurrency: number;
  voiceSettings: Record<string, unknown> | undefined;
  storage: "blob" | "local";
  blobToken: string | undefined;
}

export const DEFAULT_MODEL_FAST = "eleven_flash_v2_5";
export const DEFAULT_MODEL_QUALITY = "eleven_multilingual_v2";

/** Tarifs indicatifs (USD / 1000 caractères) si ELEVENLABS_COST_PER_1K_CHARS n'est pas défini. */
export function defaultCostPer1k(modelId: string): number {
  return /flash|turbo/.test(modelId) ? 0.15 : 0.3;
}

export function readConfig(env: NodeJS.ProcessEnv, quality: boolean): AudioGenConfig {
  const modelId = quality
    ? env.ELEVENLABS_MODEL_QUALITY || DEFAULT_MODEL_QUALITY
    : env.ELEVENLABS_MODEL || DEFAULT_MODEL_FAST;
  let voiceSettings: Record<string, unknown> | undefined;
  if (env.ELEVENLABS_VOICE_SETTINGS) {
    voiceSettings = JSON.parse(env.ELEVENLABS_VOICE_SETTINGS) as Record<string, unknown>;
  }
  const cost = env.ELEVENLABS_COST_PER_1K_CHARS ? Number(env.ELEVENLABS_COST_PER_1K_CHARS) : NaN;
  const storageEnv = env.AUDIO_STORAGE;
  const storage: "blob" | "local" =
    storageEnv === "local" || storageEnv === "blob" ? storageEnv : env.BLOB_READ_WRITE_TOKEN ? "blob" : "local";
  return {
    apiKey: env.ELEVENLABS_API_KEY,
    modelId,
    voices: { narrateur: env.ELEVENLABS_VOICE_NARRATEUR, heros: env.ELEVENLABS_VOICE_HEROS },
    outputFormat: env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_64",
    languageCode: env.ELEVENLABS_LANGUAGE_CODE ?? "fr",
    costPer1kChars: Number.isFinite(cost) ? cost : defaultCostPer1k(modelId),
    currency: env.ELEVENLABS_COST_CURRENCY || "USD",
    concurrency: Math.max(1, Number(env.ELEVENLABS_CONCURRENCY || 2)),
    voiceSettings,
    storage,
    blobToken: env.BLOB_READ_WRITE_TOKEN,
  };
}

/** Débit en kbit/s déduit du format ElevenLabs (`mp3_44100_64` -> 64). */
export function bitrateKbps(outputFormat: string): number | undefined {
  const m = /^(mp3|opus)_\d+_(\d+)$/.exec(outputFormat);
  return m ? Number(m[2]) : undefined;
}

export function fileExtension(outputFormat: string): string {
  if (outputFormat.startsWith("mp3")) return "mp3";
  if (outputFormat.startsWith("opus")) return "ogg";
  if (outputFormat.startsWith("wav")) return "wav";
  return "bin";
}

export function contentType(outputFormat: string): string {
  return { mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", bin: "application/octet-stream" }[
    fileExtension(outputFormat)
  ] as string;
}

/** Durée estimée (débit constant). Pour un MP3 CBR, c'est exact à quelques ms près. */
export function estimateDurationS(bytes: number, outputFormat: string, chars: number): number {
  const kbps = bitrateKbps(outputFormat);
  if (kbps) return Math.round(((bytes * 8) / (kbps * 1000)) * 10) / 10;
  return Math.round((chars / 14) * 10) / 10;
}

/** La langue forcée n'est acceptée que par certains modèles (Flash/Turbo v2.5). */
export function supportsLanguageCode(modelId: string): boolean {
  return /(flash|turbo)_v2_5/.test(modelId);
}
