/**
 * Moteur de quête : machine à états (prêt → en cours ⇄ en pause → terminé),
 * déclencheurs à la distance, choix de variante, défis, rebonds sur les lieux d'intérêt.
 *
 * Indépendant du navigateur : il reçoit des positions, une horloge et un « lecteur »
 * (AudioSink). Il garantit qu'un seul audio est joué à la fois (file d'attente).
 */
import {
  POI_SCOPE,
  segmentKey,
  type Environment,
  type PoiLines,
  type Quest,
  type QuestEvent,
  type Segment,
} from "../content/schema";
import { classify, distanceToArea } from "../environment/classify";
import type { ContextData } from "../environment/types";
import { PositionFilter, type FilterOptions, type FilterResult, type PositionFix } from "../geo/filter";
import { haversine } from "../geo/geo";
import type { Clock } from "./clock";
import type { EngineState, HistoryEntry, PlayItem, PlayKind } from "./types";

export interface AudioSink {
  /** Joue l'élément ; doit appeler `engine.audioEnded(item.seq)` à la fin (ou en cas d'erreur). */
  play(item: PlayItem): void;
  stop(): void;
  pause(): void;
  resume(): void;
}

export interface EngineOptions {
  clock: Clock;
  sink: AudioSink;
  context?: ContextData | null;
  poiLines?: PoiLines | null;
  filter?: Partial<FilterOptions>;
  /** Réévaluer l'environnement tous les N mètres. */
  envEvalEveryM?: number;
  /** Rebonds : distance maximale à l'élément (m). */
  poiRadiusM?: number;
  /** Rebonds : délai minimal entre deux rebonds (s). */
  poiCooldownS?: number;
  /** Rebonds : pas de rebond si le prochain événement est à moins de N m. */
  poiEventMarginM?: number;
  /** Rebonds : pas de rebond moins de N s après un événement. */
  poiAfterEventS?: number;
  log?: (entry: HistoryEntry) => void;
}

export type EngineListener = (state: Readonly<EngineState>) => void;

export function initialState(quest: Quest): EngineState {
  return {
    questId: quest.id,
    status: "pret",
    distanceM: 0,
    activeMs: 0,
    runningSince: null,
    nextEventIndex: 0,
    introDone: false,
    lastEventEndMs: null,
    conclusionQueued: false,
    env: "default",
    envRaison: "pas encore évalué",
    envOverride: null,
    lastEnvEvalDistanceM: null,
    playing: null,
    queue: [],
    challenge: null,
    lastPlayed: null,
    seq: 0,
    usedPois: [],
    poiTypeCount: {},
    lastPoiMs: null,
    pausedReason: null,
    endReason: null,
    history: [],
    lastPosition: null,
  };
}

/** Variante à jouer pour un environnement donné (repli sur default). */
export function pickVariant(event: QuestEvent, env: Environment): { env: Environment; segments: Segment[] } {
  const v = env !== "default" ? event.variantes[env] : undefined;
  return v ? { env, segments: v } : { env: "default", segments: event.variantes.default };
}

export class QuestEngine {
  private s: EngineState;
  private readonly filter: PositionFilter;
  private readonly listeners = new Set<EngineListener>();
  private readonly o: Required<Omit<EngineOptions, "context" | "poiLines" | "filter" | "log">> &
    Pick<EngineOptions, "log">;
  private context: ContextData | null;
  private poiLines: PoiLines | null;

  constructor(
    readonly quest: Quest,
    opts: EngineOptions,
    restored?: EngineState,
  ) {
    this.o = {
      clock: opts.clock,
      sink: opts.sink,
      envEvalEveryM: opts.envEvalEveryM ?? 300,
      poiRadiusM: opts.poiRadiusM ?? 30,
      poiCooldownS: opts.poiCooldownS ?? 180,
      poiEventMarginM: opts.poiEventMarginM ?? 40,
      poiAfterEventS: opts.poiAfterEventS ?? 20,
      log: opts.log,
    };
    this.context = opts.context ?? null;
    this.poiLines = opts.poiLines ?? null;
    this.filter = new PositionFilter(opts.filter);
    this.s = restored ? structuredClone(restored) : initialState(quest);
    if (restored && this.s.status === "en_cours") {
      // Après un rechargement : on repart en pause, le parent relancera.
      this.s.activeMs = this.elapsedAt(this.s.runningSince ?? this.now());
      this.s.status = "en_pause";
      this.s.runningSince = null;
      this.s.pausedReason = "reprise après fermeture de l'app";
    }
    if (restored && this.s.playing) {
      // L'audio interrompu sera rejoué depuis le début.
      this.s.queue.unshift(this.s.playing);
      this.s.playing = null;
    }
  }

