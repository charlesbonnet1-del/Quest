/**
 * Session de jeu côté client : relie le pack hors ligne, la position (réelle ou simulée),
 * la détection d'environnement, le moteur, le lecteur audio, l'écran allumé.
 * Classe sans React : l'interface s'abonne et relit `snapshot()`.
 */
import type { Environment } from "../content/schema";
import { AudioPlayer } from "../audio/player";
import { WakeLockManager } from "../device/wakelock";
import { QuestEngine } from "../engine/engine";
import { realClock } from "../engine/clock";
import type { EngineState } from "../engine/types";
import { classify } from "../environment/classify";
import type { ContextData } from "../environment/types";
import type { PositionFix } from "../geo/filter";
import { roundPosition } from "../geo/geo";
import { GeolocationProvider, type PositionErrorKind, type PositionProvider } from "../geo/provider";
import { audioPriority, type QuestBundle } from "../offline/bundle";
import {
  clearEngineState,
  downloadAudio,
  loadBundle,
  loadCachedContext,
  loadEngineState,
  requestPersistence,
  saveContext,
  saveEngineState,
  type DownloadProgress,
} from "../offline/pack";
import { checkSunset, type SunsetCheck } from "../safety/sunset";
import { SimulatedProvider } from "../sim/provider";
import { getRoute, SIM_ROUTES } from "../sim/routes";

export type Phase = "preparation" | "quete" | "fin";
export type ContextStatus = "attente" | "chargement" | "ok" | "echec";

export interface SessionSnapshot {
  phase: Phase;
  sim: boolean;
  bundle: QuestBundle | null;
  bundleFromCache: boolean;
  bundleError: string | null;
  locating: boolean;
  position: PositionFix | null;
  positionError: { kind: PositionErrorKind; message: string } | null;
  contextStatus: ContextStatus;
  contextNote: string | null;
  download: DownloadProgress | null;
  wakeLockSupported: boolean;
  wakeLockActive: boolean;
  safetyAccepted: boolean;
  sunset: SunsetCheck | null;
  engine: Readonly<EngineState> | null;
  audioSource: "cache" | "reseau" | "voix" | null;
  speaking: boolean;
  autoPaused: boolean;
  resumable: EngineState | null;
  online: boolean;
  simFixture: boolean;
  simRouteId: string;
  logs: string[];
}

export class QuestSession {
  private s: SessionSnapshot;
  private listeners = new Set<() => void>();
  readonly player: AudioPlayer;
  readonly wakeLock = new WakeLockManager();
  readonly provider: PositionProvider;
  readonly simProvider: SimulatedProvider | null;
  private engine: QuestEngine | null = null;
  private context: ContextData | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private downloadAbort: AbortController | null = null;
  private providerRunning = false;
  private snapshotCache: SessionSnapshot | null = null;

  constructor(
    private readonly questId: string,
    sim: boolean,
  ) {
    const route = getRoute("parc") ?? SIM_ROUTES[0];
    this.simProvider = sim ? new SimulatedProvider() : null;
    if (this.simProvider && route) this.simProvider.loadRoute(route.id, route.points, route.tours);
    this.provider = this.simProvider ?? new GeolocationProvider();
    this.player = new AudioPlayer((key) => this.s.bundle?.audio[key]);
    this.player.onEnded = (seq, err) => this.engine?.audioEnded(seq, err);
    this.player.onState = (st) => this.patch({ speaking: st.playing, audioSource: st.source });
    this.wakeLock.onChange = (active) => this.patch({ wakeLockActive: active });
    this.s = {
      phase: "preparation",
      sim,
      bundle: null,
      bundleFromCache: false,
      bundleError: null,
      locating: false,
      position: null,
      positionError: null,
      contextStatus: "attente",
      contextNote: null,
      download: null,
      wakeLockSupported: WakeLockManager.supported,
      wakeLockActive: false,
      safetyAccepted: false,
      sunset: null,
      engine: null,
      audioSource: null,
      speaking: false,
      autoPaused: false,
      resumable: null,
      online: typeof navigator === "undefined" ? true : navigator.onLine,
      simFixture: false,
      simRouteId: route?.id ?? "parc",
      logs: [],
    };
  }

  // ── Abonnement (compatible useSyncExternalStore) ─────────────
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  snapshot = (): SessionSnapshot => {
    this.snapshotCache ??= { ...this.s, engine: this.engine ? { ...this.engine.state } : null };
    return this.snapshotCache;
  };

  private patch(p: Partial<SessionSnapshot>): void {
    Object.assign(this.s, p);
    this.changed();
  }

  private changed(): void {
    this.snapshotCache = null;
    for (const l of this.listeners) l();
  }

