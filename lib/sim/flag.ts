/** Mode simulation : `?sim=1` dans l'URL, ou réglage développeur (localStorage). `?sim=0` le coupe. */
export const SIM_STORAGE_KEY = "quete:sim";

export function isSimEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(window.location.search).get("sim");
  if (q === "1") return true;
  if (q === "0") return false;
  try {
    return window.localStorage.getItem(SIM_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSimEnabled(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(SIM_STORAGE_KEY, "1");
    else window.localStorage.removeItem(SIM_STORAGE_KEY);
  } catch {
    /* stockage indisponible */
  }
}
