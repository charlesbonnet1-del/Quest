/**
 * Identifiant d'un fichier audio : hash de (texte + voix + modèle + format).
 * Le format de sortie est inclus car il change le fichier produit.
 * Le texte est normalisé (espaces) pour qu'un simple retour à la ligne ne force pas
 * une régénération payante. Module Node uniquement (scripts, serveur, tests).
 */
import { createHash } from "node:crypto";

export interface AudioHashInput {
  texte: string;
  voiceId: string;
  modelId: string;
  outputFormat: string;
}

export function normalizeText(texte: string): string {
  return texte.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function audioHash({ texte, voiceId, modelId, outputFormat }: AudioHashInput): string {
  return createHash("sha256")
    .update([normalizeText(texte), voiceId, modelId, outputFormat].join("\u0000"))
    .digest("hex")
    .slice(0, 24);
}
