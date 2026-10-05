/**
 * pnpm content:lint
 * Vérifie tous les contenus : schéma, variante default, expressions interdites,
 * mention de lieu sûr dans les défis physiques. Code de sortie 1 en cas d'erreur.
 */
import path from "node:path";
import { loadPoiFile, loadQuestFile, POI_FILE, questFiles } from "../lib/content/load";
import { lintPoiLines, lintQuest, type LintIssue } from "../lib/content/rules";

const issues: LintIssue[] = [];
const files = questFiles();
if (files.length === 0) {
  issues.push({ level: "erreur", where: "content/quests", message: "aucune quête trouvée" });
}

const ids = new Map<string, string>();
for (const f of files) {
  const name = path.relative(process.cwd(), f);
  const r = loadQuestFile(f);
  if (!r.data) {
    issues.push({ level: "erreur", where: name, message: `schéma invalide :\n${r.error}` });
    continue;
  }
  const other = ids.get(r.data.id);
  if (other) issues.push({ level: "erreur", where: name, message: `id « ${r.data.id} » déjà utilisé par ${other}` });
  ids.set(r.data.id, name);
  issues.push(...lintQuest(r.data, name));
}

const poi = loadPoiFile(POI_FILE);
const poiName = path.relative(process.cwd(), POI_FILE);
if (!poi.data) issues.push({ level: "erreur", where: poiName, message: `schéma invalide :\n${poi.error}` });
else issues.push(...lintPoiLines(poi.data, poiName));

const errors = issues.filter((i) => i.level === "erreur");
const warnings = issues.filter((i) => i.level === "avertissement");
for (const i of [...errors, ...warnings]) {
  const tag = i.level === "erreur" ? "\x1b[31mERREUR\x1b[0m" : "\x1b[33mattention\x1b[0m";
  console.log(`${tag}  ${i.where}\n          ${i.message}`);
}
console.log(
  `\n${files.length} quête(s) + poi.json vérifiés : ${errors.length} erreur(s), ${warnings.length} avertissement(s).`,
);
process.exit(errors.length > 0 ? 1 : 0);
