// Capture d'écran pour contrôler un affichage (Chrome installé, puppeteer-core).
//   node tests/capture.mjs app <Qid|accueil|comparer/Qa/Qb> <sortie.png>    l'application (app/dist, npm run build)
//   node tests/capture.mjs arbre <Qid> <sortie.png>  l'arbre interactif, zoomé et centré sur une organisation
import puppeteer from "puppeteer-core";
import { preview } from "vite";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RACINE = path.resolve(APP, "..");
const [, , vue, q, sortie] = process.argv;
const CHROME = [process.env.CHROME, "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((p) => p && existsSync(p));

const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run"] });
const page = await navigateur.newPage();
await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1.5 });
let serveur;
if (vue === "app") {
  serveur = await preview({ root: APP, logLevel: "silent", preview: { port: 4175, strictPort: true } });
  // q : un identifiant, « accueil », ou « comparer/Q…/Q… »
  await page.goto(`${serveur.resolvedUrls.local[0]}#${q === "accueil" ? "" : q}`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".fiche h1, .accueil h2");
  await page.screenshot({ path: sortie, fullPage: q === "accueil" });
} else {
  await page.goto(`${pathToFileURL(path.join(RACINE, "arbres", "arbre.html")).href}#${q}`, { waitUntil: "load" });
  // capture de la zone autour de la barre, à l'échelle 1 du SVG
  const zone = await page.evaluate((id) => {
    const r = document.querySelector(`rect.barre[data-id="${id}"]`);
    if (!r) return null;
    r.scrollIntoView({ block: "center", inline: "center" });
    const b = r.getBoundingClientRect();
    return { x: Math.max(0, b.left - 350), y: Math.max(0, b.top - 120), width: 700 + b.width, height: 240 };
  }, q);
  if (!zone) throw new Error(`barre ${q} introuvable`);
  await page.screenshot({ path: sortie, clip: zone });
}
await navigateur.close();
if (serveur) await serveur.close();
console.log(sortie);
