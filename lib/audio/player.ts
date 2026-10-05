/**
 * Lecteur audio du client (implémente AudioSink du moteur).
 * - UN SEUL élément <audio>, déverrouillé au geste « Partir » puis réutilisé (iOS).
 * - Source : Cache Storage (pack hors ligne) → URL réseau → synthèse vocale du système
 *   en dernier recours (pour ne jamais bloquer la quête si un fichier manque).
 * - Signal de fin : bip synthétisé (Web Audio, sans fichier) + vibration si disponible (Android).
 */
import type { AudioSink } from "../engine/engine";
import type { PlayItem } from "../engine/types";
import { getCachedAudioBlob } from "../offline/pack";

export interface AudioSource {
  url: string;
}

/** WAV silencieux minimal (pour déverrouiller l'élément audio sur iOS). */
const SILENCE =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

export class AudioPlayer implements AudioSink {
  private el: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private current: PlayItem | null = null;
  private objectUrl: string | null = null;
  private speaking = false;
  private paused = false;
  private token = 0;
  onEnded: (seq: number, error?: string) => void = () => {};
  onState: (s: { playing: boolean; key: string | null; source: "cache" | "reseau" | "voix" | null }) => void = () => {};

  constructor(private readonly resolve: (key: string) => AudioSource | undefined) {}

  /** À appeler dans un gestionnaire de clic (geste utilisateur). */
  unlock(): void {
    if (typeof window === "undefined") return;
    if (!this.el) {
      this.el = new Audio();
      this.el.preload = "auto";
      this.el.setAttribute("playsinline", "");
    }
    const el = this.el;
    el.src = SILENCE;
    el.play().catch(() => {});
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx && !this.ctx) this.ctx = new Ctx();
      void this.ctx?.resume();
    } catch {
      this.ctx = null;
    }
    // Voix de secours : un énoncé vide la « réveille » aussi sur iOS.
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance("");
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
  }

  play(item: PlayItem): void {
    const token = ++this.token;
    this.current = item;
    this.paused = false;
    void this.start(item, token);
  }

  private async start(item: PlayItem, token: number): Promise<void> {
    const el = this.el ?? (this.el = new Audio());
    this.releaseUrl();
    const src = this.resolve(item.key);
    let source: "cache" | "reseau" | "voix" = "cache";
    let url: string | null = null;
    if (src) {
      const blob = await getCachedAudioBlob(src.url).catch(() => null);
      if (token !== this.token) return;
      if (blob) {
        url = this.objectUrl = URL.createObjectURL(blob);
      } else if (typeof navigator === "undefined" || navigator.onLine) {
        url = src.url;
        source = "reseau";
      }
    }
    if (!url) {
      this.speakFallback(item, token);
      return;
    }
    el.onended = () => token === this.token && this.finish(item, token);
    el.onerror = () => token === this.token && this.speakFallback(item, token);
    el.src = url;
    this.updateMediaSession(item);
    this.onState({ playing: true, key: item.key, source });
    try {
      await el.play();
    } catch (e) {
      if (token !== this.token) return;
      // NotAllowedError : audio non déverrouillé (pas de geste). On tente la voix de secours.
      this.speakFallback(item, token, (e as Error).name);
    }
  }

  private speakFallback(item: PlayItem, token: number, why?: string): void {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      this.finish(item, token, `audio introuvable${why ? ` (${why})` : ""}`);
      return;
    }
    const u = new SpeechSynthesisUtterance(item.segment.texte);
    u.lang = "fr-FR";
    u.rate = 0.95;
    const fr = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("fr"));
    if (fr) u.voice = fr;
    this.speaking = true;
    this.onState({ playing: true, key: item.key, source: "voix" });
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    const done = () => {
      if (watchdog) clearTimeout(watchdog);
      if (!this.speaking) return;
      this.speaking = false;
      if (token === this.token) this.finish(item, token, "audio introuvable : voix de secours utilisée");
    };
    u.onend = done;
    u.onerror = done;
    // Certains navigateurs ne signalent jamais la fin (pas de voix installée) : on ne bloque pas la quête.
    const arm = (ms: number) => {
      watchdog = setTimeout(() => {
        if (this.paused) arm(5000);
        else {
          window.speechSynthesis.cancel();
          done();
        }
      }, ms);
    };
    arm((item.segment.texte.length / 8) * 1000 + 5000);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  private finish(item: PlayItem, token: number, error?: string): void {
    if (token !== this.token) return;
    this.current = null;
    this.releaseUrl();
    this.onState({ playing: false, key: null, source: null });
    if (item.signal) this.signal();
    this.onEnded(item.seq, error);
  }

  stop(): void {
    this.token++;
    this.paused = false;
    this.current = null;
    if (this.el) {
      this.el.pause();
      this.el.removeAttribute("src");
      this.el.load();
    }
    if (this.speaking && typeof window !== "undefined") window.speechSynthesis.cancel();
    this.speaking = false;
    this.releaseUrl();
    this.onState({ playing: false, key: null, source: null });
  }

  pause(): void {
    this.paused = true;
    this.el?.pause();
    if (this.speaking) window.speechSynthesis.pause();
  }

  resume(): void {
    this.paused = false;
    if (this.speaking) {
      window.speechSynthesis.resume();
      return;
    }
    if (this.current && this.el?.src) this.el.play().catch(() => {});
  }

  /** Petit signal sonore « à toi de jouer » + vibration (Android uniquement : iOS l'ignore). */
  signal(kind: "fin" | "bouton" = "fin"): void {
    const ctx = this.ctx;
    if (ctx) {
      try {
        const notes = kind === "fin" ? [660, 880] : [880, 660, 880];
        notes.forEach((f, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          const t = ctx.currentTime + i * 0.14;
          o.type = "sine";
          o.frequency.value = f;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
          o.connect(g).connect(ctx.destination);
          o.start(t);
          o.stop(t + 0.13);
        });
      } catch {
        /* pas de son : tant pis */
      }
    }
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(kind === "fin" ? [80, 60, 80] : 200);
  }

  private updateMediaSession(item: PlayItem): void {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: "Quête", artist: item.segment.voix === "heros" ? "Le héros" : "Narrateur" });
    } catch {
      /* non supporté */
    }
  }

  private releaseUrl(): void {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }
}
