// Tests de clics dans un vrai navigateur (Chrome installé, piloté par puppeteer-core) :
// l'application construite (app/dist), l'arbre interactif (arbres/arbre.html) et la page d'accueil.
// Lancer : npm run build puis npm run test:clics (variable CHROME pour un autre chemin de Chrome).
import puppeteer from "puppeteer-core";
import { preview } from "vite";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RACINE = path.resolve(APP, "..");
const CHROME = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => p && existsSync(p));
if (!CHROME) throw new Error("Chrome introuvable : donner son chemin dans la variable CHROME");
if (!existsSync(path.join(APP, "dist", "index.html"))) throw new Error("Lancer d'abord npm run build");

const resultats = [];
async function essai(nom, f) {
  try {
    await f();
    resultats.push([true, nom]);
  } catch (e) {
    resultats.push([false, `${nom} : ${e.message.split("\n")[0]}`]);
  }
}
function verifier(condition, message) {
  if (!condition) throw new Error(message);
}

const serveur = await preview({ root: APP, logLevel: "silent", preview: { port: 4174, strictPort: true } });
const base = serveur.resolvedUrls.local[0];
const navigateur = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run"] });
const page = await navigateur.newPage();
await page.setViewport({ width: 1400, height: 900 });
const erreursJs = [];
page.on("pageerror", (e) => {
  const ou = (e.stack || "").split(/\r?\n/).slice(1, 3).join(" ");
  erreursJs.push(`${page.url().split("/").slice(-2).join("/")} : ${e.message} ${ou}`);
});
const hash = () => page.evaluate(() => decodeURIComponent(location.hash));
const titreFiche = () => page.$eval(".fiche h1", (h) => h.textContent);
const attendreHash = (attendu) =>
  page.waitForFunction((h) => decodeURIComponent(location.hash) === h, { timeout: 5000 }, attendu);

// ---------- Application ----------
await essai("une adresse #Q ouvre la fiche (PS)", async () => {
  await page.goto(`${base}#Q170972`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".fiche h1");
  verifier((await titreFiche()).includes("Parti socialiste"), `titre : ${await titreFiche()}`);
  verifier((await page.$$("g.barre")).length > 5, "la frise n'a pas de barres");
});

await essai("recherche « lfi » puis Entrée", async () => {
  await page.type("input[type=search]", "lfi");
  await page.waitForSelector(".suggestions li");
  await page.keyboard.press("Enter");
  await attendreHash("#Q27978402");
  await page.waitForFunction(() => document.querySelector(".fiche h1")?.textContent.includes("insoumise"));
});

await essai("recherche sans accents, choix à la souris (« ecologistes »)", async () => {
  await page.type("input[type=search]", "ecologistes");
  await page.waitForSelector(".suggestions li");
  const li = await page.$$(".suggestions li");
  const textes = await Promise.all(li.map((x) => x.evaluate((e) => e.textContent)));
  const i = textes.findIndex((t) => t.startsWith("Les Écologistes"));
  verifier(i >= 0, `suggestions : ${textes.join(" | ")}`);
  await li[i].click();
  await page.waitForFunction(() => document.querySelector(".fiche h1")?.textContent.includes("cologistes"));
});

