/**
 * Schéma de contenu partagé (client, serveur, scripts).
 * Une quête est un fichier JSON dans /content/quests, validé par `QuestSchema`.
 * Les lignes de lieux d'intérêt sont dans /content/poi.json, validées par `PoiLinesSchema`.
 */
import { z } from "zod";

/** Environnements reconnus. `default` est la variante de repli obligatoire. */
export const ENVIRONMENTS = ["ville", "parc", "foret", "bord_eau", "campagne"] as const;
export type DetectedEnvironment = (typeof ENVIRONMENTS)[number];
export type Environment = DetectedEnvironment | "default";

export const ENVIRONMENT_LABELS: Record<Environment, string> = {
  default: "Partout",
  ville: "En ville",
  parc: "Dans un parc",
  foret: "En forêt",
  bord_eau: "Au bord de l'eau",
  campagne: "À la campagne",
};

export const VoiceRoleSchema = z.enum(["narrateur", "heros"]);
export type VoiceRole = z.infer<typeof VoiceRoleSchema>;

const idSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "identifiant : minuscules, chiffres, - et _ uniquement");

export const SegmentSchema = z
  .object({
    id: idSchema,
    voix: VoiceRoleSchema,
    texte: z.string().trim().min(1),
  })
  .strict();
export type Segment = z.infer<typeof SegmentSchema>;

/** Une variante = un ou plusieurs segments joués à la suite. */
const VariantSchema = z.array(SegmentSchema).min(1);

export const VariantsSchema = z
  .object({
    default: VariantSchema,
    ville: VariantSchema.optional(),
    parc: VariantSchema.optional(),
    foret: VariantSchema.optional(),
    bord_eau: VariantSchema.optional(),
    campagne: VariantSchema.optional(),
  })
  .strict();
export type Variants = z.infer<typeof VariantsSchema>;

export const ChallengeTypeSchema = z.enum(["observation", "physique", "ecoute", "mouvement"]);
export type ChallengeType = z.infer<typeof ChallengeTypeSchema>;

export const ChallengeSchema = z
  .object({
    type: ChallengeTypeSchema,
    /** Affiche le bouton « C'est fait » pour le parent (défis d'observation). */
    parentConfirme: z.boolean().default(false),
    /** Silence d'attente après l'audio du défi, en secondes. */
    attenteS: z.number().int().min(0).max(600).default(20),
    /** Petit mot du héros une fois le défi terminé (optionnel). */
    bravo: SegmentSchema.optional(),
  })
  .strict();
export type Challenge = z.infer<typeof ChallengeSchema>;

export const TriggerSchema = z
  .object({
    /** Distance cumulée depuis le départ, en mètres. */
    distanceM: z.number().min(0),
    /** Écart minimal depuis la fin de l'événement précédent, en secondes. */
    ecartMinS: z.number().min(0).default(0),
  })
  .strict();

const BaseEventSchema = z.object({
  id: idSchema,
  titre: z.string().optional(),
  declencheur: TriggerSchema,
  variantes: VariantsSchema,
});

export const QuestEventSchema = z.discriminatedUnion("type", [
  BaseEventSchema.extend({ type: z.literal("histoire") }).strict(),
  BaseEventSchema.extend({ type: z.literal("defi"), defi: ChallengeSchema }).strict(),
]);
export type QuestEvent = z.infer<typeof QuestEventSchema>;

export const QuestSchema = z
  .object({
    id: idSchema,
    titre: z.string().min(1),
    resume: z.string().optional(),
    /** Contenu provisoire, à réécrire. Affiché comme tel dans l'app. */
    provisoire: z.boolean().default(false),
    heros: z
      .object({
        id: idSchema,
        nom: z.string().min(1),
        /** Voix ElevenLabs propre à ce héros (sinon ELEVENLABS_VOICE_HEROS). */
        voixElevenLabs: z.string().optional(),
      })
      .strict(),
    dureeEstimeeMin: z.number().int().positive(),
    distanceEstimeeM: z.number().positive().optional(),
    age: z.object({ min: z.number().int(), max: z.number().int() }).strict(),
    introSecurite: SegmentSchema,
    introduction: SegmentSchema,
    events: z.array(QuestEventSchema).min(1),
    /** Délai avant la conclusion après le dernier événement, en secondes. */
    conclusionEcartS: z.number().min(0).default(30),
    conclusion: SegmentSchema,
  })
  .strict()
  .superRefine((q, ctx) => {
    const seen = new Set<string>();
    for (const s of allQuestSegments(q)) {
      if (seen.has(s.id)) {
        ctx.addIssue({ code: "custom", message: `identifiant de segment en double : ${s.id}` });
      }
      seen.add(s.id);
    }
    const eventIds = new Set<string>();
    let prev = -1;
    for (const e of q.events) {
      if (eventIds.has(e.id)) ctx.addIssue({ code: "custom", message: `événement en double : ${e.id}` });
      eventIds.add(e.id);
      if (e.declencheur.distanceM < prev) {
        ctx.addIssue({
          code: "custom",
          message: `événement ${e.id} : les distances de déclenchement doivent être croissantes`,
        });
      }
      prev = e.declencheur.distanceM;
    }
  });
export type Quest = z.infer<typeof QuestSchema>;
export type QuestInput = z.input<typeof QuestSchema>;

export const POI_TYPES = [
  "statue",
  "plan_eau",
  "foret",
  "fontaine",
  "monument",
  "point_de_vue",
  "arbre_remarquable",
  "aire_de_jeux",
] as const;
export const PoiTypeSchema = z.enum(POI_TYPES);
export type PoiType = z.infer<typeof PoiTypeSchema>;

export const PoiLinesSchema = z
  .object({
    provisoire: z.boolean().default(false),
    lignes: z
      .object(
        Object.fromEntries(POI_TYPES.map((t) => [t, z.array(SegmentSchema).min(2)])) as Record<
          PoiType,
          z.ZodArray<typeof SegmentSchema>
        >,
      )
      .strict(),
  })
  .strict();
export type PoiLines = z.infer<typeof PoiLinesSchema>;

/** Tous les segments d'une quête, dans l'ordre de lecture probable. */
export function allQuestSegments(q: Pick<Quest, "introSecurite" | "introduction" | "events" | "conclusion">): Segment[] {
  const out: Segment[] = [q.introSecurite, q.introduction];
  for (const e of q.events) {
    for (const env of ["default", ...ENVIRONMENTS] as const) {
      const v = e.variantes[env];
      if (v) out.push(...v);
    }
    if (e.type === "defi" && e.defi.bravo) out.push(e.defi.bravo);
  }
  out.push(q.conclusion);
  return out;
}

export function allPoiSegments(p: PoiLines): Segment[] {
  return POI_TYPES.flatMap((t) => p.lignes[t]);
}

/** Clé unique d'un segment dans tout le contenu : `<questId>/<segmentId>` ou `poi/<segmentId>`. */
export function segmentKey(scope: string, segmentId: string): string {
  return `${scope}/${segmentId}`;
}
export const POI_SCOPE = "poi";
