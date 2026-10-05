/**
 * Écran allumé (Screen Wake Lock API). Sans lui, l'écran se met en veille et la
 * géolocalisation s'arrête. Le verrou est perdu quand la page est masquée : on le
 * redemande automatiquement au retour.
 */
export class WakeLockManager {
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;
  onChange: (active: boolean) => void = () => {};

  static get supported(): boolean {
    return typeof navigator !== "undefined" && "wakeLock" in navigator;
  }

  get active(): boolean {
    return !!this.sentinel && !this.sentinel.released;
  }

  async request(): Promise<boolean> {
    this.wanted = true;
    if (!WakeLockManager.supported || document.visibilityState !== "visible") return false;
    try {
      this.sentinel = await navigator.wakeLock.request("screen");
      this.sentinel.addEventListener("release", () => this.onChange(false));
      this.onChange(true);
      return true;
    } catch {
      this.onChange(false);
      return false;
    }
  }

  /** À appeler quand la page redevient visible. */
  async reacquire(): Promise<void> {
    if (this.wanted && !this.active) await this.request();
  }

  async release(): Promise<void> {
    this.wanted = false;
    await this.sentinel?.release().catch(() => {});
    this.sentinel = null;
    this.onChange(false);
  }
}
