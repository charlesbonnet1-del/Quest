/**
 * pnpm sim:replay [parc|berge|rue] [--live] [--speed=1.3]
 * Rejoue la première quête sur un trajet simulé et affiche la séquence d'événements.
 * Par défaut, utilise les données OSM de test (hors ligne). --live interroge Overpass.
 */
import { loadAllQuests, loadManifest, loadPoiLines } from "../lib/content/load";
import { parseOverpass } from "../lib/overpass/parse";
import { fetchContext } from "../lib/overpass/client";
import { FIXTURES } from "../lib/sim/fixtures";
import { runReplay } from "../lib/sim/replay";
import { SIM_ROUTES } from "../lib/sim/routes";
import type { ContextData } from "../lib/environment/types";
import { loadEnvFiles } from "./env";

loadEnvFiles();
const args = process.argv.slice(2);
const routeId = args.find((a) => !a.startsWith("--")) ?? "parc";
const questId = args.find((a) => a.startsWith("--quest="))?.split("=")[1];
const speed = Number(args.find((a) => a.startsWith("--speed="))?.split("=")[1] ?? 1.3);
const route = SIM_ROUTES.find((r) => r.id === routeId);
if (!route) {
  console.error(`Trajet inconnu « ${routeId} ». Disponibles : ${SIM_ROUTES.map((r) => r.id).join(", ")}`);
  process.exit(1);
}
const quests = loadAllQuests();
const quest = questId ? quests.find((q) => q.id === questId) : quests[0];
if (!quest) {
  console.error("Quête introuvable.");
  process.exit(1);
}
const [lon0, lat0] = route.points[0] as [number, number];
const center = { lat: lat0, lon: lon0 };

async function main() {
  let context: ContextData;
  if (args.includes("--live")) {
    console.log("Interrogation d'Overpass...");
    context = await fetchContext(center);
  } else {
    context = parseOverpass(FIXTURES[route!.fixture] as never, { center, radiusM: 3000, simplifyM: 3, source: "fixture" });
  }
  const manifest = loadManifest();
  const durations: Record<string, number> = {};
  for (const [key, hash] of Object.entries(manifest.segments)) {
    const f = manifest.files[hash];
    if (f) durations[key] = f.durationS;
  }
  const mmss = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
  console.log(`\nQuête « ${quest!.titre} » — trajet ${route!.nom} (${route!.tours} tour(s)), ${speed} m/s, contexte : ${context.source}\n`);
  console.log(" temps  distance  événement");
  const res = runReplay({
    quest: quest!,
    poiLines: loadPoiLines(),
    context,
    points: route!.points,
    tours: route!.tours,
    speedMps: speed,
    durations,
    onLog: (e) => console.log(` ${mmss(e.atMs)}  ${String(e.distanceM).padStart(6)} m  ${e.type.padEnd(14)} ${e.detail}`),
    onPlay: (item, at) => console.log(` ${mmss(at)}            ▶ ${item.key}${item.env ? ` [${item.env}]` : ""}`),
  });
  console.log(`\nStatut final : ${res.state.status} (${res.state.endReason}), ${Math.round(res.state.distanceM)} m en ${mmss(res.state.activeMs)}.`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
