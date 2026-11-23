// Généalogie d'une organisation et sa mise en page sur une frise datée.
// Fonctions pures (sans React ni DOM) : testées par `npm test` (genealogie.test.js).

// Liens de lignée : ceux qui font l'arbre. Les autres (passage de militants, composante, filiation
// idéologique, lien indirect) sont « secondaires » : affichés seulement si on le demande.
export const LIGNEE = new Set(["renommage", "refondation", "fusion", "scission", "absorption"]);

export const BARRE_H = 18;
export const RANG_H = 40; // une ligne pour le titre au-dessus si la barre est trop courte, puis la barre
const MARGE_G = 24;
const MARGE_H = 40; // place pour l'axe des années
const PAD = 5;
const ECART = 14; // entre deux barres d'une même rangée (couloir d'arrivée des flèches)

function ajouter(m, k, v) {
  if (!m.has(k)) m.set(k, []);
  m.get(k).push(v);
}

export function indexer(donnees) {
  const orgs = new Map(donnees.organisations.map((o) => [o.id, o]));
  const entrants = new Map();
  const sortants = new Map();
  for (const l of donnees.liens) {
    if (!orgs.has(l.a) || !orgs.has(l.b) || l.a === l.b) continue;
    ajouter(sortants, l.a, l);
    ajouter(entrants, l.b, l);
  }
  return { orgs, entrants, sortants, aujourdhui: donnees.aujourdhui, styles: donnees.styles_liens };
}

// Parcours dans le temps : en remontant, on ne suit que des événements antérieurs (ou de la même année) à celui
// par lequel on est arrivé ; en descendant, que des événements postérieurs. Sinon GU, absorbé par le PCF en
// 2015, devenait un ancêtre du PSU (1960) et des Écologistes. `sens` : -1 ancêtres, +1 descendants.
const MARGE_AN = 1;

function parcourir(depart, voisins, bout, garder, profondeur, sens) {
  const gen = new Map();
  const borne = new Map([[depart, sens < 0 ? Infinity : -Infinity]]);
  let front = [depart];
  for (let g = 1; front.length && g <= profondeur; g++) {
    const suivant = new Set();
    for (const q of front) {
      const b = borne.get(q);
      for (const l of voisins.get(q) || []) {
        const r = l[bout];
        if (!garder(l) || r === depart) continue;
        const t = l.t ?? b;
        if (sens < 0 ? t > b + MARGE_AN : t < b - MARGE_AN) continue;
        // une borne plus large (un chemin plus récent en remontant) peut ouvrir d'autres liens : on repasse
        const nouvelle = sens < 0 ? Math.min(b, t) : Math.max(b, t);
        const ancienne = borne.get(r);
        if (ancienne !== undefined && (sens < 0 ? nouvelle <= ancienne : nouvelle >= ancienne)) continue;
        borne.set(r, nouvelle);
        if (!gen.has(r)) gen.set(r, g);
        suivant.add(r);
      }
    }
    front = [...suivant];
  }
  return gen;
}

/** Ancêtres (liens entrants, de proche en proche) et descendants (liens sortants) de `id`. */
export function genealogie(index, id, { secondaires = false, profondeur = Infinity, relations = LIGNEE } = {}) {
  const garder = (l) => secondaires || relations.has(l.rel);
  const ancetres = parcourir(id, index.entrants, "a", garder, profondeur, -1);
  const descendants = parcourir(id, index.sortants, "b", garder, profondeur, +1);
  const ids = new Set([id, ...ancetres.keys(), ...descendants.keys()]);
  const liens = [];
  for (const q of ids) {
    for (const l of index.sortants.get(q) || []) {
      if (ids.has(l.b) && garder(l)) liens.push(l);
    }
  }
  return { id, ids, liens, ancetres, descendants };
}

// Une rangée : intervalles [x0, droite, id] ; deux barres gardent ECART entre elles (couloir des flèches),
// sauf la suite d'un renommage, collée à son prédécesseur (sauf = son id)
function intervalleLibre(rang, x0, droite, sauf = null) {
  return !(rang || []).some(([a, b, q]) => q !== sauf && x0 < b + ECART && droite > a - ECART);
}

/**
 * Mise en page : x = date (pxParAn), une rangée par barre, les lignées gardées ensemble.
 * `mesurer(texte)` donne la largeur d'un texte en px (canvas dans le navigateur).
 */