await essai("clic sur une barre de la frise : sa généalogie et sa fiche", async () => {
  await page.goto(`${base}#Q1332068`, { waitUntil: "networkidle0" }); // SFIO
  await page.waitForSelector("g.barre.choisie");
  const cible = await page.evaluateHandle(() =>
    [...document.querySelectorAll("g.barre")].find((g) => g.getAttribute("aria-label").startsWith("Parti d'unité prolétarienne")));
  verifier(cible.asElement(), "barre du PUP introuvable");
  await cible.asElement().click();
  await page.waitForFunction(() => document.querySelector(".fiche h1")?.textContent === "Parti d'unité prolétarienne");
  verifier(/^#Q/.test(await hash()), `adresse : ${await hash()}`);
  const choisie = await page.$eval("g.barre.choisie", (g) => g.getAttribute("aria-label"));
  verifier(choisie.startsWith("Parti d'unité prolétarienne"), `barre choisie : ${choisie}`);
});

await essai("clic sur une organisation citée dans la fiche", async () => {
  const lien = await page.$(".fiche .lien-org");
  verifier(lien, "aucune organisation cliquable dans la fiche");
  const nom = await lien.evaluate((e) => e.title);
  await lien.click();
  await page.waitForFunction((n) => document.querySelector(".fiche h1")?.textContent === n, { timeout: 5000 }, nom);
});

await essai("liens secondaires : la case met « +secondaires » dans l'adresse", async () => {
  const avant = await hash();
  await page.click(".reglages input[type=checkbox]");
  await attendreHash(`${avant}+secondaires`);
  await page.waitForFunction(() => document.querySelector(".reglages input[type=checkbox]").checked, { timeout: 5000 });
});

await essai("générations : 1 ne montre que les voisins directs", async () => {
  await page.goto(`${base}#Q1332068`, { waitUntil: "networkidle0" });
  await page.waitForSelector("g.barre");
  const toutes = (await page.$$("g.barre")).length;
  await page.select(".reglages select", "1");
  await page.waitForFunction((n) => document.querySelectorAll("g.barre").length < n, { timeout: 5000 }, toutes);
  const une = (await page.$$("g.barre")).length;
  verifier(une > 1 && une < toutes, `${une} barres (toutes : ${toutes})`);
  await page.select(".reglages select", "Infinity");
});

await essai("note [n] d'une phrase : la source correspondante existe", async () => {
  const note = await page.$(".fiche sup a");
  verifier(note, "aucune note");
  const n = await note.evaluate((a) => a.textContent);
  await note.click();
  verifier(await page.$(`#source-${n}`), `source ${n} absente`);
});

await essai("Ensemble ! : mise en garde contre la coalition macroniste", async () => {
  await page.goto(`${base}#Q15985232`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".fiche h1");
  const texte = await page.$eval(".fiche", (f) => f.textContent);
  verifier(texte.includes("Ensemble !"), "sigle « Ensemble ! » absent");
  verifier(texte.includes("À ne pas confondre avec Ensemble pour la République"), "mise en garde absente");
  verifier(texte.includes("gauche radicale"), "positionnement absent");
});

await essai("URC (identifiant manuel « fr:… ») : le dégradé de la barre active est bien référencé", async () => {
  await page.goto(`${base}#${encodeURIComponent("fr:Union pour la reconstruction communiste")}`, { waitUntil: "networkidle0" });
  await page.waitForSelector("g.barre.choisie");
  const ok = await page.$eval("g.barre.choisie", (g) => {
    const r = [...g.querySelectorAll("rect")].find((x) => (x.getAttribute("fill") || "").startsWith("url("));
    if (!r) return "pas de dégradé";
    const id = r.getAttribute("fill").slice(5, -1);
    return document.getElementById(id) ? "ok" : `dégradé ${id} introuvable`;
  });
  verifier(ok === "ok", ok);
});

await essai("accueil : un parcours ouvre sa généalogie (« Le communisme depuis Tours »)", async () => {
  await page.goto(base, { waitUntil: "networkidle0" });
  const carte = await page.evaluateHandle(() =>
    [...document.querySelectorAll(".carte")].find((c) => c.textContent.includes("Le communisme depuis Tours")));
  verifier(carte.asElement(), "carte absente");
  await carte.asElement().click();
  await page.waitForFunction(() => document.querySelector(".fiche h1")?.textContent.includes("communiste"));
});

await essai("accueil : comparer deux organisations choisies au clavier (PCF et PSOP : la SFIO)", async () => {
  await page.goto(base, { waitUntil: "networkidle0" });
  const champs = await page.$$(".choix-comparer input[type=search]");
  await champs[0].type("PCF (1920)");
  await page.waitForSelector(".choix-comparer .suggestions li");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelectorAll(".choix-comparer .choisie-puce").length === 1);
  await (await page.$(".choix-comparer input[type=search]")).type("PSOP");
  await page.waitForSelector(".choix-comparer .suggestions li");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => !document.querySelector(".bouton-comparer").disabled);
  await page.click(".bouton-comparer");
  await page.waitForFunction(() => document.querySelector(".fiche h1")?.textContent === "Comparaison");
  const texte = await page.$eval(".fiche", (f) => f.textContent);
  verifier(texte.includes("SFIO"), `résumé : ${texte.slice(0, 120)}`);
  verifier(await page.$("g.barre.commune"), "ancêtre commun non cerclé");
});

