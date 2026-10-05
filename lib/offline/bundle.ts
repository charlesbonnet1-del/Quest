/** Ce que le serveur renvoie pour une quête (contenu + audio résolu), et l'ordre de téléchargement. */
import {
  allPoiSegments,
  ENVIRONMENTS,
  POI_SCOPE,
  segmentKey,
  type Environment,
  type PoiLines,
  type Quest,
} from "../content/schema";

export interface QuestBundle {
  quest: Quest;
  poiLines: PoiLines;
  /** clé de segment -> fichier audio. Les segments sans audio n'y figurent pas. */
  audio: Record<string, { url: string; durationS: number }>;
  /** Nombre de segments sans audio généré (la voix de secours du téléphone sera utilisée). */
  missingAudio: number;
  /** Version du contenu (change à chaque modification de la quête ou de l'audio). */
  version: string;
}

/**
 * Ordre de téléchargement : d'abord ce qui sera joué dans l'environnement détecté
 * (intro, variantes de l'environnement + default, conclusion), puis les lieux d'intérêt,
 * puis les autres environnements (au cas où le décor change en route).
 */
export function audioPriority(quest: Quest, poi: PoiLines | null, env: Environment): string[] {
  const k = (id: string) => segmentKey(quest.id, id);
  const first: string[] = [k(quest.introSecurite.id), k(quest.introduction.id)];
  const later: string[] = [];
  for (const e of quest.events) {
    const preferred = env !== "default" ? e.variantes[env] : undefined;
    for (const s of preferred ?? e.variantes.default) first.push(k(s.id));
    if (e.type === "defi" && e.defi.bravo) first.push(k(e.defi.bravo.id));
    if (preferred) for (const s of e.variantes.default) later.push(k(s.id));
    for (const other of ENVIRONMENTS) {
      if (other === env) continue;
      for (const s of e.variantes[other] ?? []) later.push(k(s.id));
    }
  }
  first.push(k(quest.conclusion.id));
  const poiKeys = poi ? allPoiSegments(poi).map((s) => segmentKey(POI_SCOPE, s.id)) : [];
  return [...new Set([...first, ...poiKeys, ...later])];
}
