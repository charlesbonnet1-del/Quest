/**
 * Règles éditoriales de sécurité, utilisées par `pnpm content:lint` (et testées).
 * Pure : aucune dépendance Node.
 */
import {
  ENVIRONMENTS,
  type PoiLines,
  POI_TYPES,
  type Quest,
  type Segment,
} from "./schema";

export interface LintIssue {
  level: "erreur" | "avertissement";
  where: string;
  message: string;
}

/** Retire les accents et met en minuscules pour comparer sans se soucier de l'orthographe. */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’`]/g, "'");
}

/**
 * Expressions interdites (sur texte « replié » sans accents).
 * Chaque entrée : motif + raison lisible.
 */
export const FORBIDDEN: ReadonlyArray<{ pattern: RegExp; raison: string }> = [
  { pattern: /\bescalad\w*/, raison: "escalade" },
  { pattern: /\bgrimp\w*/, raison: "grimper" },
  { pattern: /\bentr\w* dans l'eau/, raison: "entrer dans l'eau" },
  { pattern: /\b(baign|plong)\w*/, raison: "baignade / plongeon" },
  { pattern: /\btravers(e|es|er|ez|ons|ant|ee|ees)\b/, raison: "traverser" },
  { pattern: /\binconnu\w*/, raison: "inconnu" },
  { pattern: /\bquitt\w* (le|ton|ta|votre) (groupe|adulte|parent)/, raison: "quitter le groupe" },
  { pattern: /\bcour\w* (sur|dans) la (route|rue|chaussee)/, raison: "courir sur la route" },
  { pattern: /\bseul(e|s)? (loin|devant|en avant)/, raison: "s'éloigner seul" },
  // Instructions géographiques : le héros ne guide jamais vers un lieu.
  { pattern: /\b(va|vas|allez|cours|courez|file|filez) (vers|jusqu'?a|jusqu'au|la-bas)/, raison: "instruction de direction" },
  { pattern: /\b(dirige|rends|approche)[- ](toi|vous)\b/, raison: "instruction de direction" },
  { pattern: /\brejoin(s|dre|dez) /, raison: "instruction de direction" },
  { pattern: /\b(tourne|tournez) a (gauche|droite)/, raison: "instruction de direction" },
];

/** Mentions de lieu sûr exigées dans chaque variante d'un défi physique. */
export const SAFE_PLACE_MARKERS: readonly string[] = [
  "endroit sur",
  "lieu sur",
  "zone sure",
  "loin des voitures",
  "sans voiture",
  "sans circulation",
  "sur place",
];

export function findForbidden(texte: string): string[] {
  const f = fold(texte);
  return FORBIDDEN.filter((r) => r.pattern.test(f)).map((r) => r.raison);
}

export function hasSafePlaceMention(texte: string): boolean {
  const f = fold(texte);
  return SAFE_PLACE_MARKERS.some((m) => f.includes(m));
}

/** Estimation : ~14 caractères par seconde pour une voix posée en français. */
export function estimateSpeechSeconds(texte: string): number {
  return texte.length / 14;
}

function checkSegment(where: string, s: Segment, issues: LintIssue[]): void {
  for (const raison of findForbidden(s.texte)) {
    issues.push({ level: "erreur", where: `${where} (${s.id})`, message: `expression interdite : ${raison}` });
  }
}

export function lintQuest(q: Quest, file: string): LintIssue[] {
  const issues: LintIssue[] = [];
  const at = (w: string) => `${file} › ${w}`;
  checkSegment(at("introSecurite"), q.introSecurite, issues);
  checkSegment(at("introduction"), q.introduction, issues);
  checkSegment(at("conclusion"), q.conclusion, issues);
  const secu = fold(q.introSecurite.texte);
  if (!secu.includes("responsable") || !secu.includes("en vue")) {
    issues.push({
      level: "erreur",
      where: at("introSecurite"),
      message: "l'introduction de sécurité doit rappeler la responsabilité de l'adulte et de garder l'enfant en vue",
    });
  }
  for (const e of q.events) {
    if (!e.variantes.default || e.variantes.default.length === 0) {
      issues.push({ level: "erreur", where: at(e.id), message: "variante default manquante" });
    }
    const missing = ENVIRONMENTS.filter((env) => !e.variantes[env]);
    if (missing.length > 0) {
      issues.push({
        level: "avertissement",
        where: at(e.id),
        message: `pas de variante pour : ${missing.join(", ")} (repli sur default)`,
      });
    }
    for (const env of ["default", ...ENVIRONMENTS] as const) {
      const v = e.variantes[env];
      if (!v) continue;
      for (const s of v) {
        checkSegment(at(`${e.id}/${env}`), s, issues);
        const secs = estimateSpeechSeconds(s.texte);
        if (secs > 45) {
          issues.push({
            level: "avertissement",
            where: at(`${e.id}/${env} (${s.id})`),
            message: `segment long (~${Math.round(secs)} s estimées, cible 20 à 40 s)`,
          });
        }
      }
      if (e.type === "defi" && e.defi.type === "physique") {
        const texte = v.map((s) => s.texte).join(" ");
        if (!hasSafePlaceMention(texte)) {
          issues.push({
            level: "erreur",
            where: at(`${e.id}/${env}`),
            message: `défi physique sans mention de lieu sûr (ex. : ${SAFE_PLACE_MARKERS.slice(0, 3).join(", ")})`,
          });
        }
      }
    }
    if (e.type === "defi") {
      if (e.defi.bravo) checkSegment(at(`${e.id}/bravo`), e.defi.bravo, issues);
      if (e.defi.type === "observation" && !e.defi.parentConfirme) {
        issues.push({
          level: "avertissement",
          where: at(e.id),
          message: "défi d'observation sans bouton parent (parentConfirme: false)",
        });
      }
    }
  }
  return issues;
}

export function lintPoiLines(p: PoiLines, file: string): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const t of POI_TYPES) {
    for (const s of p.lignes[t]) checkSegment(`${file} › ${t}`, s, issues);
  }
  return issues;
}
