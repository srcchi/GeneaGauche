import React, { useEffect, useMemo, useRef, useState } from "react";
import { BARRE_H, MODES_COMPARAISON, chercher, comparer, genealogie, indexer, placer } from "./genealogie.js";

const DEPOT = "https://github.com/srcchi/GeneaGauche";
const SIGNALER = `${DEPOT}/issues/new?template=erreur.yml`;
// Parcours guidés de l'accueil : une organisation (par son sigle) et les réglages de sa frise
const PARCOURS = [
  { sigle: "PS", titre: "La famille socialiste", texte: "Des premiers partis socialistes à la SFIO, puis au PS et à ses scissions." },
  { sigle: "PCF (1920)", titre: "Le communisme depuis Tours", texte: "La scission de 1920 et tout ce qui en descend." },
  { sigle: "Les Écologistes", titre: "L'écologie politique", texte: "Des fédérations des années 1970 aux Écologistes d'aujourd'hui." },
  { sigle: "LCR (1974)", titre: "Les trotskystes, de la LCR au NPA", texte: "La lignée de la Quatrième Internationale (Secrétariat unifié)." },
  { sigle: "OCI", titre: "Le courant lambertiste", texte: "De l'OCI au POI et au POID." },
  { sigle: "LFI", titre: "La France insoumise et ses composantes", texte: "Avec les liens secondaires : organisations membres et passages.", secondaires: true },
  { sigle: "MCFml", titre: "Les maoïstes", texte: "Le MCF(ml), le PCMLF et leurs héritiers." },
  { sigle: "FA", titre: "Les anarchistes et libertaires", texte: "La Fédération anarchiste et sa lignée." },
];
// Comparaisons proposées : deux organisations (par leur sigle)
const COMPARAISONS = [["LFI", "PS"], ["PCF (1920)", "PSOP"], ["Les Écologistes", "PS"], ["LO", "PS"], ["NPA (2009)", "LO"]];

// Adresses partageables : #Q170972 (et « +secondaires ») ; #comparer/Q…/Q…
function lireAdresse() {
  const h = decodeURIComponent(window.location.hash.replace(/^#/, ""));
  if (h === "entrisme") return { mode: "entrisme", secondaires: false };
  if (h.startsWith("comparer/")) {
    const [, a, b] = h.split("/");
    return { mode: "comparer", a: a || null, b: b || null, secondaires: false };
  }
  const [id, opt] = h.split("+");
  return { mode: id ? "org" : "accueil", id: id || null, secondaires: opt === "secondaires" };
}
const adresseComparer = (a, b) => `comparer/${a || ""}/${b || ""}`;

let canvas;
function mesurer(texte, taille = 12, gras = true) {
  canvas = canvas || document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = `${gras ? "bold " : ""}${taille}px Arial, Helvetica, sans-serif`;
  return ctx.measureText(texte).width;
}

function texteSur(fond) {
  const c = fond.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const lin = (x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.4 ? "#1A1A1A" : "#FFFFFF";
}

export default function App() {
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [adresse, setAdresse] = useState(lireAdresse);
  const [pxParAn, setPxParAn] = useState(null); // null : ajustée à la largeur de la vue
  const [profondeur, setProfondeur] = useState(Infinity);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}graphe.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setDonnees)
      .catch((e) => setErreur(String(e)));
    const suivre = () => setAdresse(lireAdresse());
    window.addEventListener("hashchange", suivre);
    return () => window.removeEventListener("hashchange", suivre);
  }, []);

  const index = useMemo(() => (donnees ? indexer(donnees) : null), [donnees]);
  const aller = (id, secondaires = adresse.secondaires) => {
    window.location.hash = id ? `${id}${secondaires ? "+secondaires" : ""}` : "";
  };

  if (erreur) return <p className="message">Impossible de charger les données ({erreur}).</p>;
  if (!index) return <p className="message">Chargement…</p>;
  const choisie = adresse.id && index.orgs.get(adresse.id);

  return (
    <div className="appli">
      <header>
        <a className="titre" href="../index.html">Généalogie de la gauche française</a>
        <Recherche organisations={donnees.organisations} onChoisir={(o) => aller(o.id)} />
        <nav>
          <a href="../arbres/arbre.html">Arbre complet</a>
          <a href={SIGNALER} target="_blank" rel="noopener">Signaler une erreur</a>
        </nav>
      </header>
      {adresse.mode === "entrisme" ? (
        <Entrisme index={index} donnees={donnees} aller={aller} />
      ) : adresse.mode === "comparer" ? (
        <Comparaison index={index} donnees={donnees} a={adresse.a} b={adresse.b} aller={aller} />
      ) : choisie ? (
        <main>
          <section className="frise">
            <div className="reglages">
              <label>
                <input type="checkbox" checked={adresse.secondaires}
                  onChange={(e) => aller(choisie.id, e.target.checked)} />
                Liens secondaires (composantes, filiations)
              </label>
              <label>
                Générations
                <select value={String(profondeur)} onChange={(e) => setProfondeur(Number(e.target.value))}>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="Infinity">toutes</option>
                </select>
              </label>
              <label>
                Échelle
                <input type="range" min="3" max="30" value={pxParAn || 10}
                  onChange={(e) => setPxParAn(Number(e.target.value))} />
                {pxParAn && <button className="ajuster" onClick={() => setPxParAn(null)}>Ajuster</button>}
              </label>
            </div>
            <Frise index={index} id={choisie.id} secondaires={adresse.secondaires} profondeur={profondeur}
              pxParAn={pxParAn} aller={aller} />
            <Legende styles={index.styles} />
          </section>
          <Fiche o={choisie} index={index} donnees={donnees} aller={aller} />
        </main>
      ) : (
        <Accueil index={index} donnees={donnees} aller={aller} inconnue={adresse.id} />
      )}
      <footer>
        Données : citations de <a href="https://fr.wikipedia.org/">Wikipédia</a> (licence{" "}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr">CC BY-SA 4.0</a>, chaque citation renvoie à
        son article) et <a href="https://www.wikidata.org/">Wikidata</a> (CC0). Données du {donnees.genere_le}.{" "}
        <a href={DEPOT}>Méthode, code et données</a>.
      </footer>
    </div>
  );
}

