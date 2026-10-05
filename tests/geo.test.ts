import { describe, expect, it } from "vitest";
import { destination, distanceToPolyline, haversine, pointInRing, ringAreaM2, roundPosition } from "@/lib/geo/geo";
import { PositionFilter, type PositionFix } from "@/lib/geo/filter";

describe("haversine", () => {
  it("donne 0 pour le même point", () => {
    expect(haversine({ lat: 48.85, lon: 2.35 }, { lat: 48.85, lon: 2.35 })).toBe(0);
  });
  it("Paris (Notre-Dame) → Tour Eiffel ≈ 4,1 km", () => {
    const d = haversine({ lat: 48.853, lon: 2.3499 }, { lat: 48.8584, lon: 2.2945 });
    expect(d).toBeGreaterThan(4000);
    expect(d).toBeLessThan(4200);
  });
  it("Paris → Marseille ≈ 661 km", () => {
    const d = haversine({ lat: 48.8566, lon: 2.3522 }, { lat: 43.2965, lon: 5.3698 });
    expect(d / 1000).toBeCloseTo(661, -1);
  });
  it("est cohérent avec destination()", () => {
    const a = { lat: 48.88, lon: 2.31 };
    for (const b of [0, 45, 90, 180, 270]) {
      expect(haversine(a, destination(a, 250, b))).toBeCloseTo(250, 3);
    }
  });
});

describe("roundPosition", () => {
  it("arrondit à ~100 m et ne déplace pas de plus de ~71 m", () => {
    const p = { lat: 48.879612, lon: 2.309173 };
    const r = roundPosition(p);
    expect(haversine(p, r)).toBeLessThan(75);
    // Deux points très proches tombent dans la même cellule.
    expect(roundPosition({ lat: 48.87962, lon: 2.30918 })).toEqual(r);
  });
});

describe("polygones", () => {
  const sq: Array<[number, number]> = [[2.3, 48.8], [2.31, 48.8], [2.31, 48.81], [2.3, 48.81], [2.3, 48.8]];
  it("point dans polygone", () => {
    expect(pointInRing({ lon: 2.305, lat: 48.805 }, sq)).toBe(true);
    expect(pointInRing({ lon: 2.315, lat: 48.805 }, sq)).toBe(false);
  });
  it("distance à une polyligne", () => {
    const d = distanceToPolyline({ lon: 2.305, lat: 48.8 + 50 / 111_000 }, [[2.3, 48.8], [2.31, 48.8]]);
    expect(d).toBeCloseTo(50, 0);
  });
  it("aire d'un carré de ~730 m × 1110 m", () => {
    expect(ringAreaM2(sq) / 1e6).toBeCloseTo(0.81, 1);
  });
});

describe("PositionFilter", () => {
  const start = { lat: 48.88, lon: 2.31 };
  const fix = (distM: number, t: number, accuracy = 5, b = 90): PositionFix => ({ ...destination(start, distM, b), accuracy, timestamp: t * 1000 });

  it("accepte une marche normale et cumule la distance", () => {
    const f = new PositionFilter();
    let total = 0;
    for (let i = 0; i <= 100; i++) {
      const r = f.push(fix(i * 1.3, i));
      if (r.accepted) total += r.deltaM;
    }
    expect(total).toBeGreaterThan(120);
    expect(total).toBeLessThan(135);
  });

  it("ignore les points imprécis (> 30 m)", () => {
    const f = new PositionFilter();
    f.push(fix(0, 0));
    const r = f.push(fix(20, 10, 45));
    expect(r.accepted).toBe(false);
    if (!r.accepted) expect(r.reason).toBe("precision");
  });

  it("ignore un saut irréaliste puis reprend normalement", () => {
    const f = new PositionFilter();
    f.push(fix(0, 0));
    const jump = f.push(fix(300, 2));
    expect(jump.accepted).toBe(false);
    if (!jump.accepted) expect(jump.reason).toBe("saut");
    const ok = f.push(fix(10, 8));
    expect(ok.accepted).toBe(true);
  });

  it("ne compte pas la dérive à l'arrêt", () => {
    const f = new PositionFilter();
    let total = 0;
    for (let i = 0; i < 120; i++) {
      // bruit de ±3 m autour du même point
      const r = f.push({ ...destination(start, (i % 3) * 1.5, (i * 137) % 360), accuracy: 8, timestamp: i * 1000 });
      if (r.accepted) total += r.deltaM;
    }
    expect(total).toBe(0);
  });

  it("se recale après plusieurs sauts cohérents (ancrage faux)", () => {
    const f = new PositionFilter();
    f.push(fix(0, 0));
    for (let i = 1; i <= 5; i++) f.push(fix(500 + i * 1.3, i));
    const r = f.push(fix(500 + 6 * 1.3 + 8, 7));
    expect(r.accepted).toBe(true);
    if (r.accepted) expect(r.deltaM).toBeLessThan(30);
  });
});
