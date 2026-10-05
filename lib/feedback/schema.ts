import { z } from "zod";

/** Retour anonyme de fin de quête : ni position, ni identifiant, ni adresse IP. */
export const FeedbackSchema = z
  .object({
    questId: z.string().min(1).max(100),
    environnement: z.enum(["default", "ville", "parc", "foret", "bord_eau", "campagne"]),
    dureeS: z.number().int().min(0).max(24 * 3600),
    distanceM: z.number().int().min(0).max(100_000),
    note: z.number().int().min(1).max(5).nullable(),
    aBouge: z.boolean().nullable(),
    commentaire: z.string().trim().max(1000).optional(),
    fin: z.enum(["conclusion", "fatigue", "termine"]).optional(),
  })
  .strict();
export type Feedback = z.infer<typeof FeedbackSchema>;

export interface StoredFeedback extends Feedback {
  recuLe: string;
}