  private log(msg: string): void {
    const line = `${new Date().toLocaleTimeString("fr-FR")} ${msg}`;
    if (this.s.sim) console.info(`[Quête] ${msg}`);
    this.s.logs = [...this.s.logs.slice(-80), line];
  }

  get engineInstance(): QuestEngine | null {
    return this.engine;
  }

  // ── Préparation ──────────────────────────────────────────────
  async init(): Promise<void> {
    window.addEventListener("online", this.onOnline);
    window.addEventListener("offline", this.onOnline);
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("pagehide", this.persistNow);
    void requestPersistence();
    try {
      const { bundle, fromCache } = await loadBundle(this.questId);
      this.patch({ bundle, bundleFromCache: fromCache, bundleError: null });
      const saved = await loadEngineState(this.questId);
      if (saved && (saved.status === "en_cours" || saved.status === "en_pause")) this.patch({ resumable: saved });
      this.createEngine();
    } catch {
      this.patch({
        bundleError: navigator.onLine
          ? "Impossible de charger la quête. Réessayez dans un instant."
          : "Pas de réseau, et cette quête n'a pas encore été téléchargée sur ce téléphone. Connectez-vous pour la préparer.",
      });
    }
  }

  private createEngine(restored?: EngineState): void {
    const b = this.s.bundle;
    if (!b) return;
    this.engine = new QuestEngine(
      b.quest,
      {
        clock: this.provider.clock ?? realClock,
        sink: this.player,
        context: this.context,
        poiLines: b.poiLines,
        log: (e) => this.log(`${Math.round(e.distanceM)} m · ${e.type} ${e.detail}`),
      },
      restored,
    );
    this.engine.subscribe((st) => {
      this.changed();
      this.scheduleSave();
      if (st.status === "termine" && this.s.phase === "quete") this.toEnd();
    });
    this.changed();
  }

  /** Reprendre une quête interrompue (rechargement, fermeture de l'onglet). */
  useResumable(): void {
    const saved = this.s.resumable;
    if (!saved) return;
    this.createEngine(saved);
    this.patch({ resumable: null, safetyAccepted: false });
  }

  async discardResumable(): Promise<void> {
    await clearEngineState(this.questId);
    this.patch({ resumable: null });
  }

  /** Demande la permission de localisation et démarre le suivi. */
  requestLocation(): void {
    this.patch({ locating: true, positionError: null });
    this.startProvider();
  }

  private startProvider(): void {
    if (this.providerRunning) return;
    this.providerRunning = true;
    this.provider.start(this.onFix, (kind, message) => {
      this.providerRunning = kind !== "refusee" && kind !== "non_supportee" && this.providerRunning;
      if (kind === "refusee" || kind === "non_supportee" || !this.s.position) {
        this.patch({ locating: false, positionError: { kind, message } });
      }
    });
  }

  private stopProvider(): void {
    if (this.provider.kind === "simule") return; // la simulation garde ses commandes
    this.provider.stop();
    this.providerRunning = false;
  }

  private onFix = (fix: PositionFix): void => {
    const first = !this.s.position;
    this.s.position = fix;
    this.s.locating = false;
    this.s.positionError = null;
    this.engine?.onPosition(fix);
    if (first && fix.accuracy <= 100) void this.detectContext();
    this.changed();
  };