export function placer(index, gen, { pxParAn = 10, mesurer = (s) => s.length * 7 } = {}) {
  const fin = (o) => (o.fin != null ? o.fin : index.aujourdhui);
  const noeuds = [...gen.ids].map((q) => index.orgs.get(q));
  const tMin = Math.floor(Math.min(...noeuds.map((o) => o.debut))) - 1;
  const tMax = Math.ceil(Math.max(...noeuds.map(fin))) + 1;
  const X = (t) => MARGE_G + (t - tMin) * pxParAn;

  const boites = new Map();
  for (const o of noeuds) {
    const x0 = X(o.debut);
    const x1 = Math.max(X(fin(o)), x0 + 4);
    const dates = `${o.approx ? "vers " : ""}${o.an_debut}–${o.actif ? "" : o.an_fin || "?"}`;
    const wSigle = mesurer(o.sigle) + 2 * PAD;
    const wTout = wSigle + mesurer(dates) + 6;
    // Le nom dans la barre en priorité (sigle et dates, sinon le sigle seul) ; au-dessus en dernier recours
    const dedans = wSigle <= x1 - x0;
    const avecDates = wTout <= x1 - x0;
    const droite = dedans ? x1 : Math.max(x1, x0 + wSigle);
    boites.set(o.id, { o, x0, x1, dates, dedans, avecDates, droite });
  }

  // Ordre de placement : depuis les racines, en profondeur ; la suite d'un renommage d'abord
  const entrantsDe = new Map();
  const sortantsDe = new Map();
  for (const l of gen.liens) {
    ajouter(entrantsDe, l.b, l);
    ajouter(sortantsDe, l.a, l);
  }
  const ordreLiens = (a, b) => (a.rel === "renommage" ? 0 : 1) - (b.rel === "renommage" ? 0 : 1) || (a.t ?? 0) - (b.t ?? 0);
  const racines = noeuds.filter((o) => !entrantsDe.has(o.id)).sort((a, b) => a.debut - b.debut);
  const ordre = [];
  const parent = new Map();
  const vus = new Set();
  const visiter = (q) => {
    if (vus.has(q)) return;
    vus.add(q);
    ordre.push(q);
    for (const l of [...(sortantsDe.get(q) || [])].sort(ordreLiens)) {
      if (!vus.has(l.b) && !parent.has(l.b)) parent.set(l.b, l);
      visiter(l.b);
    }
  };
  racines.forEach((o) => visiter(o.id));
  noeuds.sort((a, b) => a.debut - b.debut).forEach((o) => visiter(o.id));

  // Rangées : près de la rangée du parent ; même rangée pour la suite d'un renommage qui le prolonge
  const rangs = new Map();
  const rangDe = new Map();
  const occuper = (r, b) => {
    if (!rangs.has(r)) rangs.set(r, []);
    rangs.get(r).push([b.x0, b.droite, b.o.id]);
  };
  for (const q of ordre) {
    const b = boites.get(q);
    const p = parent.get(q);
    let r = null;
    if (p && rangDe.has(p.a)) {
      const rp = rangDe.get(p.a);
      const bp = boites.get(p.a);
      if (p.rel === "renommage" && Math.abs(b.x0 - bp.x1) < 3 && bp.droite <= b.x0 + 0.5
          && intervalleLibre(rangs.get(rp), b.x0, b.droite, p.a)) {
        r = rp; // continuation : la barre prolonge celle de son prédécesseur
        b.suiteDe = p.a;
      } else {
        for (let k = 1; r === null && k < 400; k++) {
          for (const c of [rp + k, rp - k]) {
            if (r === null && intervalleLibre(rangs.get(c), b.x0, b.droite)) r = c;
          }
        }
      }
    } else {
      for (let c = 0; r === null; c++) if (intervalleLibre(rangs.get(c), b.x0, b.droite)) r = c;
    }
    rangDe.set(q, r);
    occuper(r, b);
  }
  const rMin = Math.min(...rangDe.values());
  const rMax = Math.max(...rangDe.values());
  for (const [q, b] of boites) {
    b.rang = rangDe.get(q) - rMin;
    b.yc = MARGE_H + b.rang * RANG_H + RANG_H - BARRE_H / 2 - 4;
  }

  // Liens : départ à la date de l'événement sur la barre source, arrivée au début de la cible
  // (flèche horizontale) ou sur son bord si l'événement tombe pendant sa vie (absorption)
  const traits = [];
  for (const l of gen.liens) {
    const A = boites.get(l.a);
    const B = boites.get(l.b);
    if (B.suiteDe === l.a && l.rel === "renommage") {
      traits.push({ l, continuation: true });
      continue;
    }
    const bas = B.yc > A.yc;
    const yA = A.yc + (bas ? BARRE_H / 2 : -BARRE_H / 2);
    const xEv = l.t != null ? X(l.t) : B.x0;
    const xs = Math.min(Math.max(xEv, A.x0 + 2), Math.max(A.x0 + 2, A.x1 - 2));
    let pts;
    let sens;
    if (A.rang === B.rang) {
      pts = [[A.x1, A.yc], [B.x0, B.yc]];
      sens = "droite";
    } else if (xs <= B.x0 - 6) {
      pts = [[xs, yA], [xs, B.yc], [B.x0, B.yc]];
      sens = "droite";
    } else {
      const xt = Math.min(Math.max(xs, B.x0 + 4), B.x1 - 2);
      const yB = B.yc + (bas ? -BARRE_H / 2 : BARRE_H / 2);
      pts = xt === xs ? [[xs, yA], [xs, yB]] : [[xs, yA], [xs, (yA + yB) / 2], [xt, (yA + yB) / 2], [xt, yB]];
      sens = bas ? "bas" : "haut";
    }
    traits.push({ l, pts, fleche: fleche(pts[pts.length - 1], sens) });
  }

  // Axe : une graduation tous les 10 ans (5 si l'échelle est large)
  const pas = pxParAn >= 14 ? 5 : pxParAn >= 4 ? 10 : 20;
  const graduations = [];
  for (let a = Math.ceil(tMin / pas) * pas; a <= tMax; a += pas) graduations.push({ an: a, x: X(a) });

  return {
    largeur: X(tMax) + MARGE_G + 60,
    hauteur: MARGE_H + (rMax - rMin + 1) * RANG_H + 16,
    boites: [...boites.values()],
    traits,
    graduations,
    X,
  };
}

