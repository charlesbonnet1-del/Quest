import { describe, expect, it } from "vitest";
import { ManualClock } from "@/lib/engine/clock";
import { pickVariant, QuestEngine, type AudioSink } from "@/lib/engine/engine";
import type { PlayItem } from "@/lib/engine/types";
import type { ContextData } from "@/lib/environment/types";
import { destination } from "@/lib/geo/geo";
import { parseOverpass } from "@/lib/overpass/parse";
import { FIXTURES } from "@/lib/sim/fixtures";
import { runReplay } from "@/lib/sim/replay";
import { getRoute } from "@/lib/sim/routes";
import { miniQuest, samplePoi, sampleQuest } from "./helpers";

const START = { lat: 48.8796, lon: 2.309 };

/** Banc de test : horloge manuelle, lecteur qui vérifie qu'un seul audio joue à la fois. */
function rig(quest = miniQuest(), opts: { context?: ContextData; poi?: boolean } = {}) {
  const clock = new ManualClock(0);
  const played: PlayItem[] = [];
  let current: PlayItem | null = null;
  let overlaps = 0;
  const sink: AudioSink = {
    play(item) {
      if (current) overlaps++;
      current = item;
      played.push(item);
    },
    stop() {
      current = null;
    },
    pause() {},
    resume() {},
  };
  const engine = new QuestEngine(quest, {
    clock,
    sink,
    context: opts.context ?? null,
    poiLines: opts.poi ? samplePoi() : null,
  });
  let dist = 0;
  const api = {
    engine,
    clock,
    played,
    get overlaps() {
      return overlaps;
    },
    keys: () => played.map((p) => p.key.split("/")[1]),
    /** Termine l'audio en cours après `s` secondes. */
    finishAudio(s = 3) {
      clock.advance(s * 1000);
      const c = current;
      if (c) {
        current = null;
        engine.audioEnded(c.seq);
      }
    },
    finishAll(max = 20) {
      for (let i = 0; i < max && current; i++) api.finishAudio();
    },
    walk(m: number, seconds = m / 1.3) {
      const steps = Math.ceil(m / 10);
      for (let i = 0; i < steps; i++) {
        clock.advance((seconds / steps) * 1000);
        dist += m / steps;
        engine.onPosition({ ...destination(START, dist, 90), accuracy: 5, timestamp: clock.now() });
      }
    },
    wait(s: number) {
      clock.advance(s * 1000);
      engine.tick();
    },
    get current() {
      return current;
    },
  };
  engine.onPosition({ ...START, accuracy: 5, timestamp: 0 });
  return api;
}

describe("moteur : machine à états", () => {
  it("prêt → en cours → en pause → en cours → terminé", () => {
    const r = rig();
    expect(r.engine.state.status).toBe("pret");
    r.engine.start();
    expect(r.engine.state.status).toBe("en_cours");
    r.engine.pause();
    expect(r.engine.state.status).toBe("en_pause");
    r.engine.resume();
    expect(r.engine.state.status).toBe("en_cours");
    r.engine.finish();
    expect(r.engine.state.status).toBe("termine");
  });

  it("joue l'intro de sécurité puis l'introduction, avant tout événement", () => {
    const r = rig();
    r.engine.start();
    r.walk(150); // seuil du 1er événement dépassé pendant l'intro
    expect(r.keys()).toEqual(["secu"]);
    r.finishAll();
    expect(r.keys()).toEqual(["secu", "intro"]);
  });
});

describe("moteur : déclencheurs", () => {
  it("respecte distance ET écart minimal, dans l'ordre, sans chevauchement", () => {
    const r = rig();
    r.engine.start();
    r.finishAll(); // intros
    r.walk(90, 60);
    expect(r.keys()).not.toContain("a-def");
    r.walk(20, 10); // 110 m, écart depuis l'intro ≥ 30 s
    expect(r.keys()).toContain("a-def");
    r.finishAudio();
    // 200 m atteints vite, mais l'écart de 60 s n'est pas encore écoulé
    r.walk(100, 20);
    expect(r.keys()).not.toContain("b-def");
    r.wait(45);
    expect(r.keys()).toContain("b-def");
    expect(r.overlaps).toBe(0);
  });

  it("n'enchaîne jamais deux audios en même temps, même si plusieurs seuils sont franchis", () => {
    const r = rig();
    r.engine.start();
    r.walk(1000, 600);
    expect(r.played).toHaveLength(1);
    for (let i = 0; i < 30; i++) {
      r.finishAudio(2);
      r.wait(60);
      if (r.engine.state.challenge?.phase === "confirmation") r.engine.confirmChallenge();
    }
    expect(r.overlaps).toBe(0);
    expect(r.keys()).toEqual(["secu", "intro", "a-def", "b-def", "b-def-2", "b-bravo", "c-def", "fin"]);
    expect(r.engine.state.status).toBe("termine");
  });
});

