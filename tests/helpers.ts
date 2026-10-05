import { readFileSync } from "node:fs";
import path from "node:path";
import { PoiLinesSchema, QuestSchema, type Quest, type QuestInput } from "@/lib/content/schema";

export const sampleQuest = (): Quest =>
  QuestSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "content/quests/braise-la-flamme-perdue.json"), "utf8")));

export const samplePoi = () => PoiLinesSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "content/poi.json"), "utf8")));

const seg = (id: string, texte = `Texte ${id}.`) => ({ id, voix: "heros" as const, texte });

/** Petite quête synthétique, durées d'audio prévisibles (texte court). */
export function miniQuest(overrides: Partial<QuestInput> = {}): Quest {
  return QuestSchema.parse({
    id: "mini",
    titre: "Mini",
    heros: { id: "h", nom: "Héros" },
    dureeEstimeeMin: 10,
    age: { min: 6, max: 10 },
    introSecurite: { ...seg("secu"), voix: "narrateur" },
    introduction: seg("intro"),
    events: [
      { id: "a", type: "histoire", declencheur: { distanceM: 100, ecartMinS: 30 }, variantes: { default: [seg("a-def")], parc: [seg("a-parc")] } },
      {
        id: "b",
        type: "defi",
        declencheur: { distanceM: 200, ecartMinS: 60 },
        defi: { type: "observation", parentConfirme: true, attenteS: 10, bravo: seg("b-bravo") },
        variantes: { default: [seg("b-def"), seg("b-def-2")], ville: [seg("b-ville")] },
      },
      { id: "c", type: "histoire", declencheur: { distanceM: 300, ecartMinS: 0 }, variantes: { default: [seg("c-def")] } },
    ],
    conclusionEcartS: 5,
    conclusion: seg("fin"),
    ...overrides,
  });
}