  // ── Lecture de l'état ────────────────────────────────────────
  get state(): Readonly<EngineState> {
    return this.s;
  }

  /** Temps de jeu actif (hors pauses), en ms. */
  elapsedMs(): number {
    return this.elapsedAt(this.now());
  }

  get effectiveEnv(): Environment {
    return this.s.envOverride ?? this.s.env;
  }

  subscribe(fn: EngineListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setContext(ctx: ContextData | null): void {
    this.context = ctx;
    this.s.lastEnvEvalDistanceM = null;
    if (this.s.lastPosition) this.evaluateEnvironment(this.s.lastPosition);
    this.emit();
  }

  setPoiLines(lines: PoiLines | null): void {
    this.poiLines = lines;
  }

  // ── Commandes ────────────────────────────────────────────────
  start(): void {
    if (this.s.status !== "pret") return;
    this.s.status = "en_cours";
    this.s.runningSince = this.now();
    this.record("depart", `environnement : ${this.effectiveEnv}`);
    this.enqueue("intro_securite", [this.quest.introSecurite], { signal: false });
    this.enqueue("introduction", [this.quest.introduction]);
    this.pump();
  }

  pause(reason = "pause demandée"): void {
    if (this.s.status !== "en_cours") return;
    this.s.activeMs = this.elapsedMs();
    this.s.runningSince = null;
    this.s.status = "en_pause";
    this.s.pausedReason = reason;
    this.o.sink.pause();
    this.record("pause", reason);
    this.emit();
  }

  resume(): void {
    if (this.s.status !== "en_pause") return;
    this.s.status = "en_cours";
    this.s.runningSince = this.now();
    this.s.pausedReason = null;
    // La distance parcourue pendant la pause ne compte pas : nouveau point d'ancrage.
    this.filter.reset();
    this.record("reprise", "");
    if (this.s.playing) this.o.sink.resume();
    this.pump();
  }

  /** « On est fatigués » : on saute directement à la conclusion. */
  tired(): void {
    if (this.s.status === "termine" || this.s.status === "pret") return;
    if (this.s.status === "en_pause") this.resume();
    this.record("fatigue", "le parent a demandé la conclusion");
    this.o.sink.stop();
    this.s.playing = null;
    this.s.queue = [];
    this.s.challenge = null;
    this.s.endReason = "fatigue";
    this.queueConclusion();
    this.pump();
  }

  /** Terminer immédiatement, sans conclusion. */
  finish(): void {
    if (this.s.status === "termine") return;
    this.o.sink.stop();
    this.s.activeMs = this.elapsedMs();
    this.s.runningSince = null;
    this.s.playing = null;
    this.s.queue = [];
    this.s.challenge = null;
    this.s.status = "termine";
    this.s.endReason = this.s.endReason ?? "termine";
    this.record("fin", "terminé par le parent");
    this.emit();
  }

  /** « Répéter » : rejoue l'audio en cours depuis le début, ou le dernier joué. */
  repeat(): void {
    if (this.s.status !== "en_cours") return;
    const base = this.s.playing ?? this.s.lastPlayed;
    if (!base) return;
    if (this.s.playing) {
      this.o.sink.stop();
      const again = { ...this.s.playing, seq: ++this.s.seq };
      this.s.playing = again;
      this.o.sink.play(again);
      this.emit();
      return;
    }
    this.s.queue.unshift({ ...base, seq: ++this.s.seq, repeat: true, last: false, signal: true });
    this.pump();
  }

  /** Bouton parent « C'est fait » pendant un défi. */
  confirmChallenge(): void {
    const c = this.s.challenge;
    if (!c || this.s.status !== "en_cours") return;
    if (c.phase !== "confirmation") return;
    this.completeChallenge();
    this.pump();
  }

  /** Correction manuelle de l'environnement par le parent (null = détection automatique). */
  setEnvironment(env: Environment | null): void {
    this.s.envOverride = env;
    this.record("environnement", env ? `choisi par le parent : ${env}` : "retour à la détection automatique");
    this.emit();
  }

  /** Appelé par le lecteur à la fin (ou en cas d'échec) d'un audio. */
  audioEnded(seq: number, error?: string): void {
    const item = this.s.playing;
    if (!item || item.seq !== seq) return; // fin périmée (élément arrêté ou remplacé)
    this.s.playing = null;
    this.s.lastPlayed = item;
    if (error) this.record("audio_manquant", `${item.key} : ${error}`);
    if (!item.repeat) this.afterItem(item);
    this.pump();
  }

  /** Nouvelle position brute du fournisseur. */
  onPosition(fix: PositionFix): FilterResult | null {
    if (this.s.status !== "en_cours" && this.s.status !== "pret") return null;
    const r = this.filter.push(fix);
    if (r.accepted) {
      if (this.s.status === "en_cours") this.s.distanceM += r.deltaM;
      this.s.lastPosition = { lat: fix.lat, lon: fix.lon, accuracy: fix.accuracy };
      this.evaluateEnvironment(fix);
    } else if (!this.s.lastPosition && r.reason !== "precision") {
      this.s.lastPosition = { lat: fix.lat, lon: fix.lon, accuracy: fix.accuracy };
    }
    this.pump();
    return r;
  }

  /** À appeler régulièrement (≈ 1 s) : fait avancer les délais (écarts, silences de défi). */
  tick(): void {
    this.pump();
  }

  // ── Mécanique interne ────────────────────────────────────────
  private now(): number {
    return this.o.clock.now();
  }

  private elapsedAt(now: number): number {
    return this.s.activeMs + (this.s.runningSince !== null ? Math.max(0, now - this.s.runningSince) : 0);
  }

  private emit(): void {
    for (const l of this.listeners) l(this.s);
  }

  private record(type: HistoryEntry["type"], detail: string): void {
    const e: HistoryEntry = { atMs: Math.round(this.elapsedMs()), distanceM: Math.round(this.s.distanceM), type, detail };
    this.s.history.push(e);
    if (this.s.history.length > 300) this.s.history.shift();
    this.o.log?.(e);
  }

  private enqueue(
    kind: PlayKind,
    segments: Segment[],
    extra: { eventId?: string; env?: Environment; scope?: string; signal?: boolean } = {},
  ): void {
    segments.forEach((segment, i) => {
      const last = i === segments.length - 1;
      this.s.queue.push({
        seq: ++this.s.seq,
        kind,
        key: segmentKey(extra.scope ?? this.quest.id, segment.id),
        segment,
        last,
        signal: last && (extra.signal ?? true),
        ...(extra.eventId ? { eventId: extra.eventId } : {}),
        ...(extra.env ? { env: extra.env } : {}),
      });
    });
  }

  private afterItem(item: PlayItem): void {
    if (!item.last) return;
    switch (item.kind) {
      case "introduction":
        this.s.introDone = true;
        this.s.lastEventEndMs = this.elapsedMs();
        break;
      case "evenement": {
        const ev = this.quest.events.find((e) => e.id === item.eventId);
        if (ev?.type === "defi") {
          this.s.challenge = {
            eventId: ev.id,
            type: ev.defi.type,
            needsConfirm: ev.defi.parentConfirme,
            phase: "attente",
            waitUntilMs: this.elapsedMs() + ev.defi.attenteS * 1000,
          };
        } else if (ev) {
          this.eventDone(ev.id);
        }
        break;
      }
      case "bravo":
        if (item.eventId) this.eventDone(item.eventId);
        break;
      case "lieu":
        this.s.lastPoiMs = this.elapsedMs();
        break;
      case "conclusion":
        this.s.activeMs = this.elapsedMs();
        this.s.runningSince = null;
        this.s.status = "termine";
        this.s.endReason = this.s.endReason ?? "conclusion";
        this.record("fin", this.s.endReason);
        break;
      default:
        break;
    }
  }

  private eventDone(eventId: string): void {
    this.s.lastEventEndMs = this.elapsedMs();
    this.record("defi_fini", eventId);
  }

  private completeChallenge(): void {
    const c = this.s.challenge;
    if (!c) return;
    this.s.challenge = null;
    const ev = this.quest.events.find((e) => e.id === c.eventId);
    if (ev?.type === "defi" && ev.defi.bravo) {
      this.enqueue("bravo", [ev.defi.bravo], { eventId: ev.id });
    } else {
      this.eventDone(c.eventId);
    }
  }

  private queueConclusion(): void {
    if (this.s.conclusionQueued) return;
    this.s.conclusionQueued = true;
    this.enqueue("conclusion", [this.quest.conclusion], { signal: false });
  }

  private evaluateEnvironment(p: { lat: number; lon: number }): void {
    const due =
      this.s.lastEnvEvalDistanceM === null || this.s.distanceM - this.s.lastEnvEvalDistanceM >= this.o.envEvalEveryM;
    if (!due) return;
    this.s.lastEnvEvalDistanceM = this.s.distanceM;
    if (!this.context) return;
    const c = classify(p, this.context);
    if (c.env !== this.s.env) {
      this.s.env = c.env;
      this.record("environnement", `${c.env} (${c.raison})`);
    }
    this.s.envRaison = c.raison;
  }

  /** Fait avancer la machine : file audio, silences de défi, déclencheurs. */
  private pump(): void {
    if (this.s.status !== "en_cours") {
      this.emit();
      return;
    }
    const elapsed = this.elapsedMs();

    // Défi en cours : silence d'attente puis, si besoin, bouton parent.
    const c = this.s.challenge;
    if (c && !this.s.playing && this.s.queue.length === 0 && c.phase === "attente" && elapsed >= c.waitUntilMs) {
      if (c.needsConfirm) c.phase = "confirmation";
      else this.completeChallenge();
    }

    if (!this.s.playing && this.s.queue.length === 0 && !this.s.challenge && this.s.introDone && !this.s.conclusionQueued) {
      this.checkTriggers(elapsed);
    }

    if (!this.s.playing && this.s.queue.length > 0) {
      const next = this.s.queue.shift() as PlayItem;
      this.s.playing = next;
      this.o.sink.play(next);
    }
    this.emit();
  }

  private checkTriggers(elapsed: number): void {
    const sinceLast = elapsed - (this.s.lastEventEndMs ?? 0);
    const ev = this.quest.events[this.s.nextEventIndex];
    if (ev) {
      if (this.s.distanceM >= ev.declencheur.distanceM && sinceLast >= ev.declencheur.ecartMinS * 1000) {
        this.s.nextEventIndex++;
        const v = pickVariant(ev, this.effectiveEnv);
        this.record("evenement", `${ev.id} — variante ${v.env}`);
        this.enqueue("evenement", v.segments, { eventId: ev.id, env: v.env });
        return;
      }
    } else if (sinceLast >= this.quest.conclusionEcartS * 1000) {
      this.queueConclusion();
      return;
    }
    this.checkPoi(elapsed, sinceLast, ev);
  }

  private checkPoi(elapsed: number, sinceLast: number, next: QuestEvent | undefined): void {
    const ctx = this.context;
    const lines = this.poiLines;
    const pos = this.s.lastPosition;
    if (!ctx || !lines || !pos || ctx.pois.length === 0) return;
    if (!next) return; // après le dernier événement, place à la conclusion
    if (sinceLast < this.o.poiAfterEventS * 1000) return;
    if (this.s.lastPoiMs !== null && elapsed - this.s.lastPoiMs < this.o.poiCooldownS * 1000) return;
    if (next.declencheur.distanceM - this.s.distanceM < this.o.poiEventMarginM) return;

    let best: { id: string; type: (typeof ctx.pois)[number]["type"]; d: number; name?: string } | undefined;
    for (const p of ctx.pois) {
      if (this.s.usedPois.includes(p.id)) continue;
      // Redondant avec la variante d'environnement déjà jouée.
      if (p.type === "foret" && this.effectiveEnv === "foret") continue;
      if (p.type === "plan_eau" && this.effectiveEnv === "bord_eau") continue;
      const area = p.areaId ? ctx.areas.find((a) => a.id === p.areaId) : undefined;
      const d = area ? distanceToArea(pos, area) : haversine(pos, p);
      if (d <= this.o.poiRadiusM && (!best || d < best.d)) best = { id: p.id, type: p.type, d, ...(p.name ? { name: p.name } : {}) };
    }
    if (!best) return;
    const variants = lines.lignes[best.type];
    const n = this.s.poiTypeCount[best.type] ?? 0;
    const seg = variants[n % variants.length];
    if (!seg) return;
    this.s.usedPois.push(best.id);
    this.s.poiTypeCount[best.type] = n + 1;
    this.record("lieu", `${best.type}${best.name ? ` « ${best.name} »` : ""} à ${Math.round(best.d)} m`);
    this.enqueue("lieu", [seg], { scope: POI_SCOPE });
  }
}