describe("moteur : variantes", () => {
  it("pickVariant : environnement courant sinon default", () => {
    const q = miniQuest();
    const [a, b] = q.events;
    expect(pickVariant(a!, "parc").env).toBe("parc");
    expect(pickVariant(a!, "foret").env).toBe("default");
    expect(pickVariant(b!, "ville").segments[0]?.id).toBe("b-ville");
  });

  it("utilise l'environnement détecté, et la correction du parent est prioritaire", () => {
    const ctx = parseOverpass(FIXTURES["paris-parc-monceau"] as never, { center: START, radiusM: 3000, simplifyM: 3 });
    const r = rig(miniQuest(), { context: ctx });
    expect(r.engine.state.env).toBe("parc");
    r.engine.start();
    r.finishAll();
    r.walk(110, 60);
    expect(r.played.at(-1)?.key).toBe("mini/a-parc");
    r.finishAudio();
    r.engine.setEnvironment("ville");
    r.walk(100, 70);
    expect(r.played.at(-1)?.key).toBe("mini/b-ville");
  });
});

describe("moteur : défis", () => {
  it("défi d'observation : silence puis bouton parent ; pas de validation automatique", () => {
    const r = rig();
    r.engine.start();
    r.finishAll();
    r.walk(210, 200);
    r.finishAll(); // a-def
    r.wait(70);
    r.finishAll(); // b-def, b-def-2
    expect(r.engine.state.challenge?.phase).toBe("attente");
    r.engine.confirmChallenge(); // trop tôt : ignoré pendant le silence
    expect(r.engine.state.challenge?.phase).toBe("attente");
    r.wait(11);
    expect(r.engine.state.challenge?.phase).toBe("confirmation");
    r.wait(600);
    expect(r.engine.state.challenge?.phase).toBe("confirmation");
    expect(r.current).toBeNull();
    r.engine.confirmChallenge();
    expect(r.current?.key).toBe("mini/b-bravo");
  });
});

describe("moteur : pause, fatigue, répétition", () => {
  it("la distance parcourue en pause ne compte pas, et l'état est conservé", () => {
    const r = rig();
    r.engine.start();
    r.finishAll();
    r.walk(50, 40);
    const before = r.engine.state.distanceM;
    r.engine.pause("app en arrière-plan");
    r.walk(500, 400);
    expect(r.engine.state.distanceM).toBe(before);
    r.engine.resume();
    r.walk(40, 30); // le 1er point après la reprise sert de nouvel ancrage
    expect(r.engine.state.distanceM).toBeGreaterThan(before + 25);
    expect(r.engine.state.distanceM).toBeLessThan(before + 45);
  });

  it("le temps en pause ne compte pas dans les écarts", () => {
    const r = rig();
    r.engine.start();
    r.finishAll();
    const t0 = r.engine.elapsedMs();
    r.engine.pause();
    r.wait(1000);
    r.engine.resume();
    expect(r.engine.elapsedMs() - t0).toBeLessThan(1000);
  });

  it("« On est fatigués » saute à la conclusion puis termine", () => {
    const r = rig();
    r.engine.start();
    r.finishAll();
    r.walk(110, 60);
    r.engine.tired();
    expect(r.current?.key).toBe("mini/fin");
    r.finishAudio();
    expect(r.engine.state.status).toBe("termine");
    expect(r.engine.state.endReason).toBe("fatigue");
  });

  it("« Répéter » rejoue le dernier audio sans relancer le déroulé", () => {
    const r = rig();
    r.engine.start();
    r.finishAll();
    r.engine.repeat();
    expect(r.current?.key).toBe("mini/intro");
    expect(r.current?.repeat).toBe(true);
    r.finishAudio();
    expect(r.engine.state.introDone).toBe(true);
    expect(r.keys()).toEqual(["secu", "intro", "intro"]);
  });

  it("un audio manquant ne bloque pas la quête", () => {
    const r = rig();
    r.engine.start();
    const c = r.current!;
    r.engine.audioEnded(c.seq, "introuvable");
    expect(r.current?.key).toBe("mini/intro");
    expect(r.engine.state.history.some((h) => h.type === "audio_manquant")).toBe(true);
  });

  it("se restaure depuis un état sauvegardé (en pause, audio interrompu rejoué)", () => {
    const r = rig();
    r.engine.start();
    r.finishAll();
    r.walk(110, 60);
    const saved = JSON.parse(JSON.stringify(r.engine.state));
    const played: PlayItem[] = [];
    const e2 = new QuestEngine(miniQuest(), {
      clock: r.clock,
      sink: { play: (i) => played.push(i), stop() {}, pause() {}, resume() {} },
    }, saved);
    expect(e2.state.status).toBe("en_pause");
    expect(e2.state.distanceM).toBeCloseTo(r.engine.state.distanceM);
    e2.resume();
    expect(played[0]?.key).toBe("mini/a-def");
  });
});

