import { describe, expect, it } from "vitest";
import { audioHash, normalizeText } from "@/lib/content/audio-hash";
import { emptyManifest } from "@/lib/content/manifest";
import { findForbidden, hasSafePlaceMention, lintQuest } from "@/lib/content/rules";
import { allQuestSegments, QuestSchema } from "@/lib/content/schema";
import { buildPlan, currentSegmentIndex } from "@/lib/audio-gen/plan";
import { bitrateKbps, estimateDurationS, readConfig, supportsLanguageCode } from "@/lib/audio-gen/config";
import { synthesize, TtsError, withRetry } from "@/lib/audio-gen/elevenlabs";
import { loadAllQuests, loadPoiLines } from "@/lib/content/load";
import { miniQuest, sampleQuest } from "./helpers";

describe("schéma de contenu", () => {
  it("valide toutes les quêtes de content/quests et poi.json", () => {
    expect(loadAllQuests().length).toBeGreaterThan(0);
    expect(() => loadPoiLines()).not.toThrow();
  });
  it("la quête d'exemple a 5 événements, chacun avec default + 5 environnements", () => {
    const q = sampleQuest();
    expect(q.provisoire).toBe(true);
    expect(q.events).toHaveLength(5);
    for (const e of q.events) {
      for (const env of ["default", "ville", "parc", "foret", "bord_eau", "campagne"] as const) expect(e.variantes[env]).toBeDefined();
    }
  });
  it("refuse un événement sans variante default", () => {
    const raw = JSON.parse(JSON.stringify(miniQuest()));
    delete raw.events[0].variantes.default;
    expect(QuestSchema.safeParse(raw).success).toBe(false);
  });
  it("refuse des identifiants de segment en double", () => {
    const raw = JSON.parse(JSON.stringify(miniQuest()));
    raw.events[0].variantes.default[0].id = "intro";
    const r = QuestSchema.safeParse(raw);
    expect(r.success).toBe(false);
  });
  it("refuse des seuils de distance décroissants", () => {
    const raw = JSON.parse(JSON.stringify(miniQuest()));
    raw.events[1].declencheur.distanceM = 50;
    expect(QuestSchema.safeParse(raw).success).toBe(false);
  });
  it("refuse un champ inconnu (faute de frappe)", () => {
    const raw = JSON.parse(JSON.stringify(miniQuest()));
    raw.events[0].variantes.foret_dense = raw.events[0].variantes.default;
    expect(QuestSchema.safeParse(raw).success).toBe(false);
  });
  it("applique les valeurs par défaut (attente du défi, écart)", () => {
    const q = miniQuest();
    expect(q.events[2]?.declencheur.ecartMinS).toBe(0);
    expect(q.conclusionEcartS).toBe(5);
  });
});

describe("règles de sécurité éditoriale", () => {
  it.each([
    ["Escaladez le mur !", "escalade"],
    ["Tu peux grimper sur le banc", "grimper"],
    ["Entre dans l'eau pour voir", "entrer dans l'eau"],
    ["Traversez la rue", "traverser"],
    ["Parle à un inconnu", "inconnu"],
    ["Quitte le groupe un instant", "quitter le groupe"],
    ["Cours sur la route", "courir sur la route"],
    ["Va vers la fontaine", "instruction de direction"],
    ["Dirige-toi à gauche", "instruction de direction"],
  ])("signale « %s »", (texte, raison) => {
    expect(findForbidden(texte)).toContain(raison);
  });
  it("ne signale pas des phrases anodines", () => {
    expect(findForbidden("Regarde à travers les feuilles, et marche avec ton adulte.")).toEqual([]);
  });
  it("détecte la mention de lieu sûr", () => {
    expect(hasSafePlaceMention("Ton adulte choisit un endroit sûr")).toBe(true);
    expect(hasSafePlaceMention("Cours très vite !")).toBe(false);
  });
  it("la quête d'exemple ne contient aucune erreur", () => {
    expect(lintQuest(sampleQuest(), "x").filter((i) => i.level === "erreur")).toEqual([]);
  });
  it("signale un défi physique sans lieu sûr", () => {
    const raw = JSON.parse(JSON.stringify(miniQuest()));
    raw.events[0] = {
      id: "p",
      type: "defi",
      declencheur: { distanceM: 10 },
      defi: { type: "physique" },
      variantes: { default: [{ id: "p1", voix: "heros", texte: "Saute dix fois !" }] },
    };
    const issues = lintQuest(QuestSchema.parse(raw), "x");
    expect(issues.some((i) => i.level === "erreur" && /lieu sûr/.test(i.message))).toBe(true);
  });
});

describe("hash audio", () => {
  const base = { texte: "Bonjour !", voiceId: "v1", modelId: "m1", outputFormat: "mp3_44100_64" };
  it("est stable et ignore les différences d'espaces", () => {
    expect(audioHash(base)).toBe(audioHash({ ...base, texte: "  Bonjour   !\n" }));
    expect(audioHash(base)).toMatch(/^[0-9a-f]{24}$/);
    expect(normalizeText("a \n b")).toBe("a b");
  });
  it("change avec le texte, la voix, le modèle ou le format", () => {
    const h = audioHash(base);
    expect(audioHash({ ...base, texte: "Bonjour." })).not.toBe(h);
    expect(audioHash({ ...base, voiceId: "v2" })).not.toBe(h);
    expect(audioHash({ ...base, modelId: "m2" })).not.toBe(h);
    expect(audioHash({ ...base, outputFormat: "mp3_22050_32" })).not.toBe(h);
  });
});

