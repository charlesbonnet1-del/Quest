import type { ChallengeType, Environment, PoiType, Segment } from "../content/schema";

export type QuestStatus = "pret" | "en_cours" | "en_pause" | "termine";

export type PlayKind = "intro_securite" | "introduction" | "evenement" | "bravo" | "lieu" | "conclusion";

/** Un segment à jouer, tel que transmis au lecteur audio. */
export interface PlayItem {
  /** Numéro unique : permet d'ignorer les fins de lecture périmées. */
  seq: number;
  kind: PlayKind;
  /** Clé du segment dans le manifeste audio (`questId/segmentId` ou `poi/segmentId`). */
  key: string;
  segment: Segment;
  eventId?: string;
  env?: Environment;
  /** Dernier segment du groupe : déclenche la suite (défi, fin d'événement...). */
  last: boolean;
  /** Jouer le petit signal sonore à la fin. */
  signal: boolean;
  /** Relecture demandée par le parent (« Répéter ») : n'a pas d'effet sur le déroulé. */
  repeat?: boolean;
}

export interface ChallengeState {
  eventId: string;
  type: ChallengeType;
  needsConfirm: boolean;
  /** "attente" : silence pendant que l'enfant cherche ; "confirmation" : bouton parent affiché. */
  phase: "attente" | "confirmation";
  waitUntilMs: number;
}

export interface HistoryEntry {
  atMs: number;
  distanceM: number;
  type: "depart" | "evenement" | "defi_fini" | "lieu" | "environnement" | "pause" | "reprise" | "fatigue" | "fin" | "audio_manquant";
  detail: string;
}

/** État complet et sérialisable du moteur (sauvegardé pour reprendre après un rechargement). */
export interface EngineState {
  questId: string;
  status: QuestStatus;
  distanceM: number;
  /** Temps de jeu actif cumulé (hors pauses), en ms. */
  activeMs: number;
  /** Horodatage (horloge) du dernier passage en cours ; null si pas en cours. */
  runningSince: number | null;
  nextEventIndex: number;
  introDone: boolean;
  /** Temps actif à la fin du dernier événement (ou de l'introduction). */
  lastEventEndMs: number | null;
  conclusionQueued: boolean;
  env: Environment;
  envRaison: string;
  envOverride: Environment | null;
  lastEnvEvalDistanceM: number | null;
  playing: PlayItem | null;
  queue: PlayItem[];
  challenge: ChallengeState | null;
  lastPlayed: PlayItem | null;
  seq: number;
  usedPois: string[];
  poiTypeCount: Partial<Record<PoiType, number>>;
  lastPoiMs: number | null;
  pausedReason: string | null;
  endReason: "conclusion" | "fatigue" | "termine" | null;
  history: HistoryEntry[];
  lastPosition: { lat: number; lon: number; accuracy: number } | null;
}
