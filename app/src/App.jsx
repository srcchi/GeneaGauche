import React, { useEffect, useMemo, useRef, useState } from "react";
import { BARRE_H, chercher, genealogie, indexer, placer } from "./genealogie.js";

const DEPOT = "https://github.com/srcchi/GeneaGauche";
const SIGNALER = `${DEPOT}/issues/new?template=erreur.yml`;
const EXEMPLES = ["Q170972", "Q192821", "Q27978402", "Q2996386", "Q557045"]; // PS, PCF, LFI, NPA, Les Écologistes

// Adresse partageable : #Q170972 (et « +secondaires »)
function lireAdresse() {
  const h = decodeURIComponent(window.location.hash.replace(/^#/, ""));
  const [id, opt] = h.split("+");
  return { id: id || null, secondaires: opt === "secondaires" };
}

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
  const [pxParAn, setPxParAn] = useState(10);
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
        <Recherche organisations={donnees.organisations} aller={aller} />
        <nav>
          <a href="../arbres/arbre.html">Arbre complet</a>
          <a href={SIGNALER} target="_blank" rel="noopener">Signaler une erreur</a>
        </nav>
      </header>
      {choisie ? (
        <main>
          <section className="frise">
            <div className="reglages">
              <label>
                <input type="checkbox" checked={adresse.secondaires}
                  onChange={(e) => aller(choisie.id, e.target.checked)} />
                Liens secondaires (passages de militants, adhésions, filiations)
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
                <input type="range" min="3" max="30" value={pxParAn}
                  onChange={(e) => setPxParAn(Number(e.target.value))} />
              </label>
            </div>
            <Frise index={index} id={choisie.id} secondaires={adresse.secondaires} profondeur={profondeur}
              pxParAn={pxParAn} aller={aller} />
            <Legende styles={index.styles} />
          </section>
          <Fiche o={choisie} index={index} donnees={donnees} aller={aller} />
        </main>
      ) : (
        <Accueil index={index} aller={aller} inconnue={adresse.id} />
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

function Accueil({ index, aller, inconnue }) {
  return (
    <div className="accueil">
      {inconnue && <p className="message">Organisation introuvable : {inconnue}.</p>}
      <p>
        Cherchez une organisation par son nom ou son sigle : sa généalogie s'affiche sur une frise, avec ses ancêtres
        et ses descendants, y compris les petites organisations absentes de l'arbre complet. Sa fiche donne chaque
        fait avec la citation qui le justifie.
      </p>
      <p>Par exemple :</p>
      <ul className="exemples">
        {EXEMPLES.filter((q) => index.orgs.has(q)).map((q) => (
          <li key={q}>
            <button onClick={() => aller(q)}>{index.orgs.get(q).nom}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Recherche({ organisations, aller }) {
  const [texte, setTexte] = useState("");
  const [actif, setActif] = useState(0);
  const resultats = useMemo(() => chercher(organisations, texte), [organisations, texte]);
  const choisir = (o) => {
    setTexte("");
    aller(o.id);
  };
  return (
    <div className="recherche">
      <input type="search" placeholder="Chercher une organisation (nom ou sigle)" value={texte}
        aria-label="Chercher une organisation"
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

export function Frise({ index, id, secondaires, profondeur = Infinity, pxParAn, aller, mesure = mesurer }) {
  const gen = useMemo(() => genealogie(index, id, { secondaires, profondeur }), [index, id, secondaires, profondeur]);
  const m = useMemo(() => placer(index, gen, { pxParAn, mesurer: (s) => mesure(s) }), [index, gen, pxParAn, mesure]);
  const conteneur = useRef(null);
  const [survol, setSurvol] = useState(null);

  // Centre la vue sur l'organisation choisie
  useEffect(() => {
    const b = m.boites.find((x) => x.o.id === id);
    const c = conteneur.current;
    if (b && c) {
      c.scrollLeft = Math.max(0, (b.x0 + b.x1) / 2 - c.clientWidth / 2);
      c.scrollTop = Math.max(0, b.yc - c.clientHeight / 2);
    }
  }, [id, m]);

  const proches = survol ? new Set([survol, ...gen.liens.filter((l) => l.a === survol || l.b === survol).flatMap((l) => [l.a, l.b])]) : null;
  const style = (rel) => index.styles[rel] || { couleur: "#555", epaisseur: 1.5 };
  const n = gen.ids.size - 1;

  return (
    <>
      <p className="resume">
        {n === 0
          ? "Aucun ancêtre ni descendant documenté dans les sources."
          : `${gen.ancetres.size} ancêtre${gen.ancetres.size > 1 ? "s" : ""}, ${gen.descendants.size} descendant${gen.descendants.size > 1 ? "s" : ""}.`}{" "}
        Cliquez sur une barre pour suivre sa généalogie.
      </p>
      <div className="defilement" ref={conteneur}>
        <svg width={m.largeur} height={m.hauteur} role="img" aria-label="Frise généalogique">
          {m.graduations.map((g) => (
            <g key={g.an}>
              <line x1={g.x} x2={g.x} y1={22} y2={m.hauteur} className="graduation" />
              <text x={g.x} y={16} className="annee">{g.an}</text>
            </g>
          ))}
          {m.traits.filter((t) => !t.continuation).map((t, i) => {
            const s = style(t.l.rel);
            const estompe = proches && !(proches.has(t.l.a) && proches.has(t.l.b));
            return (
              <g key={i} className={estompe ? "estompe" : ""}>
                <title>{`${s.nom} : ${index.orgs.get(t.l.a).sigle} vers ${index.orgs.get(t.l.b).sigle}${t.l.t ? ` (${Math.floor(t.l.t)})` : ""}\n« ${t.l.citation} »${t.l.source ? `\n[source : ${t.l.source}]` : ""}`}</title>
                <polyline points={t.pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="#fff"
                  strokeWidth={s.epaisseur + 2.5} strokeOpacity="0.85" />
                <polyline points={t.pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={s.couleur}
                  strokeWidth={s.epaisseur} strokeDasharray={s.tirets || undefined} />
                <polygon points={t.fleche.map((p) => p.join(",")).join(" ")} fill={s.couleur} />
              </g>
            );
          })}
          {m.boites.map((b) => {
            const o = b.o;
            const yb = b.yc - BARRE_H / 2;
            const encre = texteSur(o.couleur);
            const estompe = proches && !proches.has(o.id);
            return (
              <g key={o.id} className={`barre${o.id === id ? " choisie" : ""}${estompe ? " estompe" : ""}`}
                onClick={() => aller(o.id)} onMouseEnter={() => setSurvol(o.id)} onMouseLeave={() => setSurvol(null)}
                tabIndex={0} role="button" aria-label={`${o.nom}, ${b.dates}`}
                onKeyDown={(e) => e.key === "Enter" && aller(o.id)}>
                <title>{`${o.nom} (${b.dates})${o.dans_arbre ? "" : "\nhors de l'arbre complet"}`}</title>
                <rect x={b.x0} y={yb} width={b.x1 - b.x0} height={BARRE_H} rx="3" fill={o.couleur}
                  stroke={o.dans_arbre ? "none" : "#333"} strokeDasharray={o.dans_arbre ? undefined : "3 2"} />
                {o.actif && <rect x={b.x1} y={yb} width={18} height={BARRE_H} fill={`url(#degrade-${o.id})`} />}
                {o.actif && (
                  <defs>
                    <linearGradient id={`degrade-${o.id}`}>
                      <stop offset="0" stopColor={o.couleur} />
                      <stop offset="1" stopColor={o.couleur} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                )}
                {b.dedans ? (
                  <text x={b.x0 + 5} y={b.yc + 4} className="sigle" fill={encre}>
                    {o.sigle}
                    {b.avecDates && <tspan className="dates" fill={encre}>{"  "}{b.dates}</tspan>}
                  </text>
                ) : (
                  <text x={b.x0} y={yb - 4} className="sigle dessus">{o.sigle}</text>
                )}
                {o.sans_genealogie && (
                  <path d={`M${b.x0 - 2} ${yb - 2} H${b.x0 - 6} V${yb + BARRE_H + 2} H${b.x0 - 2}`}
                    stroke="#333" strokeWidth="1.6" fill="none" />
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </>
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
      <p className="signaler">
        Une erreur dans cette fiche ? <a href={SIGNALER} target="_blank" rel="noopener">Signalez-la</a>, si possible
        avec la source qui le montre.
      </p>
    </aside>
  );
}
