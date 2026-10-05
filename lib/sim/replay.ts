/**
 * Rejeu accéléré d'une quête sur un trajet, sans navigateur (tests et `pnpm sim:replay`).
 * Horloge manuelle, lecteur audio factice qui « joue » chaque segment pendant sa durée
 * (manifeste si disponible, sinon estimation ~14 caractères/s), parent simulé qui
 * appuie sur « C'est fait » quelques secondes après l'apparition du bouton.
 */
import type { PoiLines, Quest } from "../content/schema";
import { ManualClock } from "../engine/clock";
import { QuestEngine, type AudioSink } from "../engine/engine";
import type { EngineState, HistoryEntry, PlayItem } from "../engine/types";
import type { ContextData } from "../environment/types";
import { RouteWalker } from "./walker";

export interface ReplayOptions {
  quest: Quest;
  poiLines?: PoiLines | null;
  context?: ContextData | null;
  points: ReadonlyArray<readonly [number, number]>;
  tours?: number;
  speedMps?: number;
  /** Durée réelle des audios, par clé de segment (s). */
  durations?: Record<string, number>;
  confirmAfterS?: number;
  maxMinutes?: number;
  /** Actions scriptées : à tel temps (s), faire telle chose. */
  script?: Array<{ atS: number; action: (e: QuestEngine) => void }>;
  onLog?: (e: HistoryEntry) => void;
  onPlay?: (item: PlayItem, atMs: number) => void;
}

export interface ReplayResult {
  state: EngineState;
  played: Array<{ atMs: number; distanceM: number; key: string; kind: string; env?: string }>;
  simulatedMs: number;
}

export function runReplay(o: ReplayOptions): ReplayResult {
  const clock = new ManualClock(0);
  const played: ReplayResult["played"] = [];
  let current: { item: PlayItem; endsAt: number } | null = null;
  let engineRef: QuestEngine | null = null;
  const sink: AudioSink = {
    play(item) {
      const d = o.durations?.[item.key] ?? item.segment.texte.length / 14;
      current = { item, endsAt: clock.now() + d * 1000 };
      played.push({
        atMs: engineRef?.elapsedMs() ?? 0,
        distanceM: Math.round(engineRef?.state.distanceM ?? 0),
        key: item.key,
        kind: item.kind,
        ...(item.env ? { env: item.env } : {}),
      });
      o.onPlay?.(item, engineRef?.elapsedMs() ?? 0);
    },
    stop() {
      current = null;
    },
    pause() {},
    resume() {},
  };
  const engine = new QuestEngine(o.quest, {
    clock,
    sink,
    context: o.context ?? null,
    poiLines: o.poiLines ?? null,
    ...(o.onLog ? { log: o.onLog } : {}),
  });
  engineRef = engine;
  const walker = new RouteWalker(o.points, o.tours ?? 1);
  const speed = o.speedMps ?? 1.3;
  const maxMs = (o.maxMinutes ?? 180) * 60_000;
  const script = [...(o.script ?? [])].sort((a, b) => a.atS - b.atS);
  let confirmationSince: number | null = null;
  let walked = 0;

  engine.onPosition({ ...walker.at(0), accuracy: 5, timestamp: clock.now() });
  engine.start();
  while (engine.state.status !== "termine" && clock.now() < maxMs) {
    clock.advance(1000);
    const t = clock.now();
    while (script.length && (script[0]?.atS ?? Infinity) * 1000 <= t) script.shift()?.action(engine);
    if (engine.state.status === "en_cours") {
      walked = Math.min(walker.length, walked + speed);
      engine.onPosition({ ...walker.at(walked), accuracy: 5, timestamp: t });
    }
    const cur = current as { item: PlayItem; endsAt: number } | null;
    if (cur && t >= cur.endsAt && engine.state.status === "en_cours") {
      current = null;
      engine.audioEnded(cur.item.seq);
    }
    const ch = engine.state.challenge;
    if (ch?.phase === "confirmation") {
      confirmationSince ??= t;
      if (t - confirmationSince >= (o.confirmAfterS ?? 5) * 1000) {
        confirmationSince = null;
        engine.confirmChallenge();
      }
    }
    engine.tick();
  }
  return { state: structuredClone(engine.state) as EngineState, played, simulatedMs: clock.now() };
}