// Scénario « Entrisme » : pour chaque organisation entriste, vers quels partis et à quels moments
// (data/manuel/entrisme.csv validé à la main, scripts/export.py). Un soutien sans entrisme (Révolution et La
// France insoumise depuis 2016) est dessiné avec un contour en tirets.
function Entrisme({ index, donnees, aller }) {
  const conteneur = useRef(null);
  const [largeur, setLargeur] = useState(1000);
  useEffect(() => {
    const c = conteneur.current;
    if (!c || typeof ResizeObserver === "undefined") return undefined;
    const obs = new ResizeObserver(() => setLargeur(c.clientWidth));
    obs.observe(c);
    return () => obs.disconnect();
  }, []);
  const cas = donnees.entrismes || [];
  const groupes = [];
  for (const e of cas) {
    let g = groupes.find((x) => x.id === e.entriste);
    if (!g) {
      g = { id: e.entriste, o: index.orgs.get(e.entriste), cas: [] };
      groupes.push(g);
    }
    g.cas.push(e);
  }
  groupes.sort((a, b) => a.o.debut - b.o.debut);
  const fin = (o) => (o.fin != null ? o.fin : index.aujourdhui);
  const t0 = Math.floor(Math.min(...groupes.map((g) => g.o.debut)) / 10) * 10;
  const t1 = Math.ceil(index.aujourdhui);
  const G = 170; // colonne des noms
  const X = (t) => G + ((t - t0) / (t1 - t0)) * (largeur - G - 30);
  const H_ORG = 14;
  const H_CAS = 22;
  let y = 34;
  const rangs = groupes.map((g) => {
    const dates = g.cas.filter((e) => e.debut != null);
    const sans = g.cas.filter((e) => e.debut == null);
    const r = { g, y, dates, sans };
    y += H_ORG + 8 + (dates.length + sans.length) * H_CAS + 18;
    return r;
  });
  const hauteur = y;
  const annees = [];
  for (let a = t0; a <= t1; a += 10) annees.push(a);
  const [survol, setSurvol] = useState(null);
  const verbe = (e) => (e.nature === "soutien" ? "soutien à" : "dans");
  const court = (q) => index.orgs.get(q).sigle.replace(/ \(\d{4}\)$/, ""); // « PCF (1920) (1930) » : une seule date
  const periode = (e) => (e.debut == null ? "date inconnue"
    : e.fin != null ? `${e.debut}–${e.fin}` : e.nature === "soutien" ? `depuis ${e.debut}` : `${e.debut}`);
  return (
    <main className="vue-entrisme">
      <section className="frise">
        <h1 className="titre-vue">L'entrisme</h1>
        <p className="resume">
          Des militants d'une organisation entrent, de façon concertée, dans une autre pour en infléchir l'orientation.
          Chaque ligne montre vers quel parti, à quel moment ; un contour en tirets marque un soutien sans entrisme.
          Survolez un segment pour sa citation, cliquez pour la fiche.
        </p>
        <div className="cadre-frise">
          <div className="defilement entrisme" ref={conteneur} onMouseLeave={() => setSurvol(null)}>
            <svg width={largeur} height={hauteur} role="img" aria-label="Entrisme, par organisation et dans le temps">
              {annees.map((a) => (
                <g key={a}>
                  <line x1={X(a)} x2={X(a)} y1={24} y2={hauteur} className="graduation" />
                  <text x={X(a)} y={16} className="annee">{a}</text>
                </g>
              ))}
              {rangs.map(({ g, y: yg, dates, sans }) => (
                <g key={g.id}>
                  <text x={8} y={yg + 11} className="nom-entriste" onClick={() => aller(g.id)}>{g.o.sigle}</text>
                  <rect x={X(g.o.debut)} y={yg} width={Math.max(3, X(fin(g.o)) - X(g.o.debut))} height={H_ORG} rx="3"
                    fill={g.o.couleur} className="org-entriste" onClick={() => aller(g.id)}>
                    <title>{`${g.o.nom} (${g.o.an_debut}–${g.o.actif ? "" : g.o.an_fin || "?"})`}</title>
                  </rect>
                  {dates.map((e, i) => {
                    const h = index.orgs.get(e.hote);
                    const xa = X(e.debut);
                    const xb = X(e.fin != null ? e.fin : e.nature === "soutien" ? index.aujourdhui : e.debut + 1);
                    const yc = yg + H_ORG + 8 + i * H_CAS;
                    const texte = `${verbe(e)} ${court(e.hote)} (${periode(e)})`;
                    // l'étiquette à droite du segment, ou à gauche s'il n'y a plus la place
                    const aGauche = Math.max(xa, xb) + 6 + texte.length * 6.6 > largeur - 4;
                    return (
                      <g key={i} className="cas-entrisme" onClick={() => aller(e.hote)}
                        onMouseMove={(ev) => {
                          const c = conteneur.current.getBoundingClientRect();
                          setSurvol({ e, x: ev.clientX - c.left, y: ev.clientY - c.top, w: c.width });
                        }}>
                        <line x1={xa} x2={xa} y1={yg + H_ORG} y2={yc + 7} stroke={g.o.couleur} strokeWidth="1.5" />
                        <rect x={xa} y={yc} width={Math.max(6, xb - xa)} height={14} rx="3" fill={h.couleur}
                          fillOpacity={e.nature === "soutien" ? 0.35 : 1} stroke={e.nature === "soutien" ? h.couleur : "none"}
                          strokeWidth="1.5" strokeDasharray={e.nature === "soutien" ? "4 2" : undefined} />
                        <text x={aGauche ? xa - 6 : Math.max(xa, xb) + 6} y={yc + 11} className="etiquette-cas"
                          textAnchor={aGauche ? "end" : "start"}>{texte}</text>
                      </g>
                    );
                  })}
                  {sans.map((e, i) => (
                    <text key={`s${i}`} x={X(g.o.debut)} y={yg + H_ORG + 8 + (dates.length + i) * H_CAS + 11}
                      className="etiquette-cas sans-date" onClick={() => aller(e.hote)}>
                      {`${verbe(e)} ${court(e.hote)} (date inconnue)`}
                      <title>{e.citation}</title>
                    </text>
                  ))}
                </g>
              ))}
            </svg>
          </div>
          {survol && (
            <div className="survol" style={{ left: Math.max(4, survol.x + 300 > survol.w ? survol.x - 300 : survol.x + 16), top: survol.y + 18 }}>
              <strong>
                {index.orgs.get(survol.e.entriste).sigle} {verbe(survol.e)} {index.orgs.get(survol.e.hote).sigle}
              </strong>
              <span className="survol-dates">{periode(survol.e)}</span>
              <q>{survol.e.citation}</q>
              <span className="survol-source">{survol.e.source}</span>
            </div>
          )}
        </div>
      </section>
      <aside className="fiche">
        <h1>Les cas documentés</h1>
        <ol className="sources">
          {rangs.flatMap(({ g }) => g.cas).map((e, i) => {
            const o = index.orgs.get(e.entriste);
            const h = index.orgs.get(e.hote);
            return (
              <li key={i}>
                <button className="lien-org" onClick={() => aller(o.id)} title={o.nom}>{o.sigle}</button>{" "}
                {verbe(e)}{" "}
                <button className="lien-org" onClick={() => aller(h.id)} title={h.nom}>{h.sigle}</button>{" "}
                ({periode(e)}) : <q>{e.citation}</q>{" "}
                {e.url ? <a href={e.url} target="_blank" rel="noopener">{e.source}</a> : <span>{e.source}</span>}
              </li>
            );
          })}
        </ol>
        <p className="signaler">
          Chaque cas a été validé à la main ; les sources le disent rarement de façon explicite. Un cas manque ou est
          faux ? <a href={SIGNALER} target="_blank" rel="noopener">Signalez-le</a>, avec sa source.
        </p>
      </aside>
    </main>
  );
}

