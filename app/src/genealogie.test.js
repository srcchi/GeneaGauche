// Tests de la généalogie et de la mise en page, sur les vraies données (public/graphe.json).
// Lancer : npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chercher, comparer, genealogie, indexer, placer } from "./genealogie.js";

const donnees = JSON.parse(readFileSync(new URL("../public/graphe.json", import.meta.url), "utf-8"));
const index = indexer(donnees);
const id = (sigle) => donnees.organisations.find((o) => o.sigle === sigle)?.id;

test("la SFIO a la FTSF parmi ses ancêtres et le PS parmi ses descendants", () => {
  const g = genealogie(index, id("SFIO"));
  assert.ok(g.ancetres.has(id("FTSF")), "FTSF");
  assert.ok(g.descendants.has(id("PS")), "PS");
});

test("le PUP descend du PSC", () => {
  const g = genealogie(index, id("PUP"));
  assert.ok(g.ancetres.has(id("PSC (1923)")) || g.ancetres.has(id("PSC")));
});

test("la mise en page : aucune barre ne chevauche une autre sur sa rangée", () => {
  for (const sigle of ["SFIO", "PCF (1920)", "LCR (1974)", "PS", "Les Verts"]) {
    const q = id(sigle);
    if (!q) continue;
    const m = placer(index, genealogie(index, q, { secondaires: true }));
    const parRang = new Map();
    for (const b of m.boites) {
      if (!parRang.has(b.rang)) parRang.set(b.rang, []);
      parRang.get(b.rang).push(b);
    }
    for (const bs of parRang.values()) {
      bs.sort((a, b) => a.x0 - b.x0);
      for (let i = 1; i < bs.length; i++) {
        assert.ok(bs[i - 1].droite <= bs[i].x0 + 0.01, `${sigle} : ${bs[i - 1].o.sigle} chevauche ${bs[i].o.sigle}`);
      }
    }
  }
});

test("chaque trait part de sa source, va vers la droite ou verticalement, et finit sur sa cible", () => {
  const m = placer(index, genealogie(index, id("SFIO"), { secondaires: true }));
  for (const t of m.traits.filter((t) => !t.continuation)) {
    for (let i = 1; i < t.pts.length; i++) assert.ok(t.pts[i][0] >= t.pts[i - 1][0] - 1e-6, "x ne décroît pas");
    const fin = t.pts[t.pts.length - 1];
    const B = m.boites.find((b) => b.o.id === t.l.b);
    assert.ok(fin[0] >= B.x0 - 0.5 && fin[0] <= B.x1 + 0.5, `${t.l.a} -> ${t.l.b} : arrivée hors de la cible`);
  }
});

test("la recherche trouve par sigle et par nom, sans accents", () => {
  assert.equal(chercher(donnees.organisations, "lfi")[0]?.sigle, "LFI");
  assert.ok(chercher(donnees.organisations, "ecologistes").some((o) => o.sigle === "Les Écologistes"));
});

test("Les Écologistes : toute l'ascendance écologiste (Confédération écologiste, VPÉ, Les Nouveaux Démocrates)", () => {
  const g = genealogie(index, "Q613786");
  const noms = [...g.ancetres.keys()].map((q) => index.orgs.get(q).nom);
  for (const attendu of ["Les Verts", "Verts, Parti écologiste", "Les Verts – Confédération écologiste", "Les Nouveaux Démocrates", "Europe Écologie"]) {
    assert.ok(noms.includes(attendu), `${attendu} manque parmi : ${noms.join(", ")}`);
  }
});

test("ascendance dans le temps : GU (absorbé par le PCF en 2015) n'est pas un ancêtre des Écologistes", () => {
  const g = genealogie(index, "Q613786");
  assert.ok(!g.ancetres.has(id("GU")), "GU");
  assert.ok(g.ancetres.has(id("PSU (1960)")), "PSU");
});

test("descendance dans le temps : le PS descend de la SFIO, mais pas les organisations d'avant 1905", () => {
  const g = genealogie(index, id("SFIO"));
  assert.ok(g.descendants.has(id("PS")));
  assert.ok(!g.descendants.has(id("FTSF")));
});

test("comparer le PCF et le PSOP : la SFIO est leur ancêtre commun le plus proche", () => {
  const c = comparer(index, id("PCF (1920)"), id("PSOP"));
  assert.deepEqual(c.communs.map((q) => index.orgs.get(q).sigle), ["SFIO"]);
  assert.ok(c.ids.has(id("SFIO")) && c.ids.has(id("PSOP")) && c.ids.has(id("PCF (1920)")));
  assert.equal(c.mode, "principale");
});

test("comparer le PS et le PCF : le PCF est un ancêtre du PS (PSU 1960, UCRG 1966)", () => {
  const c = comparer(index, id("PS"), id("PCF (1920)"));
  assert.deepEqual(c.communs, [id("PCF (1920)")]);
  for (const s of ["PSU (1960)", "UCRG"]) assert.ok(c.ids.has(id(s)), s);
});

test("comparer la SFIO et le PS : l'un descend de l'autre", () => {
  const c = comparer(index, id("SFIO"), id("PS"));
  assert.deepEqual(c.communs, [id("SFIO")]);
});

test("ni passages de militants ni entrisme dans les frises, même avec les liens secondaires", () => {
  for (const q of [id("SFIO"), id("PS"), id("LCR (1974)")]) {
    const g = genealogie(index, q, { secondaires: true });
    assert.ok(!g.liens.some((l) => l.rel === "passage" || l.rel === "entrisme"), q);
  }
});

test("entrisme : Révolution dans le PCF (2001-2016), puis soutien à LFI", () => {
  const rev = donnees.organisations.find((o) => o.nom === "Révolution").id;
  const cas = donnees.entrismes.filter((e) => e.entriste === rev);
  assert.ok(cas.some((e) => e.hote === id("PCF (1920)") && e.nature === "entrisme" && e.debut === 2001 && e.fin === 2016));
  assert.ok(cas.some((e) => e.hote === id("LFI") && e.nature === "soutien"));
});
