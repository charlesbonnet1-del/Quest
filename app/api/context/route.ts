/**
 * POST /api/context { lat, lon, fixture? }
 * Reçoit une position DÉJÀ arrondie (~100 m), l'arrondit encore par sécurité, interroge
 * Overpass (rayon ~3 km) et renvoie les données de contexte simplifiées.
 * POST plutôt que GET : les coordonnées n'apparaissent pas dans l'URL ni dans les journaux
 * d'accès. Rien n'est journalisé ni stocké en dehors du cache mémoire (clé = cellule arrondie).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { roundPosition } from "@/lib/geo/geo";
import { fetchContext } from "@/lib/overpass/client";
import { parseOverpass } from "@/lib/overpass/parse";
import { FIXTURES } from "@/lib/sim/fixtures";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  /** Données OSM de test (mode simulation hors ligne). */
  fixture: z.string().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "requête invalide" }, { status: 400 });
  const center = roundPosition(parsed.data, 100);
  const headers = { "Cache-Control": "no-store" };

  if (parsed.data.fixture) {
    const fx = FIXTURES[parsed.data.fixture];
    if (!fx) return NextResponse.json({ error: "jeu de test inconnu" }, { status: 404, headers });
    return NextResponse.json(parseOverpass(fx, { center, radiusM: 3000, simplifyM: 3, source: "fixture" }), { headers });
  }

  try {
    return NextResponse.json(await fetchContext(center), { headers });
  } catch {
    // Pas de détail (ni coordonnées) dans la réponse ni dans les journaux.
    return NextResponse.json({ error: "Données de lieux indisponibles pour le moment." }, { status: 503, headers });
  }
}
