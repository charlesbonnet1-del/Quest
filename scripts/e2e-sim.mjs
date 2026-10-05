/**
 * Parcours complet en mode simulation dans Chromium (Playwright), y compris hors ligne.
 * Prérequis : `pnpm build && pnpm start`, audio généré, puis :
 *   BASE_URL=http://localhost:3000 CHROMIUM_PATH=/chemin/vers/chrome node scripts/e2e-sim.mjs
 * Captures d'écran dans e2e-captures/.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
const B = process.env.BASE_URL ?? "http://localhost:3000";
mkdirSync("e2e-captures", { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const logs = [];
page.on("console", (m) => { const t = m.text(); if (t.startsWith("[Quête]")) logs.push(t); else if (m.type() === "error") console.log("CONSOLE ERR", t); });
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.goto(B + "/");
await page.screenshot({ path: "e2e-captures/1-accueil.png" });
await page.goto(B + "/jouer/braise-la-flamme-perdue?sim=1");
await page.getByRole("button", { name: /Simulation/ }).click();
await page.getByText("Données OSM de test").click();
await page.getByRole("button", { name: /Simulation/ }).click();
await page.getByRole("button", { name: "Autoriser la localisation" }).click();
await page.getByText("Dans un parc").first().waitFor({ timeout: 15000 });
await page.getByText("prêt pour le mode avion").waitFor({ timeout: 20000 });
await page.getByLabel("J'ai compris").check();
await page.screenshot({ path: "e2e-captures/2-preparation.png", fullPage: true });
await page.getByRole("button", { name: "Partir" }).click();
await page.getByText("Braise", { exact: true }).waitFor();
await page.getByRole("button", { name: /Simulation/ }).click();
await page.locator("select").selectOption("20");
await page.getByRole("button", { name: "▶ Marcher" }).click();
await page.getByRole("button", { name: /Simulation/ }).click(); // replier le panneau
let shotDone = false; const t0 = Date.now();
while (Date.now() - t0 < 240000) {
  if (await page.getByText("Bravo").count()) break;
  const done = page.getByRole("button", { name: /C.est fait/ });
  if (await done.count()) { if (!shotDone) { await page.screenshot({ path: "e2e-captures/3-quete-defi.png" }); shotDone = true; } await done.click(); }
  await page.waitForTimeout(500);
}
await page.screenshot({ path: "e2e-captures/4-fin.png", fullPage: true });
console.log("fin atteinte:", await page.getByText("Bravo").count() > 0, Math.round((Date.now()-t0)/1000), "s");
console.log(logs.join("\n"));
await page.getByRole("button", { name: "4 sur 5" }).click();
await page.getByRole("button", { name: "Oui" }).click();
await page.getByRole("button", { name: "Envoyer" }).click();
await page.getByText("Merci pour votre retour").waitFor({ timeout: 5000 });
console.log("retour envoyé");
// Hors ligne : rechargement de la page de quête
await ctx.setOffline(true);
await page.goto(B + "/jouer/braise-la-flamme-perdue?sim=1");
await page.getByText("Préparation du départ").waitFor({ timeout: 10000 });
console.log("hors ligne OK :", await page.getByText("quête déjà enregistrée").count() > 0);
await page.getByRole("button", { name: "Autoriser la localisation" }).click();
await page.getByText("Choisissez l'environnement").waitFor({ timeout: 40000 });
await page.getByText("On est plutôt").click();
await page.getByRole("button", { name: "Dans un parc" }).click();
await page.getByLabel("J'ai compris").check();
await page.screenshot({ path: "e2e-captures/5-hors-ligne.png" });
await page.getByRole("button", { name: "Partir" }).click();
await page.getByRole("button", { name: "Simulation" }).click();
await page.locator("select").selectOption("20");
await page.getByRole("button", { name: "+200 m" }).click();
await page.getByRole("button", { name: "Simulation" }).click();
await page.waitForTimeout(8000);
await page.screenshot({ path: "e2e-captures/6-quete-hors-ligne.png" });
console.log("voix de secours utilisée hors ligne :", await page.getByText("voix du téléphone").count() > 0);
console.log(logs.slice(-6).join("\n"));
await browser.close();