describe("moteur : rebonds sur les lieux d'intérêt", () => {
  const ctx: ContextData = {
    version: 1,
    center: START,
    radiusM: 3000,
    fetchedAt: "",
    source: "fixture",
    areas: [],
    lines: [],
    pois: [
      { id: "n1", type: "statue", ...destination(START, 60, 90) },
      { id: "n2", type: "fontaine", ...destination(START, 90, 90) },
      { id: "n3", type: "fontaine", ...destination(START, 400, 90) },
    ],
  };

  it("se déclenche à ~30 m, une seule fois, avec un délai entre deux rebonds", () => {
    const q = miniQuest({
      events: [{ id: "a", type: "histoire", declencheur: { distanceM: 2000, ecartMinS: 0 }, variantes: { default: [{ id: "a", voix: "heros", texte: "x" }] } }],
    });
    const r = rig(q, { context: ctx, poi: true });
    r.engine.start();
    r.finishAll();
    r.wait(30);
    r.walk(40, 30); // à ~20 m de la statue
    expect(r.current?.key).toBe("poi/statue-1");
    r.finishAudio();
    r.walk(50, 40); // fontaine à ~0 m, mais délai de 3 min pas écoulé
    expect(r.current).toBeNull();
    r.walk(300, 240); // au-delà de la 2e fontaine… puis la 3e
    r.walk(15, 10);
    expect(r.keys().filter((k) => k?.startsWith("fontaine"))).toHaveLength(1);
    expect(r.engine.state.usedPois).toContain("n3");
  });

  it("jamais pendant un défi", () => {
    const poiCtx: ContextData = { ...ctx, pois: [{ id: "n1", type: "statue", ...destination(START, 230, 90) }] };
    const r = rig(miniQuest(), { context: poiCtx, poi: true });
    r.engine.start();
    r.finishAll();
    r.walk(110, 60);
    r.finishAll();
    r.wait(70);
    r.walk(100, 60); // déclenche le défi b à 210 m
    r.finishAll();
    expect(r.engine.state.challenge).not.toBeNull();
    r.walk(30, 20); // à côté de la statue pendant le défi
    expect(r.keys().some((k) => k?.startsWith("statue"))).toBe(false);
  });
});

describe("moteur : quête complète sur trajet simulé", () => {
  for (const [routeId, env] of [["parc", "parc"], ["berge", "bord_eau"], ["rue", "ville"]] as const) {
    it(`trajet ${routeId} : les 5 événements dans l'ordre, variante ${env}, puis la conclusion`, () => {
      const route = getRoute(routeId)!;
      const [lon, lat] = route.points[0]!;
      const context = parseOverpass(FIXTURES[route.fixture] as never, { center: { lat, lon }, radiusM: 3000, simplifyM: 3 });
      const quest = sampleQuest();
      const res = runReplay({ quest, poiLines: samplePoi(), context, points: route.points, tours: route.tours });
      const events = res.played.filter((p) => p.kind === "evenement");
      expect(events.map((e) => e.key.split("/")[1]?.split("-")[0])).toEqual(["e1", "e2", "e3", "e4", "e5"]);
      expect(events.every((e) => e.env === env)).toBe(true);
      // Seuils de distance respectés.
      quest.events.forEach((ev, i) => expect(events[i]!.distanceM).toBeGreaterThanOrEqual(ev.declencheur.distanceM));
      expect(res.played.at(-1)?.kind).toBe("conclusion");
      expect(res.state.status).toBe("termine");
    });
  }

  it("trajet du parc : rebondit sur une statue", () => {
    const route = getRoute("parc")!;
    const [lon, lat] = route.points[0]!;
    const context = parseOverpass(FIXTURES[route.fixture] as never, { center: { lat, lon }, radiusM: 3000, simplifyM: 3 });
    const res = runReplay({ quest: sampleQuest(), poiLines: samplePoi(), context, points: route.points, tours: route.tours });
    expect(res.played.some((p) => p.kind === "lieu" && p.key.startsWith("poi/statue"))).toBe(true);
  });
});