function fleche([x, y], sens) {
  const L = 8;
  const l = 4;
  if (sens === "droite") return [[x, y], [x - L, y - l], [x - L, y + l]];
  if (sens === "bas") return [[x, y], [x - l, y - L], [x + l, y - L]];
  return [[x, y], [x - l, y + L], [x + l, y + L]];
}

/** Recherche par sigle ou par nom, sans accents ni casse ; les correspondances en début de mot d'abord. */
export function chercher(organisations, texte, max = 12) {
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const t = norm(texte.trim());
  if (!t) return [];
  const notes = [];
  for (const o of organisations) {
    const s = norm(o.sigle);
    const n = norm(o.nom);
    let note = null;
    if (s === t) note = 0;
    else if (s.startsWith(t)) note = 1;
    else if (n.startsWith(t)) note = 2;
    else if (n.split(/[\s'’-]+/).some((m) => m.startsWith(t))) note = 3;
    else if (n.includes(t) || s.includes(t)) note = 4;
    if (note !== null) notes.push([note + (o.dans_arbre ? 0 : 0.5), o]);
  }
  return notes.sort((a, b) => a[0] - b[0] || a[1].debut - b[1].debut).slice(0, max).map(([, o]) => o);
}

// Lignée « principale » : sans les absorptions (apport minoritaire). Avec elles, la lignée a des cycles :
// le PSC, issu du PCF, devient le PUP, absorbé par la SFIO en 1937 ; le PCF serait ancêtre de la SFIO.
const PRINCIPALE = new Set(["renommage", "refondation", "fusion", "scission"]);
// En dernier recours : passages de militants, composantes, entrisme validé (demande de l'utilisateur)
const TOUTES = new Set([...LIGNEE, "passage", "composante", "entrisme", "indirect"]);
export const MODES_COMPARAISON = {
  principale: "par la lignée (scissions, fusions, renommages)",
  absorption: "en comptant les absorptions",
  secondaires: "en comptant les passages de militants, les composantes et l'entrisme",
};

/**
 * Comparaison de deux organisations : leurs ancêtres communs les plus proches (aucun de leurs descendants
 * n'est lui-même commun) et les organisations sur les chemins qui en descendent jusqu'à `a` et `b`.
 * D'abord par la lignée principale ; avec les absorptions seulement si elle ne donne aucun ancêtre commun
 * (Les Écologistes et le PS : par le PSU, absorbé par Les Verts). Si l'une descend de l'autre, l'ancêtre
 * commun est l'autre elle-même.
 */
export function comparer(index, a, b, { secondaires = false } = {}) {
  for (const [mode, relations] of [["principale", PRINCIPALE], ["absorption", LIGNEE], ["secondaires", TOUTES]]) {
    const opt = { relations };
    const ga = genealogie(index, a, opt);
    const gb = genealogie(index, b, opt);
    const lignesA = new Set([a, ...ga.ancetres.keys()]);
    const lignesB = new Set([b, ...gb.ancetres.keys()]);
    const communs = [...lignesA].filter((q) => lignesB.has(q));
    if (!communs.length) continue;
    const desc = new Map(communs.map((q) => [q, genealogie(index, q, opt).descendants]));
    // les plus proches ; en cas de cycle (l'un descend de l'autre et inversement), on ignore la paire
    const proches = communs.filter((c) => !communs.some((d) => d !== c && desc.get(c).has(d) && !desc.get(d).has(c)));
    const ids = new Set([a, b, ...proches]);
    for (const x of [...lignesA, ...lignesB]) {
      if (proches.some((p) => desc.get(p).has(x))) ids.add(x);
    }
    const garder = (l) => (secondaires ? true : relations.has(l.rel));
    const liens = [];
    for (const q of ids) {
      for (const l of index.sortants.get(q) || []) if (ids.has(l.b) && garder(l)) liens.push(l);
    }
    return { id: a, ids, liens, ancetres: new Map(), descendants: new Map(), communs: proches, mode };
  }
  return null;
}