function parSigle(donnees, sigle) {
  return donnees.organisations.find((o) => o.sigle === sigle) || null;
}

function Accueil({ index, donnees, aller, inconnue }) {
  const parcours = PARCOURS.map((p) => ({ ...p, o: parSigle(donnees, p.sigle) })).filter((p) => p.o);
  const comparaisons = COMPARAISONS.map(([x, y]) => [parSigle(donnees, x), parSigle(donnees, y)])
    .filter(([x, y]) => x && y);
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  // organisations actives, par famille, dans l'ordre des familles de l'arbre
  const actives = Object.entries(donnees.familles).map(([cle, f]) => ({
    cle, ...f,
    orgs: donnees.organisations.filter((o) => o.actif && o.famille === cle)
      .sort((x, y) => x.sigle.localeCompare(y.sigle, "fr")),
  })).filter((f) => f.orgs.length);
  const reliees = donnees.organisations.filter((o) => index.entrants.has(o.id) || index.sortants.has(o.id));
  const hasard = () => aller(reliees[Math.floor(Math.random() * reliees.length)].id);
  const resume = (o, secondaires) => {
    const g = genealogie(index, o.id, { secondaires });
    return `${g.ancetres.size} ancêtre${g.ancetres.size > 1 ? "s" : ""}, ${g.descendants.size} descendant${g.descendants.size > 1 ? "s" : ""}`;
  };
  return (
    <div className="accueil">
      {inconnue && <p className="message">Organisation introuvable : {inconnue}.</p>}
      <p className="intro">
        Cherchez une organisation par son nom ou son sigle : sa généalogie s'affiche sur une frise, avec ses ancêtres
        et ses descendants, y compris les petites organisations absentes de l'arbre complet. Sa fiche donne chaque
        fait avec la citation qui le justifie.{" "}
        <button className="lien-bouton" onClick={hasard}>Une organisation au hasard</button>
      </p>

      <section>
        <h2>Parcours</h2>
        <ul className="cartes">
          {parcours.map((p) => (
            <li key={p.sigle}>
              <button className="carte" style={{ "--teinte": p.o.couleur }} onClick={() => aller(p.o.id, !!p.secondaires)}>
                <span className="carte-titre">{p.titre}</span>
                <span className="carte-texte">{p.texte}</span>
                <span className="carte-pied"><strong>{p.o.sigle}</strong> · {resume(p.o, !!p.secondaires)}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {donnees.entrismes?.length > 0 && (
        <section>
          <h2>L'entrisme</h2>
          <p>
            Des militants d'une organisation qui entrent, de façon concertée, dans une autre : vers quels partis, à quels
            moments. <a href="#entrisme">Voir les {donnees.entrismes.length} cas documentés →</a>
          </p>
        </section>
      )}

      <section>
        <h2>Comparer deux organisations</h2>
        <p>Leurs ancêtres communs les plus proches, et les chemins qui y mènent.</p>
        <div className="choix-comparer">
          <ChoixOrganisation organisations={donnees.organisations} o={a} onChoisir={setA} etiquette="Première organisation" />
          <span className="et">et</span>
          <ChoixOrganisation organisations={donnees.organisations} o={b} onChoisir={setB} etiquette="Seconde organisation" />
          <button className="bouton-comparer" disabled={!a || !b}
            onClick={() => { window.location.hash = adresseComparer(a.id, b.id); }}>Comparer</button>
        </div>
        <p className="exemples-comparer">
          Par exemple :{" "}
          {comparaisons.map(([x, y], i) => (
            <React.Fragment key={i}>
              {i > 0 && " · "}
              <a href={`#${adresseComparer(x.id, y.id)}`}>{x.sigle} et {y.sigle}</a>
            </React.Fragment>
          ))}
        </p>
      </section>

      <section>
        <h2>Les organisations actives aujourd'hui</h2>
        {actives.map((f) => (
          <div key={f.cle} className="famille">
            <h3><span className="pastille" style={{ background: f.couleur }} /> {f.nom}</h3>
            <ul className="puces">
              {f.orgs.map((o) => (
                <li key={o.id}>
                  <button style={{ background: o.couleur, color: texteSur(o.couleur) }} title={o.nom}
                    onClick={() => aller(o.id)}>
                    {o.sigle}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}

// Choix d'une organisation dans un formulaire (comparaison) : recherche, puis l'organisation choisie
function ChoixOrganisation({ organisations, o, onChoisir, etiquette }) {
  if (o) {
    return (
      <span className="choisie-puce" style={{ background: o.couleur, color: texteSur(o.couleur) }}>
        {o.sigle}
        <button aria-label={`Changer : ${etiquette}`} onClick={() => onChoisir(null)}>×</button>
      </span>
    );
  }
  return <Recherche organisations={organisations} onChoisir={onChoisir} placeholder={etiquette} />;
}

function Comparaison({ index, donnees, a, b, aller }) {
  const oa = a ? index.orgs.get(a) : null;
  const ob = b ? index.orgs.get(b) : null;
  const c = useMemo(() => (oa && ob ? comparer(index, a, b) : null), [index, a, b, oa, ob]);
  const changer = (cote) => (o) => {
    window.location.hash = adresseComparer(cote === "a" ? o?.id : a, cote === "b" ? o?.id : b);
  };
  const lien = (q) => {
    const o = index.orgs.get(q);
    return <button key={q} className="lien-org" title={o.nom} onClick={() => aller(o.id)}>{o.sigle}</button>;
  };
  const liste = (qs) => qs.map((q, i) => (
    <React.Fragment key={q}>{i > 0 && (i === qs.length - 1 ? " et " : ", ")}{lien(q)}</React.Fragment>
  ));
  const choisies = useMemo(() => new Set([a, b]), [a, b]);
  const communs = useMemo(() => new Set(c ? c.communs : []), [c]);
  const pluriel = c && c.communs.length > 1 ? "s" : "";
  return (
    <main>
      <section className="frise">
        <div className="choix-comparer">
          <ChoixOrganisation organisations={donnees.organisations} o={oa} onChoisir={changer("a")}
            etiquette="Première organisation" />
          <span className="et">et</span>
          <ChoixOrganisation organisations={donnees.organisations} o={ob} onChoisir={changer("b")}
            etiquette="Seconde organisation" />
          {oa && ob && (
            <button className="ajuster" onClick={() => { window.location.hash = adresseComparer(b, a); }}>Inverser</button>
          )}
        </div>
        {!(oa && ob) && <p className="resume">Choisissez deux organisations à comparer.</p>}
        {oa && ob && !c && (
          <p className="resume">
            Aucun ancêtre commun documenté entre {oa.sigle} et {ob.sigle}, même en comptant les absorptions, les
            passages de militants et les composantes.
          </p>
        )}
        {c && (
          <>
            <Frise index={index} id={a} genFixe={c} choisies={choisies} communs={communs} aller={aller}
              resume={`${c.ids.size} organisations sur les chemins entre ${oa.sigle}, ${ob.sigle} et leur${pluriel} ancêtre${pluriel} commun${pluriel} (cerclé${pluriel} de rouge).`} />
            <Legende styles={index.styles} />
          </>
        )}
      </section>
      <aside className="fiche">
        <h1>Comparaison</h1>
        {c && (
          <>
            {c.communs.includes(a) || c.communs.includes(b) ? (
              <p>
                {lien(c.communs.includes(a) ? a : b)} est un ancêtre de {lien(c.communs.includes(a) ? b : a)}
                {c.communs.length > 1 && <> ; autre{c.communs.length > 2 ? "s" : ""} ancêtre{c.communs.length > 2 ? "s" : ""} commun{c.communs.length > 2 ? "s" : ""} : {liste(c.communs.filter((q) => q !== a && q !== b))}</>}.
              </p>
            ) : (
              <p>Ancêtre{pluriel} commun{pluriel} le{pluriel} plus proche{pluriel} : {liste(c.communs)}.</p>
            )}
            <p className="sous-titre">Trouvé {MODES_COMPARAISON[c.mode]}.</p>
            {c.mode !== "principale" && (
              <p className="avertissement">
                Sans {c.mode === "absorption" ? "les absorptions" : "ces liens secondaires"}, aucun ancêtre commun
                n'est documenté : le lien entre les deux passe par un apport minoritaire.
              </p>
            )}
            <p>Chaque lien de la frise donne sa citation au survol ; chaque organisation mène à sa fiche.</p>
          </>
        )}
        <p className="signaler">
          Les passages de militants et l'entrisme ne sont pas comptés : voir le scénario{" "}
          <a href="#entrisme">Entrisme</a>.
        </p>
      </aside>
    </main>
  );
}

function Recherche({ organisations, onChoisir, placeholder = "Chercher une organisation (nom ou sigle)" }) {
  const [texte, setTexte] = useState("");
  const [actif, setActif] = useState(0);
  const resultats = useMemo(() => chercher(organisations, texte), [organisations, texte]);
  const choisir = (o) => {
    setTexte("");
    onChoisir(o);
  };
  return (
    <div className="recherche">
      <input type="search" placeholder={placeholder} value={texte}
        aria-label={placeholder}
        onChange={(e) => { setTexte(e.target.value); setActif(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActif((a) => Math.min(a + 1, resultats.length - 1));
          else if (e.key === "ArrowUp") setActif((a) => Math.max(a - 1, 0));
          else if (e.key === "Enter" && resultats[actif]) choisir(resultats[actif]);
          else if (e.key === "Escape") setTexte("");
        }} />
      {resultats.length > 0 && (
        <ul className="suggestions" role="listbox">
          {resultats.map((o, i) => (
            <li key={o.id} className={i === actif ? "actif" : ""} onMouseDown={() => choisir(o)}>
              <strong>{o.sigle}</strong> {o.nom !== o.sigle && <span>{o.nom}</span>}{" "}
              <small>
                {o.an_debut}–{o.actif ? "" : o.an_fin || "?"}
                {!o.dans_arbre && " · hors de l'arbre complet"}
              </small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Chemin orthogonal aux coins arrondis (rayon r, réduit si le segment est court)
function chemin(pts, r = 6) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [x, y] = pts[i];
    const [nx, ny] = pts[i + 1];
    const l1 = Math.hypot(x - px, y - py);
    const l2 = Math.hypot(nx - x, ny - y);
    const ra = Math.min(r, l1 / 2, l2 / 2);
    if (ra < 0.5) {
      d += ` L${x},${y}`;
      continue;
    }
    const ax = x - ((x - px) / l1) * ra;
    const ay = y - ((y - py) / l1) * ra;
    const bx = x + ((nx - x) / l2) * ra;
    const by = y + ((ny - y) / l2) * ra;
    d += ` L${ax},${ay} Q${x},${y} ${bx},${by}`;
  }
  const [lx, ly] = pts[pts.length - 1];
  return `${d} L${lx},${ly}`;
}

const REPETER = 520; // sur une barre longue, le sigle revient tous les REPETER px (lisible après défilement)
const AXE = 28; // hauteur de l'axe des années, collé en haut

export function Frise({ index, id, secondaires, profondeur = Infinity, pxParAn = null, aller, mesure = mesurer,
  largeurVue = null, genFixe = null, choisies = null, communs = null, resume = null }) {
  const genCalculee = useMemo(() => genealogie(index, id, { secondaires, profondeur }), [index, id, secondaires, profondeur]);
  const gen = genFixe || genCalculee;
  const conteneur = useRef(null);
  const [largeur, setLargeur] = useState(largeurVue || 1000);
  useEffect(() => {
    const c = conteneur.current;
    if (!c || largeurVue || typeof ResizeObserver === "undefined") return undefined;
    const obs = new ResizeObserver(() => setLargeur(c.clientWidth));
    obs.observe(c);
    return () => obs.disconnect();
  }, [largeurVue]);
  // Échelle : ajustée à la largeur de la vue (entre 4 et 26 px par an), sauf réglage manuel
  const echelle = useMemo(() => {
    if (pxParAn) return pxParAn;
    const os = [...gen.ids].map((q) => index.orgs.get(q));
    const t0 = Math.min(...os.map((o) => o.debut));
    const t1 = Math.max(...os.map((o) => (o.fin != null ? o.fin : index.aujourdhui)));
    return Math.max(4, Math.min(26, (largeur - 140) / Math.max(1, t1 - t0 + 2)));
  }, [pxParAn, gen, index, largeur]);
  const m = useMemo(() => placer(index, gen, { pxParAn: echelle, mesurer: (s) => mesure(s) }),
    [index, gen, echelle, mesure]);
  const [survol, setSurvol] = useState(null); // { type: "barre" | "lien", ..., x, y }

  // Centre la vue sur l'organisation choisie
  useEffect(() => {
    const b = m.boites.find((x) => x.o.id === id);
    const c = conteneur.current;
    if (b && c) {
      c.scrollLeft = Math.max(0, (b.x0 + b.x1) / 2 - c.clientWidth / 2);
      c.scrollTop = Math.max(0, b.yc - c.clientHeight / 2);
    }
  }, [id, m]);

  const idSurvol = survol?.type === "barre" ? survol.o.id : null;
  const proches = idSurvol
    ? new Set([idSurvol, ...gen.liens.filter((l) => l.a === idSurvol || l.b === idSurvol).flatMap((l) => [l.a, l.b])])
    : null;
  const style = (rel) => index.styles[rel] || { couleur: "#555", epaisseur: 1.5 };
  const montrer = (e, info) => {
    const c = conteneur.current.getBoundingClientRect();
    setSurvol({ ...info, x: e.clientX - c.left, y: e.clientY - c.top, w: c.width });
  };
  // Bandes de fond une période de 10 ans sur deux, comme l'arbre complet
  const bandes = [];
  for (let i = 0; i < m.graduations.length - 1; i += 2) bandes.push([m.graduations[i].x, m.graduations[i + 1].x]);
  const h = m.hauteur - AXE;

  return (
    <>
      <p className="resume">
        {resume ? resume : gen.ids.size === 1
          ? "Aucun ancêtre ni descendant documenté dans les sources."
          : `${gen.ancetres.size} ancêtre${gen.ancetres.size > 1 ? "s" : ""}, ${gen.descendants.size} descendant${gen.descendants.size > 1 ? "s" : ""}.`}{" "}
        Cliquez sur une barre pour suivre sa généalogie.
      </p>
      <div className="cadre-frise">
        <div className="defilement" ref={conteneur} onMouseLeave={() => setSurvol(null)}>
          <svg className="axe" width={m.largeur} height={AXE} aria-hidden="true">
            <rect width={m.largeur} height={AXE} className="fond-axe" />
            {m.graduations.map((g) => (
              <text key={g.an} x={g.x} y={18} className="annee">{g.an}</text>
            ))}
          </svg>
          <svg width={m.largeur} height={h} viewBox={`0 ${AXE} ${m.largeur} ${h}`} role="img"
            aria-label="Frise généalogique" className="dessin">
            {bandes.map(([a, b]) => (
              <rect key={a} x={a} y={AXE} width={b - a} height={h} className="bande-periode" />
            ))}
            {m.graduations.map((g) => (
              <line key={g.an} x1={g.x} x2={g.x} y1={AXE} y2={m.hauteur} className="graduation" />
            ))}
            {m.traits.filter((t) => !t.continuation).map((t, i) => {
              const s = style(t.l.rel);
              const estompe = proches && !(proches.has(t.l.a) && proches.has(t.l.b));
              const d = chemin(t.pts);
              const [x0, y0] = t.pts[0];
              return (
                <g key={i} className={`lien${estompe ? " estompe" : ""}`}
                  onMouseMove={(e) => montrer(e, { type: "lien", l: t.l, nom: s.nom })}>
                  <path d={d} fill="none" stroke="transparent" strokeWidth="10" />
                  <path d={d} fill="none" className="halo" strokeWidth={s.epaisseur + 3} />
                  <path d={d} fill="none" stroke={s.couleur} strokeWidth={s.epaisseur}
                    strokeDasharray={s.tirets || undefined} strokeLinecap="round" />
                  <polygon points={t.fleche.map((p) => p.join(",")).join(" ")} fill={s.couleur} />
                  {t.l.rel === "scission" && (
                    <polygon points={`${x0},${y0 - 4} ${x0 + 4},${y0} ${x0},${y0 + 4} ${x0 - 4},${y0}`}
                      fill="#fff" stroke={s.couleur} strokeWidth="1.5" />
                  )}
                </g>
              );
            })}
            {m.boites.map((b) => {
              const o = b.o;
              const yb = b.yc - BARRE_H / 2;
              const encre = texteSur(o.couleur);
              const estompe = proches && !proches.has(o.id);
              // identifiant SVG sûr : « fr:Union pour la reconstruction communiste » cassait url(#…) (barre noire)
              const degrade = `degrade-${o.id.replace(/[^A-Za-z0-9_-]/g, "_")}`;
              const repetitions = [];
              if (b.dedans) {
                for (let x = b.x0 + REPETER; x + mesure(o.sigle) + 10 < b.x1 - 20; x += REPETER) repetitions.push(x);
              }
              return (
                <g key={o.id} className={`barre${(choisies ? choisies.has(o.id) : o.id === id) ? " choisie" : ""}${communs?.has(o.id) ? " commune" : ""}${estompe ? " estompe" : ""}`}
                  onClick={() => aller(o.id)} onMouseMove={(e) => montrer(e, { type: "barre", o, dates: b.dates })}
                  tabIndex={0} role="button" aria-label={`${o.nom}, ${b.dates}`}
                  onKeyDown={(e) => e.key === "Enter" && aller(o.id)}>
                  {o.actif && (
                    <defs>
                      <linearGradient id={degrade}>
                        <stop offset="0" stopColor={o.couleur} />
                        <stop offset="1" stopColor={o.couleur} stopOpacity="0" />
                      </linearGradient>
                    </defs>
                  )}
                  {o.actif && <rect x={b.x1 - 2} y={yb} width={26} height={BARRE_H} fill={`url(#${degrade})`} />}
                  <rect className="corps" x={b.x0} y={yb} width={b.x1 - b.x0} height={BARRE_H}
                    rx={o.actif ? 0 : 4} fill={o.couleur}
                    stroke={o.dans_arbre ? "none" : "#333"} strokeDasharray={o.dans_arbre ? undefined : "3 2"} />
                  {b.dedans ? (
                    <text x={b.x0 + 6} y={b.yc + 4} className="sigle" fill={encre}>
                      {o.sigle}
                      {b.avecDates && <tspan className="dates" fill={encre} dx="6">{b.dates}</tspan>}
                    </text>
                  ) : (
                    <text x={b.x0} y={yb - 4} className="sigle dessus">{o.sigle}</text>
                  )}
                  {repetitions.map((x) => (
                    <text key={x} x={x} y={b.yc + 4} className="sigle repete" fill={encre}>{o.sigle}</text>
                  ))}
                  {o.sans_genealogie && (
                    <path d={`M${b.x0 - 2} ${yb - 2} H${b.x0 - 6} V${yb + BARRE_H + 2} H${b.x0 - 2}`}
                      stroke="#333" strokeWidth="1.6" fill="none" />
                  )}
                </g>
              );
            })}
          </svg>
        </div>
        {survol && <Survol survol={survol} index={index} />}
      </div>
    </>
  );
}

// Fiche de survol : une organisation (nom, dates) ou un lien (relation, date, citation, source)
function Survol({ survol, index }) {
  const gauche = survol.x + 300 > survol.w ? survol.x - 300 : survol.x + 16;
  const pos = { left: Math.max(4, gauche), top: survol.y + 18 };
  if (survol.type === "barre") {
    const o = survol.o;
    return (
      <div className="survol" style={pos}>
        <strong>{o.nom}</strong>
        <span className="survol-dates">{survol.dates}</span>
        {!o.dans_arbre && <span className="survol-note">hors de l'arbre complet</span>}
        {o.famille_indeterminee && <span className="survol-note">famille non déterminée</span>}
        <span className="survol-aide">Clic : sa généalogie et sa fiche</span>
      </div>
    );
  }
  const l = survol.l;
  return (
    <div className="survol" style={pos}>
      <strong>{survol.nom}</strong>
      <span>{index.orgs.get(l.a).sigle} → {index.orgs.get(l.b).sigle}{l.t ? `, ${Math.floor(l.t)}` : ""}</span>
      {l.citation && <q>{l.citation}</q>}
      {l.source && <span className="survol-source">{l.source}</span>}
    </div>
  );
}

function Legende({ styles }) {
  const rels = ["renommage", "fusion", "scission", "absorption", "refondation", "passage", "composante", "filiation_idéologique"];
  return (
    <ul className="legende">
      {rels.filter((r) => styles[r]).map((r) => (
        <li key={r}>
          <svg width="34" height="10" aria-hidden="true">
            <line x1="0" x2="34" y1="5" y2="5" stroke={styles[r].couleur} strokeWidth={styles[r].epaisseur}
              strokeDasharray={styles[r].tirets || undefined} />
          </svg>
          {styles[r].nom}
        </li>
      ))}
      <li>
        <svg width="34" height="12" aria-hidden="true"><rect x="1" y="1" width="32" height="10" fill="#ddd" stroke="#333" strokeDasharray="3 2" /></svg>
        hors de l'arbre complet
      </li>
    </ul>
  );
}

// Phrase de fiche : {{org:Q…}} devient un bouton vers cette organisation, [n] un renvoi à la source n
function Phrase({ texte, index, donnees, aller }) {
  const morceaux = texte.split(/(\{\{org:[^}]+\}\}|\[\d+\])/g);
  return (
    <p>
      {morceaux.map((m, i) => {
        const org = m.match(/^\{\{org:([^}]+)\}\}$/);
        if (org) {
          const o = index.orgs.get(org[1]);
          if (!o) return <span key={i}>{donnees.autres_noms[org[1]] || org[1]}</span>;
          return (
            <button key={i} className="lien-org" onClick={() => aller(o.id)} title={o.nom}>{o.sigle}</button>
          );
        }
        const note = m.match(/^\[(\d+)\]$/);
        if (note) return <sup key={i}><a href={`#source-${note[1]}`} onClick={(e) => {
          e.preventDefault();
          document.getElementById(`source-${note[1]}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }}>{note[1]}</a></sup>;
        return <span key={i}>{m}</span>;
      })}
    </p>
  );
}

export function Fiche({ o, index, donnees, aller }) {
  return (
    <aside className="fiche">
      <h1>{o.nom}</h1>
      <p className="sous-titre">
        {o.sigle !== o.nom && <strong>{o.sigle}</strong>}{" "}
        {o.approx ? "vers " : ""}{o.an_debut}–{o.actif ? "aujourd'hui" : o.an_fin || "?"}
      </p>
      {!o.dans_arbre && (
        <p className="avertissement">
          Absente de l'arbre complet, qui ne garde que les lignées menant aux organisations actives ou les plus
          documentées. Ses liens ci-dessous sont sourcés comme les autres.
        </p>
      )}
      {o.famille_indeterminee && (
        <p className="avertissement">
          Famille politique non déterminée par les sources (barre grise) : présente ici pour sa place dans une
          généalogie, par un lien cité ci-dessous.
        </p>
      )}
      {o.phrases.map((p, i) => (
        <Phrase key={i} texte={p} index={index} donnees={donnees} aller={aller} />
      ))}
      {o.sources.length > 0 && (
        <>
          <h2>Sources</h2>
          <ol className="sources">
            {o.sources.map((s, i) => (
              <li key={i} id={`source-${i + 1}`}>
                <q>{s.citation}</q>{" "}
                {s.url ? <a href={s.url} target="_blank" rel="noopener">{s.texte}</a> : <span>{s.texte}</span>}
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="vers-comparer">
        <a href={`#${adresseComparer(o.id, "")}`}>Comparer avec une autre organisation →</a>
      </p>
      <p className="signaler">
        Une erreur dans cette fiche ? <a href={SIGNALER} target="_blank" rel="noopener">Signalez-la</a>, si possible
        avec la source qui le montre.
      </p>
    </aside>
  );
}