  /** Interroge /api/context (position arrondie) puis classe l'environnement. */
  async detectContext(): Promise<void> {
    const p = this.s.position;
    if (!p || this.s.contextStatus === "chargement") return;
    this.patch({ contextStatus: "chargement", contextNote: null });
    const rounded = roundPosition(p, 100);
    const routeFixture = this.s.sim && this.s.simFixture ? getRoute(this.s.simRouteId)?.fixture : undefined;
    let ctx: ContextData | null = null;
    let note: string | null = null;
    try {
      const res = await fetch("/api/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rounded, ...(routeFixture ? { fixture: routeFixture } : {}) }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(String(res.status));
      ctx = (await res.json()) as ContextData;
      if (ctx.source !== "fixture") await saveContext(ctx).catch(() => {});
    } catch {
      ctx = await loadCachedContext(p).catch(() => null);
      note = ctx
        ? "Données de lieux de la dernière sortie réutilisées."
        : "Impossible de reconnaître l'endroit (réseau ou service indisponible). Choisissez l'environnement ci-dessous.";
    }
    this.context = ctx;
    this.engine?.setContext(ctx);
    this.patch({
      contextStatus: ctx ? "ok" : "echec",
      contextNote: note,
      sunset: this.s.bundle ? checkSunset(p, new Date(), this.s.bundle.quest.dureeEstimeeMin) : null,
    });
    if (ctx && this.s.sim) this.log(`contexte : ${ctx.source}, ${ctx.areas.length} zones, ${ctx.pois.length} lieux — ${classify(p, ctx).raison}`);
    void this.startDownloads();
  }

  /** Téléchargement de l'audio en arrière-plan, environnement détecté en priorité. */
  async startDownloads(): Promise<void> {
    const b = this.s.bundle;
    if (!b || this.downloadAbort) return;
    this.downloadAbort = new AbortController();
    const env = this.engine?.effectiveEnv ?? "default";
    const urls = audioPriority(b.quest, b.poiLines, env)
      .map((k) => b.audio[k]?.url)
      .filter((u): u is string => !!u);
    await downloadAudio(urls, (download) => this.patch({ download }), this.downloadAbort.signal);
  }

  setEnvironment(env: Environment | null): void {
    this.engine?.setEnvironment(env);
  }

  acceptSafety(v: boolean): void {
    this.patch({ safetyAccepted: v });
  }

  async requestWakeLock(): Promise<void> {
    await this.wakeLock.request();
  }

  get canStart(): boolean {
    return (
      !!this.engine &&
      !!this.s.position &&
      (this.s.contextStatus === "ok" || this.s.contextStatus === "echec") &&
      this.s.safetyAccepted
    );
  }

  /** Bouton « Partir » : DOIT être appelé dans le gestionnaire de clic (déverrouillage audio iOS). */
  depart(): void {
    if (!this.engine || !this.canStart) return;
    this.player.unlock();
    void this.wakeLock.request();
    if (this.engine.state.status === "pret") this.engine.start();
    else if (this.engine.state.status === "en_pause") this.engine.resume();
    this.startProvider();
    this.tickTimer ??= setInterval(() => this.engine?.tick(), 1000);
    this.patch({ phase: "quete", autoPaused: false });
  }

  // ── Pendant la quête ─────────────────────────────────────────
  pause(): void {
    this.engine?.pause();
    this.stopProvider();
  }

  resume(): void {
    // Geste utilisateur : on en profite pour (re)déverrouiller l'audio.
    this.player.unlock();
    void this.wakeLock.reacquire();
    this.startProvider();
    this.engine?.resume();
    this.patch({ autoPaused: false });
  }

  repeat(): void {
    this.engine?.repeat();
  }

  confirmChallenge(): void {
    this.engine?.confirmChallenge();
  }

  tired(): void {
    this.engine?.tired();
  }

  finish(): void {
    this.engine?.finish();
  }

  private toEnd(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
    this.stopProvider();
    if (this.provider.kind === "simule") this.provider.stop();
    void this.wakeLock.release();
    void clearEngineState(this.questId);
    this.downloadAbort?.abort();
    this.patch({ phase: "fin" });
  }

  setSimFixture(v: boolean): void {
    this.patch({ simFixture: v });
    void this.redetect();
  }

  setSimRoute(id: string): void {
    const r = getRoute(id);
    if (!r || !this.simProvider) return;
    this.simProvider.loadRoute(r.id, r.points, r.tours);
    this.patch({ simRouteId: id });
    void this.redetect();
  }

  /** Relance la détection (simulation : nouveau trajet ou nouvelle source de données). */
  async redetect(): Promise<void> {
    if (!this.s.position || this.s.contextStatus === "chargement") return;
    const pos = this.simProvider?.position;
    if (pos) this.s.position = { ...pos, accuracy: 5, timestamp: this.provider.clock.now() };
    this.s.contextStatus = "attente";
    await this.detectContext();
  }

  private onVisibility = (): void => {
    if (document.visibilityState === "hidden") {
      if (this.engine?.state.status === "en_cours" && !this.s.sim) {
        this.engine.pause("écran verrouillé ou application en arrière-plan");
        this.stopProvider();
        this.patch({ autoPaused: true });
      }
      this.persistNow();
    } else {
      void this.wakeLock.reacquire();
    }
  };

  private onOnline = (): void => {
    this.patch({ online: navigator.onLine });
  };

  private scheduleSave(): void {
    if (this.saveTimer || !this.engine || this.engine.state.status === "pret") return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.persistNow();
    }, 3000);
  }

  private persistNow = (): void => {
    const st = this.engine?.state;
    if (st && (st.status === "en_cours" || st.status === "en_pause")) void saveEngineState(structuredClone(st));
  };

  destroy(): void {
    this.persistNow();
    window.removeEventListener("online", this.onOnline);
    window.removeEventListener("offline", this.onOnline);
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("pagehide", this.persistNow);
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.downloadAbort?.abort();
    this.provider.stop();
    this.player.stop();
    void this.wakeLock.release();
  }
}