describe("plan de génération", () => {
  const config = { modelId: "eleven_flash_v2_5", voices: { narrateur: "N", heros: "H" }, outputFormat: "mp3_44100_64", costPer1kChars: 0.15 };
  it("liste tous les segments et ne régénère pas ce qui existe", () => {
    const q = sampleQuest();
    const p1 = buildPlan([q], undefined, config, emptyManifest());
    expect(p1.items).toHaveLength(allQuestSegments(q).length);
    expect(p1.missing.length).toBe(p1.items.length);
    expect(p1.estimatedCost).toBeCloseTo((p1.totalChars / 1000) * 0.15, 2);
    const m = emptyManifest();
    for (const it of p1.missing.slice(0, 10)) {
      m.files[it.hash] = { hash: it.hash, url: "u", durationS: 1, chars: 1, voiceId: "", modelId: "", outputFormat: "", bytes: 1, createdAt: "" };
    }
    const p2 = buildPlan([q], undefined, config, m);
    expect(p2.missing.length).toBe(p1.missing.length - 10);
    expect(Object.keys(currentSegmentIndex(p2.items, m))).toHaveLength(10);
  });
  it("change de modèle → tout est à régénérer", () => {
    const q = miniQuest();
    const p1 = buildPlan([q], undefined, config, emptyManifest());
    const m = emptyManifest();
    for (const it of p1.items) m.files[it.hash] = { hash: it.hash, url: "", durationS: 1, chars: 1, voiceId: "", modelId: "", outputFormat: "", bytes: 1, createdAt: "" };
    expect(buildPlan([q], undefined, config, m).missing).toHaveLength(0);
    expect(buildPlan([q], undefined, { ...config, modelId: "eleven_multilingual_v2" }, m).missing.length).toBe(p1.items.length);
  });
  it("signale une voix non configurée sans planter (devis complet)", () => {
    const p = buildPlan([miniQuest()], undefined, { ...config, voices: { narrateur: undefined, heros: "H" } }, emptyManifest());
    expect(p.problems.length).toBe(1);
    expect(p.missing.length).toBeGreaterThan(0);
  });
});

describe("configuration et client ElevenLabs", () => {
  it("lit la configuration", () => {
    const c = readConfig({ ELEVENLABS_MODEL: "eleven_flash_v2_5", ELEVENLABS_COST_PER_1K_CHARS: "0.2" } as NodeJS.ProcessEnv, false);
    expect(c.costPer1kChars).toBe(0.2);
    expect(c.outputFormat).toBe("mp3_44100_64");
    expect(readConfig({} as NodeJS.ProcessEnv, true).modelId).toBe("eleven_multilingual_v2");
    expect(supportsLanguageCode("eleven_flash_v2_5")).toBe(true);
    expect(supportsLanguageCode("eleven_multilingual_v2")).toBe(false);
  });
  it("estime la durée d'un MP3 à débit constant", () => {
    expect(bitrateKbps("mp3_44100_64")).toBe(64);
    expect(estimateDurationS(240_000, "mp3_44100_64", 0)).toBe(30);
  });
  it("réessaie sur 429 / 5xx, abandonne sur 401", async () => {
    let calls = 0;
    const flaky = (async () => {
      calls++;
      if (calls < 3) return new Response("rate limited", { status: 429, headers: { "retry-after": "0" } });
      return new Response(new Uint8Array([1, 2, 3]));
    }) as unknown as typeof fetch;
    const sleeps: number[] = [];
    const bytes = await withRetry(
      () => synthesize({ apiKey: "k", voiceId: "v", modelId: "m", text: "t", outputFormat: "mp3_44100_64" }, flaky),
      { attempts: 5, baseDelayMs: 10, sleep: async (ms) => void sleeps.push(ms) },
    );
    expect(bytes).toHaveLength(3);
    expect(sleeps).toHaveLength(2);

    const denied = (async () => new Response("invalid api key", { status: 401 })) as unknown as typeof fetch;
    await expect(
      withRetry(() => synthesize({ apiKey: "k", voiceId: "v", modelId: "m", text: "t", outputFormat: "x" }, denied), { attempts: 5, baseDelayMs: 1 }),
    ).rejects.toMatchObject({ status: 401, fatal: true });

    const quota = (async () => new Response('{"detail":{"status":"quota_exceeded"}}', { status: 429 })) as unknown as typeof fetch;
    const err = await withRetry(() => synthesize({ apiKey: "k", voiceId: "v", modelId: "m", text: "t", outputFormat: "x" }, quota), {
      attempts: 5,
      baseDelayMs: 1,
    }).catch((e: TtsError) => e);
    expect(err).toBeInstanceOf(TtsError);
    expect((err as TtsError).fatal).toBe(true);
  });
});
