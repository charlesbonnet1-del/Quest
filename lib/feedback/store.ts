/**
 * Stockage des retours : un petit fichier JSON par retour.
 * - Production : Vercel Blob (accès privé par défaut, FEEDBACK_BLOB_ACCESS=public possible
 *   pour un magasin public : le nom contient alors un suffixe aléatoire non devinable).
 * - Développement (pas de jeton Blob) : fichier local .data/feedback.jsonl.
 */
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { StoredFeedback } from "./schema";

const LOCAL_FILE = path.join(process.cwd(), ".data", "feedback.jsonl");
const PREFIX = "feedback/";

function blobConfig() {
  const token = process.env.FEEDBACK_BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
  const access = process.env.FEEDBACK_BLOB_ACCESS === "public" ? ("public" as const) : ("private" as const);
  return token ? { token, access } : null;
}

export function feedbackStorageName(): string {
  const b = blobConfig();
  return b ? `Vercel Blob (${b.access})` : "fichier local .data/feedback.jsonl";
}

export async function saveFeedback(f: StoredFeedback): Promise<void> {
  const b = blobConfig();
  if (!b) {
    if (process.env.VERCEL) throw new Error("Stockage des retours non configuré (BLOB_READ_WRITE_TOKEN)");
    await mkdir(path.dirname(LOCAL_FILE), { recursive: true });
    await appendFile(LOCAL_FILE, `${JSON.stringify(f)}\n`);
    return;
  }
  const { put } = await import("@vercel/blob");
  const day = f.recuLe.slice(0, 10);
  await put(`${PREFIX}${day}/retour.json`, JSON.stringify(f), {
    access: b.access,
    token: b.token,
    contentType: "application/json",
    addRandomSuffix: true,
  });
}

export async function listFeedback(limit = 500): Promise<StoredFeedback[]> {
  const b = blobConfig();
  if (!b) {
    const txt = await readFile(LOCAL_FILE, "utf8").catch(() => "");
    return txt
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as StoredFeedback)
      .reverse()
      .slice(0, limit);
  }
  const { list, get } = await import("@vercel/blob");
  const out: StoredFeedback[] = [];
  let cursor: string | undefined;
  const blobs: Array<{ url: string; pathname: string; uploadedAt: Date }> = [];
  do {
    const page = await list({ prefix: PREFIX, token: b.token, limit: 1000, ...(cursor ? { cursor } : {}) });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor && blobs.length < 5000);
  blobs.sort((x, y) => +new Date(y.uploadedAt) - +new Date(x.uploadedAt));
  for (const blob of blobs.slice(0, limit)) {
    try {
      const r = await get(blob.url, { access: b.access, token: b.token });
      if (!r || !r.stream) continue;
      const txt = await new Response(r.stream).text();
      out.push(JSON.parse(txt) as StoredFeedback);
    } catch {
      /* fichier illisible : ignoré */
    }
  }
  return out;
}
