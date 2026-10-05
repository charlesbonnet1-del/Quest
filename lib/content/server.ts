/** Assemblage côté serveur (au build) du paquet d'une quête : contenu + audio résolu. */
import { createHash } from "node:crypto";
import { allPoiSegments, allQuestSegments, POI_SCOPE, segmentKey } from "./schema";
import { loadAllQuests, loadManifest, loadPoiLines } from "./load";
import type { QuestBundle } from "../offline/bundle";

export function questSummaries() {
  return loadAllQuests().map((q) => ({
    id: q.id,
    titre: q.titre,
    resume: q.resume ?? "",
    heros: q.heros.nom,
    dureeEstimeeMin: q.dureeEstimeeMin,
    distanceEstimeeM: q.distanceEstimeeM ?? null,
    age: q.age,
    provisoire: q.provisoire,
  }));
}
export type QuestSummary = ReturnType<typeof questSummaries>[number];

export function buildBundle(questId: string): QuestBundle | null {
  const quest = loadAllQuests().find((q) => q.id === questId);
  if (!quest) return null;
  const poiLines = loadPoiLines();
  const manifest = loadManifest();
  const audio: QuestBundle["audio"] = {};
  let missingAudio = 0;
  const keys = [
    ...allQuestSegments(quest).map((s) => segmentKey(quest.id, s.id)),
    ...allPoiSegments(poiLines).map((s) => segmentKey(POI_SCOPE, s.id)),
  ];
  for (const key of keys) {
    const hash = manifest.segments[key];
    const file = hash ? manifest.files[hash] : undefined;
    if (file) audio[key] = { url: file.url, durationS: file.durationS };
    else missingAudio++;
  }
  const version = createHash("sha256").update(JSON.stringify({ quest, poiLines, audio })).digest("hex").slice(0, 16);
  return { quest, poiLines, audio, missingAudio, version };
}
