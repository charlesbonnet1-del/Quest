import { describe, expect, it } from "vitest";
import { audioPriority } from "@/lib/offline/bundle";
import { checkSunset } from "@/lib/safety/sunset";
import { samplePoi, sampleQuest } from "./helpers";

describe("ordre de téléchargement", () => {
  it("commence par l'intro et les variantes de l'environnement détecté, sans doublon", () => {
    const q = sampleQuest();
    const keys = audioPriority(q, samplePoi(), "parc");
    expect(keys[0]).toBe(`${q.id}/intro-securite`);
    expect(keys[2]).toBe(`${q.id}/e1-parc`);
    expect(keys.indexOf(`${q.id}/conclusion`)).toBeLessThan(keys.indexOf(`${q.id}/e1-ville`));
    expect(keys.indexOf(`${q.id}/e1-default`)).toBeGreaterThan(keys.indexOf("poi/statue-1"));
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("environnement inconnu : default en priorité", () => {
    const q = sampleQuest();
    expect(audioPriority(q, null, "default")[2]).toBe(`${q.id}/e1-default`);
  });
});

describe("coucher du soleil", () => {
  const paris = { lat: 48.8566, lon: 2.3522 };
  it("pas d'alerte en début d'après-midi", () => {
    expect(checkSunset(paris, new Date("2026-06-21T12:00:00Z"), 30).warn).toBe(false);
  });
  it("alerte si la quête finit après le coucher du soleil", () => {
    // 5 octobre : coucher vers 19 h 15 à Paris (17 h 15 UTC)
    const r = checkSunset(paris, new Date("2026-10-05T16:50:00Z"), 45);
    expect(r.warn).toBe(true);
    expect(r.message).toMatch(/se couche/);
  });
  it("alerte s'il fait déjà nuit", () => {
    expect(checkSunset(paris, new Date("2026-12-01T20:00:00Z"), 30).message).toMatch(/nuit/);
  });
});
