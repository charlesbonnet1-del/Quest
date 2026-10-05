/** Charge .env.local puis .env (sans écraser les variables déjà définies). */
import { existsSync } from "node:fs";

export function loadEnvFiles(): void {
  for (const f of [".env.local", ".env"]) {
    if (existsSync(f)) process.loadEnvFile(f);
  }
}
