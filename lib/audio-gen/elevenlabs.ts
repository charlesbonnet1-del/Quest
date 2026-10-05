/**
 * Client minimal de l'API Text-to-Speech d'ElevenLabs (utilisé par le script uniquement).
 * POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=...
 * Doc : https://elevenlabs.io/docs/api-reference/text-to-speech/convert
 */
export class TtsError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly fatal: boolean,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

export interface TtsRequest {
  apiKey: string;
  voiceId: string;
  modelId: string;
  text: string;
  outputFormat: string;
  languageCode?: string;
  voiceSettings?: Record<string, unknown>;
}

export const ELEVENLABS_BASE = process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io";

export async function synthesize(req: TtsRequest, fetchImpl: typeof fetch = fetch): Promise<Uint8Array> {
  const url = `${ELEVENLABS_BASE}/v1/text-to-speech/${encodeURIComponent(req.voiceId)}?output_format=${encodeURIComponent(req.outputFormat)}`;
  const body: Record<string, unknown> = { text: req.text, model_id: req.modelId };
  if (req.languageCode) body.language_code = req.languageCode;
  if (req.voiceSettings) body.voice_settings = req.voiceSettings;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "xi-api-key": req.apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    throw new TtsError(`réseau : ${(e as Error).message}`, 0, true, false);
  }
  if (res.ok) return new Uint8Array(await res.arrayBuffer());

  const text = await res.text().catch(() => "");
  const retryAfter = Number(res.headers.get("retry-after"));
  const retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined;
  const detail = text.slice(0, 300);
  if (res.status === 429) {
    // Limite de débit / concurrence : on réessaie. Quota épuisé : inutile d'insister.
    const quota = /quota/i.test(text);
    throw new TtsError(`429 ${detail}`, 429, !quota, quota, retryAfterMs);
  }
  if (res.status >= 500) throw new TtsError(`${res.status} ${detail}`, res.status, true, false, retryAfterMs);
  if (res.status === 401 || res.status === 403) throw new TtsError(`${res.status} ${detail}`, res.status, false, true);
  throw new TtsError(`${res.status} ${detail}`, res.status, false, false);
}

export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (attempt: number, delayMs: number, err: TtsError) => void;
}

/** Nouvelle tentative avec attente exponentielle (+ gigue), en respectant Retry-After. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const err = e instanceof TtsError ? e : new TtsError(String(e), 0, true, false);
      if (!err.retryable || attempt >= opts.attempts) throw err;
      const backoff = opts.baseDelayMs * 2 ** (attempt - 1);
      const delay = Math.max(err.retryAfterMs ?? 0, backoff + Math.floor(Math.random() * 250));
      opts.onRetry?.(attempt, delay, err);
      await sleep(delay);
    }
  }
}
