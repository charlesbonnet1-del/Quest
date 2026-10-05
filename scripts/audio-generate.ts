/**
 * pnpm audio:generate [--dry-run] [--yes] [--quality] [--only=<questId|poi>] [--force]
 *
 * - Lit tout le contenu, calcule le hash de chaque segment, ne synthétise que ce qui manque.
 * - Sans --yes : affiche le devis (segments, caractères, coût estimé) et demande confirmation.
 * - --dry-run : affiche le devis et s'arrête (aucun appel payant, aucune écriture).
 * - --quality : utilise ELEVENLABS_MODEL_QUALITY (versions montrées aux familles).
 * - Reprise : le manifeste est écrit après CHAQUE fichier ; relancer reprend où on s'est arrêté.
 */
import { rename, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { loadAllQuests, loadManifest, loadPoiLines, MANIFEST_FILE } from "../lib/content/load";
import type { AudioManifest } from "../lib/content/manifest";
import {
  contentType,
  estimateDurationS,
  fileExtension,
  readConfig,
  supportsLanguageCode,
} from "../lib/audio-gen/config";
import { synthesize, TtsError, withRetry } from "../lib/audio-gen/elevenlabs";
import { buildPlan, currentSegmentIndex, type PlanItem } from "../lib/audio-gen/plan";
import { blobStorage, localDirStorage, type AudioStorage } from "../lib/audio-gen/storage";
import { loadEnvFiles } from "./env";

loadEnvFiles();
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

const dryRun = flag("dry-run");
const config = readConfig(process.env, flag("quality"));
const quests = loadAllQuests();
const poi = loadPoiLines();
const manifest: AudioManifest = loadManifest();
const plan = buildPlan(quests, poi, config, manifest, { force: flag("force"), only: opt("only") });

const fmt = (n: number) => n.toLocaleString("fr-FR");
console.log("── Génération audio ─────────────────────────────");
console.log(`Modèle          : ${config.modelId}`);
console.log(`Voix narrateur  : ${config.voices.narrateur ?? "(non configurée)"}`);
console.log(`Voix héros      : ${config.voices.heros ?? "(non configurée)"}`);
console.log(`Format          : ${config.outputFormat}`);
console.log(`Stockage        : ${config.storage === "blob" ? "Vercel Blob" : "public/audio (local)"}`);
console.log(`Segments total  : ${plan.items.length}`);
console.log(`Déjà générés    : ${plan.items.length - plan.missing.length} (ou texte identique à un autre segment)`);
console.log(`À générer       : ${plan.missing.length}`);
console.log(`Caractères      : ${fmt(plan.totalChars)}`);
console.log(
  `Coût estimé     : ~${plan.estimatedCost.toFixed(2)} ${config.currency} (tarif ${config.costPer1kChars} / 1000 car., ELEVENLABS_COST_PER_1K_CHARS)`,
);
for (const p of plan.problems) console.log(`\x1b[33mattention\x1b[0m : ${p}`);

async function writeManifest(m: AudioManifest): Promise<void> {
  m.updatedAt = new Date().toISOString();
  const tmp = `${MANIFEST_FILE}.tmp`;
  await writeFile(tmp, `${JSON.stringify(m, null, 2)}\n`);
  await rename(tmp, MANIFEST_FILE);
}

async function main(): Promise<number> {
  if (dryRun) {
    console.log("\n--dry-run : aucun appel à l'API, rien n'est écrit.");
    return 0;
  }
  if (plan.missing.length === 0) {
    manifest.segments = currentSegmentIndex(plan.items, manifest);
    await writeManifest(manifest);
    console.log("\nRien à générer. Manifeste à jour.");
    return 0;
  }
  if (!config.apiKey) {
    console.error("\nELEVENLABS_API_KEY manquante (voir .env.example).");
    return 1;
  }
  if (plan.problems.length > 0) {
    console.error("\nConfiguration incomplète, arrêt avant tout appel payant.");
    return 1;
  }
  if (!flag("yes")) {
    if (!process.stdin.isTTY) {
      console.error("\nPas de terminal interactif : relancez avec --yes pour confirmer.");
      return 1;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question(`\nLancer la génération (~${plan.estimatedCost.toFixed(2)} ${config.currency}) ? [oui/non] `))
      .trim()
      .toLowerCase();
    rl.close();
    if (!["o", "oui", "y", "yes"].includes(answer)) {
      console.log("Annulé.");
      return 0;
    }
  }

  const storage: AudioStorage =
    config.storage === "blob"
      ? config.blobToken
        ? await blobStorage(config.blobToken)
        : (() => {
            throw new Error("AUDIO_STORAGE=blob mais BLOB_READ_WRITE_TOKEN manquant");
          })()
      : localDirStorage();
  console.log(`\nEnvoi vers : ${storage.name}`);

  let stopping = false;
  let fatal: TtsError | undefined;
  process.on("SIGINT", () => {
    if (stopping) process.exit(130);
    stopping = true;
    console.log("\nInterruption demandée : on termine les fichiers en cours puis on s'arrête (Ctrl+C à nouveau pour forcer).");
  });

  const queue = [...plan.missing];
  let done = 0;
  let failed = 0;
  // Écritures du manifeste sérialisées.
  let writing = Promise.resolve();
  const save = () => (writing = writing.then(() => writeManifest(manifest)));

  async function generate(it: PlanItem): Promise<void> {
    const apiKey = config.apiKey as string;
    const bytes = await withRetry(
      () =>
        synthesize({
          apiKey,
          voiceId: it.voiceId,
          modelId: config.modelId,
          text: it.segment.texte,
          outputFormat: config.outputFormat,
          languageCode: config.languageCode && supportsLanguageCode(config.modelId) ? config.languageCode : undefined,
          voiceSettings: config.voiceSettings,
        }),
      {
        attempts: 6,
        baseDelayMs: 2000,
        onRetry: (n, ms, e) => console.log(`  ↻ ${it.key} : ${e.message.slice(0, 80)} — nouvelle tentative ${n} dans ${Math.round(ms / 1000)} s`),
      },
    );
    const fileName = `${it.hash}.${fileExtension(config.outputFormat)}`;
    const url = await storage.put(fileName, bytes, contentType(config.outputFormat));
    manifest.files[it.hash] = {
      hash: it.hash,
      url,
      durationS: estimateDurationS(bytes.byteLength, config.outputFormat, it.segment.texte.length),
      chars: it.segment.texte.length,
      voiceId: it.voiceId,
      modelId: config.modelId,
      outputFormat: config.outputFormat,
      bytes: bytes.byteLength,
      createdAt: new Date().toISOString(),
    };
    await save();
  }

  async function worker(): Promise<void> {
    while (!stopping && !fatal) {
      const it = queue.shift();
      if (!it) return;
      try {
        await generate(it);
        done++;
        console.log(`  ✓ [${done}/${plan.missing.length}] ${it.key}`);
      } catch (e) {
        failed++;
        const err = e as TtsError;
        console.error(`  ✗ ${it.key} : ${err.message}`);
        if (err.fatal) fatal = err;
      }
    }
  }

  await Promise.all(Array.from({ length: config.concurrency }, worker));
  manifest.segments = currentSegmentIndex(plan.items, manifest);
  await save();
  await writing;

  console.log(`\n${done} généré(s), ${failed} échec(s), ${queue.length} restant(s).`);
  if (fatal) console.error(`Arrêt : erreur bloquante (${fatal.status}). Vérifiez la clé API ou le quota.`);
  if (failed > 0 || queue.length > 0) console.log("Relancez la commande pour reprendre : ce qui est déjà fait ne sera pas refait.");
  return failed > 0 || fatal ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
