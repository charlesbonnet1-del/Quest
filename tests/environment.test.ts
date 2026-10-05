import { describe, expect, it } from "vitest";
import { classify } from "@/lib/environment/classify";
import { emptyContext } from "@/lib/environment/types";
import { parseOverpass, assembleRings } from "@/lib/overpass/parse";
import { buildOverpassQuery } from "@/lib/overpass/query";
import { FIXTURES } from "@/lib/sim/fixtures";
import { getRoute } from "@/lib/sim/routes";

const ctxOf = (name: string, lat: number, lon: number) =>
  parseOverpass(FIXTURES[name] as never, { center: { lat, lon }, radiusM: 3000, simplifyM: 3, source: "fixture" });

describe("parseOverpass", () => {
  it("extrait zones, lignes, lieux d'intérêt et densité", () => {
    const c = ctxOf("paris-parc-monceau", 48.8796, 2.309);
    expect(c.areas.some((a) => a.tag === "leisure=park" && a.name === "Parc Monceau")).toBe(true);
    expect(c.pois.map((p) => p.type).sort()).toEqual(["aire_de_jeux", "plan_eau", "statue", "statue"]);
    expect(c.urban?.buildings).toBe(180);
  });
  it("assemble les relations découpées en morceaux, avec trou intérieur", () => {
    const c = ctxOf("foret-fontainebleau", 48.41, 2.68);
    const forest = c.areas.find((a) => a.cls === "foret");
    expect(forest?.outer).toHaveLength(1);
    expect(forest?.inner).toHaveLength(1);
    expect(forest?.areaM2).toBeGreaterThan(10_000_000);
  });
  it("assembleRings recolle des morceaux dans le désordre et à l'envers", () => {
    const rings = assembleRings([
      [[0, 0], [1, 0]],
      [[1, 1], [0, 1], [0, 0]],
      [[1, 1], [1, 0]],
    ]);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(5);
  });
});

describe("classify", () => {
  it("default sans données", () => {
    expect(classify({ lat: 48, lon: 2 }, emptyContext({ lat: 48, lon: 2 })).env).toBe("default");
    const vide = ctxOf("vide", 47, 1);
    expect(classify({ lat: 47, lon: 1 }, vide).env).toBe("default");
  });

  it("parc : au milieu du parc Monceau", () => {
    const c = ctxOf("paris-parc-monceau", 48.8796, 2.309);
    expect(classify({ lat: 48.8796, lon: 2.309 }, c).env).toBe("parc");
  });
  it("le petit bassin du parc ne fait pas basculer en bord d'eau", () => {
    const c = ctxOf("paris-parc-monceau", 48.8796, 2.309);
    expect(classify({ lat: 48.881, lon: 2.3104 }, c).env).toBe("parc");
  });
  it("ville : boulevard à côté du parc", () => {
    const c = ctxOf("paris-parc-monceau", 48.8796, 2.309);
    expect(classify({ lat: 48.8825, lon: 2.3100 }, c).env).toBe("ville");
  });
  it("ville : rue Montorgueil", () => {
    const c = ctxOf("paris-rue-montorgueil", 48.866, 2.347);
    expect(classify({ lat: 48.866, lon: 2.3468 }, c).env).toBe("ville");
  });
  it("bord_eau : sur la berge, tout le long du trajet", () => {
    const c = ctxOf("paris-berge-seine", 48.862, 2.315);
    const route = getRoute("berge");
    for (const [lon, lat] of route?.points ?? []) {
      expect(classify({ lat, lon }, c).env).toBe("bord_eau");
    }
  });
  it("ville : à 300 m de la Seine, dans les rues", () => {
    const c = ctxOf("paris-berge-seine", 48.862, 2.315);
    expect(classify({ lat: 48.8605, lon: 2.3150 }, c).env).toBe("ville");
  });
  it("forêt : en pleine forêt, mais pas dans la clairière", () => {
    const c = ctxOf("foret-fontainebleau", 48.41, 2.68);
    expect(classify({ lat: 48.4, lon: 2.69 }, c).env).toBe("foret");
    expect(classify({ lat: 48.409, lon: 2.6815 }, c).env).not.toBe("foret");
  });
  it("bord_eau prioritaire sur forêt près d'une mare", () => {
    const c = ctxOf("foret-fontainebleau", 48.41, 2.68);
    expect(classify({ lat: 48.4150, lon: 2.6656 }, c).env).toBe("bord_eau");
  });
  it("campagne : dans les champs, et sur un chemin entre deux champs", () => {
    const c = ctxOf("campagne-beauce", 48.31, 1.62);
    expect(classify({ lat: 48.305, lon: 1.61 }, c).env).toBe("campagne");
    expect(classify({ lat: 48.296, lon: 1.62 }, c).env).toBe("campagne");
  });
  it("ville : dans le hameau", () => {
    const c = ctxOf("campagne-beauce", 48.31, 1.62);
    expect(classify({ lat: 48.318, lon: 1.6235 }, c).env).toBe("ville");
  });
});

describe("buildOverpassQuery", () => {
  it("inclut le rayon, les familles de tags et le comptage de bâtiments", () => {
    const q = buildOverpassQuery({ lat: 48.8796, lon: 2.309 });
    expect(q).toContain("around:3000,48.87960,2.30900");
    expect(q).toContain("natural=wood");
    expect(q).toContain("out count;");
    expect(q).toContain("[!tunnel]");
  });
});