await essai("comparaison : un exemple de l'accueil, puis « Inverser »", async () => {
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.click(".exemples-comparer a");
  await page.waitForFunction(() => document.querySelector(".fiche h1")?.textContent === "Comparaison");
  const avant = await hash();
  await page.click(".choix-comparer .ajuster");
  await page.waitForFunction((h) => decodeURIComponent(location.hash) !== h, {}, avant);
  const [, a1, b1] = avant.split("/");
  verifier((await hash()) === `#comparer/${b1}/${a1}`, `adresse : ${await hash()}`);
});

await essai("fiche : « Comparer avec une autre organisation » garde la première", async () => {
  await page.goto(`${base}#Q170972`, { waitUntil: "networkidle0" });
  await page.click(".vers-comparer a");
  await page.waitForSelector(".choix-comparer .choisie-puce");
  verifier((await hash()) === "#comparer/Q170972/", `adresse : ${await hash()}`);
});

await essai("accueil : une organisation active, puis « au hasard »", async () => {
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.click(".puces button");
  await page.waitForSelector(".fiche h1");
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.click(".lien-bouton");
  await page.waitForSelector(".fiche h1");
});

await essai("scénario Entrisme : depuis l'accueil, Révolution dans le PCF, clic vers la fiche du parti visé", async () => {
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.click('a[href="#entrisme"]');
  await page.waitForFunction(() => document.querySelector(".fiche h1")?.textContent === "Les cas documentés");
  const liste = await page.$eval(".fiche", (f) => f.textContent);
  verifier(liste.includes("Révolution") && liste.includes("2001–2016"), "Révolution dans le PCF absente");
  await page.click(".cas-entrisme rect");
  await page.waitForFunction(() => /^#Q|^#fr/.test(location.hash) && document.querySelector(".fiche h1")?.textContent !== "Les cas documentés");
});

await essai("organisation inconnue : message, pas de page blanche", async () => {
  await page.goto(`${base}#Q000`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".accueil");
  verifier((await page.$eval(".accueil", (a) => a.textContent)).includes("introuvable"), "message absent");
});

await essai("accueil de l'application : une carte de parcours cliquable", async () => {
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.click(".carte");
  await page.waitForSelector(".fiche h1");
});

// ---------- Arbre interactif ----------
await essai("arbre : un clic sur le PS épingle sa fiche, avec le lien vers l'application", async () => {
  await page.goto(pathToFileURL(path.join(RACINE, "arbres", "arbre.html")).href, { waitUntil: "load" });
  const cible = await page.evaluateHandle(() =>
    [...document.querySelectorAll("[data-info]")].find((x) => x.dataset.id === "Q170972")
    || document.querySelector('rect.barre[data-id="Q170972"]'));
  verifier(cible.asElement(), "barre du PS introuvable");
  await cible.asElement().click();
  await page.waitForSelector("#bulle.epinglee .vers-appli a", { timeout: 5000 });
  const href = await page.$eval("#bulle .vers-appli a", (a) => a.getAttribute("href"));
  verifier(href === "../app/#Q170972", `lien : ${href}`);
});

await essai("arbre : lien « Généalogie par organisation » dans l'en-tête", async () => {
  verifier(await page.$('header a[href="../app/"]'), "lien absent");
});

// ---------- Page d'accueil ----------
await essai("accueil du site : bouton vers l'application", async () => {
  await page.goto(pathToFileURL(path.join(RACINE, "site", "index.html")).href, { waitUntil: "load" });
  verifier(await page.$('a.bouton[href="app/"]'), "bouton absent");
});

await essai("aucune erreur JavaScript", async () => {
  verifier(erreursJs.length === 0, erreursJs.join(" ; "));
});

await navigateur.close();
await serveur.close();
for (const [ok, nom] of resultats) console.log(`${ok ? "OK    " : "ÉCHEC "} ${nom}`);
const echecs = resultats.filter(([ok]) => !ok).length;
console.log(echecs ? `${echecs} échec(s) sur ${resultats.length}` : `Les ${resultats.length} tests de clics passent.`);
process.exit(echecs ? 1 : 0);
