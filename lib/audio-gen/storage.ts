/**
 * Stockage des fichiers audio : Vercel Blob (recommandé) ou dossier public/audio (repli local).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface AudioStorage {
  name: string;
  put(fileName: string, bytes: Uint8Array, contentType: string): Promise<string>;
}

export function localDirStorage(dir = path.join(process.cwd(), "public", "audio")): AudioStorage {
  return {
    name: `dossier local ${path.relative(process.cwd(), dir)}`,
    async put(fileName, bytes) {
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, fileName), bytes);
      return `/audio/${fileName}`;
    },
  };
}

export async function blobStorage(token: string): Promise<AudioStorage> {
  const { put } = await import("@vercel/blob");
  return {
    name: "Vercel Blob",
    async put(fileName, bytes, contentType) {
      const res = await put(`audio/${fileName}`, Buffer.from(bytes), {
        access: "public",
        token,
        contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
        // Le nom contient le hash : le fichier ne change jamais, cache long.
        cacheControlMaxAge: 60 * 60 * 24 * 365,
      });
      return res.url;
    },
  };
}
