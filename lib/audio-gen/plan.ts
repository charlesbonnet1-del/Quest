/**
 * Plan de génération : liste de tous les segments du contenu, leur hash, et ce qui manque.
 * Pure (hors hash Node) : testée unitairement.
 */
import { audioHash } from "../content/audio-hash";
import type { AudioManifest } from "../content/manifest";
import {
  allPoiSegments,
  allQuestSegments,
  POI_SCOPE,
  segmentKey,
  type PoiLines,
  type Quest,
  type Segment,
} from "../content/schema";
import type { AudioGenConfig } from "./config";

export interface PlanItem {
  key: string;
  segment: Segment;
  voiceId: string;
  hash: string;
}

export interface Plan {
  items: PlanItem[];
  /** Fichiers à synthétiser (dédupliqués par hash). */
  missing: PlanItem[];
  totalChars: number;
  estimatedCost: number;
  problems: string[];
}

export function buildPlan(
  quests: Quest[],
  poi: PoiLines | undefined,
  config: Pick<AudioGenConfig, "modelId" | "voices" | "outputFormat" | "costPer1kChars">,
  manifest: AudioManifest,
  opts: { force?: boolean; only?: string } = {},
): Plan {
  const items: PlanItem[] = [];
  const problems: string[] = [];
  const voiceFor = (role: Segment["voix"], heroVoice?: string): string | undefined =>
    role === "heros" ? heroVoice || config.voices.heros : config.voices.narrateur;

  const add = (scope: string, segs: Segment[], heroVoice?: string) => {
    for (const s of segs) {
      let voiceId = voiceFor(s.voix, heroVoice);
      if (!voiceId) {
        // On continue pour que le dry-run donne quand même un devis complet.
        problems.push(`voix « ${s.voix} » non configurée (ELEVENLABS_VOICE_${s.voix.toUpperCase()})`);
        voiceId = `non-configuree:${s.voix}`;
      }
      items.push({
        key: segmentKey(scope, s.id),
        segment: s,
        voiceId,
        hash: audioHash({ texte: s.texte, voiceId, modelId: config.modelId, outputFormat: config.outputFormat }),
      });
    }
  };

  for (const q of quests) {
    if (opts.only && opts.only !== q.id) continue;
    add(q.id, allQuestSegments(q), q.heros.voixElevenLabs);
  }
  if (poi && (!opts.only || opts.only === POI_SCOPE)) add(POI_SCOPE, allPoiSegments(poi));

  const seen = new Set<string>();
  const missing: PlanItem[] = [];
  for (const it of items) {
    if (seen.has(it.hash)) continue;
    seen.add(it.hash);
    if (opts.force || !manifest.files[it.hash]) missing.push(it);
  }
  const totalChars = missing.reduce((n, it) => n + it.segment.texte.length, 0);
  return {
    items,
    missing,
    totalChars,
    estimatedCost: Math.round((totalChars / 1000) * config.costPer1kChars * 100) / 100,
    problems: [...new Set(problems)],
  };
}

/** Recalcule `segments` (clé -> hash) pour les segments actuels dont l'audio existe. */
export function currentSegmentIndex(items: PlanItem[], manifest: AudioManifest): Record<string, string> {
  const out: Record<string, string> = {};
  for (const it of items) if (manifest.files[it.hash]) out[it.key] = it.hash;
  return out;
}
