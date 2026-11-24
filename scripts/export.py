"""Export du graphe complet pour l'application (app/) : app/public/graphe.json.

Toutes les organisations datées de data/sortie/organisations.csv, y compris celles qui ne sont pas
dessinées dans l'arbre principal (« hors de l'arbre principal », petits partis compris), les liens
sourcés de liens.csv, les Internationales et leurs membres, et la fiche rédigée de chaque organisation.
Les fiches sont construites par le même code que l'arbre (rendu.construire_fiches) : mêmes phrases,
mêmes citations, mêmes liens vers les articles.

Aucune donnée n'est inventée ici : le script ne fait que réorganiser ce que produit la chaîne.
"""
import csv
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rendu as R  # noqa: E402

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SORTIE = os.path.join(RACINE, "app", "public", "graphe.json")


def an(t):
    return None if t is None else round(t, 3)


# Hors de l'arbre principal, on garde les organisations écartées pour une raison de lisibilité (isolées,
# sans descendance active, fin à dater) ; pas celles que la chaîne a jugées hors du sujet ou incertaines.
CAUSES_EXCLUES = {"hors_perimetre", "famille_non_determinee", "rejet_porte"}


def retenue(o, causes, douteux):
    if o.get("dans_arbre"):
        return True
    return (causes.get(o["id"]) not in CAUSES_EXCLUES and not douteux.get(o["id"])
            and o["famille"] in R.FAMILLES and o["famille"] != R.VOIE_SANS_GEN)


def main():
    orgs, liens, inter, T_AUJ = R.charger(tous=True)
    sortie = os.path.join(RACINE, "data", "sortie")
    with open(os.path.join(sortie, "elagues.csv"), encoding="utf-8") as f:
        causes = {r["id"]: r["cause"] for r in csv.DictReader(f)}
    with open(os.path.join(sortie, "organisations.csv"), encoding="utf-8") as f:
        douteux = {r["id"]: r["perimetre_douteux"].strip() for r in csv.DictReader(f)}
    ecartees = {q: o["etiquette"] or o["label"] for q, o in orgs.items() if not retenue(o, causes, douteux)}
    # Ascendance complète (demande de l'utilisateur, 23 novembre 2026 : Les Nouveaux Démocrates, absorbés
    # par Les Écologistes) : une organisation de famille indéterminée ou au périmètre douteux revient si
    # un lien de lignée cité la relie à une organisation retenue (POP -> PUP, UCRG -> PS, Gauche
    # révolutionnaire -> PSOP) ; jamais celles hors périmètre ni refusées à la porte. Une seule passe :
    # pas de proche en proche à travers des organisations incertaines.
    lignee = {"renommage", "refondation", "fusion", "scission", "absorption"}
    retenues = set(orgs) - set(ecartees)
    rattachees = {x for l in liens if l["rel"] in lignee
                  for x, y in ((l["a"], l["b"]), (l["b"], l["a"]))
                  if x in ecartees and y in retenues and causes.get(x) not in {"hors_perimetre", "rejet_porte"}}
    for q in rattachees:
        del ecartees[q]
        orgs[q]["famille_indeterminee"] = orgs[q]["famille"] not in R.FAMILLES
    orgs = {q: o for q, o in orgs.items() if q not in ecartees}
    liens = [l for l in liens if l["a"] in orgs and l["b"] in orgs]
    familles = {k: dict(nom=t, couleur=c) for k, (t, c) in R.FAMILLES.items() if k != R.VOIE_SANS_GEN}
    sortie_orgs = []
    for q, o in sorted(orgs.items(), key=lambda kv: (kv[1]["t0"], kv[1]["label"])):
        fiche = o.get("fiche") or {}
        sortie_orgs.append(dict(
            id=q, nom=R.lisible(o["label"]), sigle=o["etiquette"] or o["label"], famille=o["famille"],
            couleur=o["couleur"], debut=an(o["t0"]), fin=an(o["t1"]), an_debut=int(o["an0"]),
            an_fin=o["fin_txt"] or None, actif=o["statut"].startswith("actif"),
            fin_inconnue=o["statut"] == "fin inconnue", approx=bool(o.get("approx")),
            dans_arbre=bool(o.get("dans_arbre")), sans_genealogie=bool(o.get("sans_gen")),
            famille_indeterminee=bool(o.get("famille_indeterminee")),
            noms=[dict(an=int(t), nom=n) for t, n, _c, _s in o.get("noms", [])],
            phrases=fiche.get("phrases", []), sources=fiche.get("sources", [])))
    sortie_liens = []
    for l in liens:
        texte, url = R.lien_source(l.get("source_cit", ""))
        sortie_liens.append(dict(
            a=l["a"], b=l["b"], rel=l["rel"], t=an(l["t"]), nom=R.STYLE_LIEN.get(l["rel"], {}).get("nom", l["rel"]),
            preuve=l["preuve"], citation=R.lisible(l["citation"]), source=texte, url=url))
    sortie_inter = []
    for i, d in sorted(inter.items(), key=lambda kv: (kv[1]["debut"] or "9999", kv[1]["nom"])):
        membres = []
        for q, o in orgs.items():
            for a in o["affil"]:
                if a["international_id"] == i:
                    membres.append(dict(id=q, debut=a.get("start") or None,
                                        fin=None if a.get("end") in ("", "toujours membre") else a.get("end"),
                                        dates_connues=a.get("date_certainty") == "known"))
        sortie_inter.append(dict(id=i, nom=d["nom"], sigle=re.sub(r"\s*\(\d{4}\)$", "", d["sigle"] or ""),
                                 debut=d["debut"] or None, fin=d["fin"] or None, couleur=d["couleur"],
                                 predecesseurs=d["pred"], membres=membres))
    # Entrisme validé à la main (data/manuel/entrisme.csv, scripts/entrisme.py, decision = oui). Pas de trait dans
    # la frise (demande de l'utilisateur, 24 novembre 2026 : passages de militants et entrisme retirés pour
    # simplifier) : une liste à part pour le scénario « Entrisme », et une phrase dans la fiche des deux organisations
    par_id = {o["id"]: o for o in sortie_orgs}
    chemin_e = os.path.join(RACINE, "data", "manuel", "entrisme.csv")
    entrismes = []
    if os.path.exists(chemin_e):
        with open(chemin_e, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                e, h = r["entriste_id"], r["hote_id"]
                if r.get("decision", "").strip().lower() != "oui" or e not in par_id or h not in par_id:
                    continue
                src = r["source"].strip()
                texte, url = (re.sub(r"^https?://(www\.)?([^/]+).*$", r"\2", src), src) if src.startswith("http") \
                    else R.lien_source(src)
                debut = int(r["annee"]) if r.get("annee", "").strip().isdigit() else None
                fin = int(r["fin"]) if r.get("fin", "").strip().isdigit() else None
                nature = (r.get("nature") or "entrisme").strip()
                # phrase coupée au milieu d'un lien ou d'un modèle (« e]] organise », « m:20000}} ») : on retire
                # le morceau tronqué, à l'affichage seulement (data/manuel garde la citation entière)
                citation = re.sub(r"^[^\s\[\]{}]*(?:\]\]|\}\})\s*", "… ", r["citation"])
                citation = R.lisible(re.sub(r"\s*(?:\[\[|\{\{)[^\]}]*$", " …", citation))   # et à la fin (« menée par [[ »)
                entrismes.append(dict(entriste=e, hote=h, debut=debut, fin=fin, nature=nature, citation=citation,
                                      source=texte, url=url))
                per = (f" de {debut} à {fin}" if debut and fin else f" depuis {debut}" if debut and nature == "soutien"
                       else f" ({debut})" if debut else "")
                if nature == "soutien":
                    phrases = ((e, f"Soutient {{{{org:{h}}}}}{per}, sans y entrer"),
                               (h, f"Soutenue par {{{{org:{e}}}}}{per}"))
                else:
                    phrases = ((e, f"Entrisme dans {{{{org:{h}}}}}{per}"), (h, f"Entrisme de militants de {{{{org:{e}}}}}{per}"))
                for q, phrase in phrases:
                    o = par_id[q]
                    o["sources"].append(dict(citation=citation, texte=texte, url=url))
                    o["phrases"].append(f"{phrase} [{len(o['sources'])}].")
    styles = {k: dict(nom=v["nom"], couleur=v["couleur"], tirets=v.get("dash") or None, epaisseur=v["w"])
              for k, v in R.STYLE_LIEN.items()}
    donnees = dict(
        genere_le=R.datetime.date.today().isoformat(), aujourdhui=round(T_AUJ, 3),
        licence="Citations de Wikipédia (CC BY-SA 4.0, chaque citation renvoie à son article) et Wikidata (CC0)",
        familles=familles, styles_liens=styles,
        organisations=sortie_orgs, liens=sortie_liens, internationales=sortie_inter, entrismes=entrismes,
        # citées dans une fiche mais hors du périmètre de l'application : leur sigle seulement
        autres_noms=ecartees)
    os.makedirs(os.path.dirname(SORTIE), exist_ok=True)
    with open(SORTIE, "w", encoding="utf-8") as f:
        json.dump(donnees, f, ensure_ascii=False, separators=(",", ":"))
    n_arbre = sum(o["dans_arbre"] for o in sortie_orgs)
    print(f"{len(ecartees)} écartées (hors périmètre, famille indéterminée, périmètre douteux) ; "
          f"{len(rattachees)} rattachées par un lien de lignée : "
          + ", ".join(sorted(orgs[q]["etiquette"] or orgs[q]["label"] for q in rattachees)))
    print(f"{len(sortie_orgs)} organisations ({n_arbre} dans l'arbre principal, {len(sortie_orgs) - n_arbre} hors), "
          f"{len(sortie_liens)} liens, {len(entrismes)} entrismes ou soutiens validés, {len(sortie_inter)} Internationales -> {os.path.relpath(SORTIE, RACINE)} "
          f"({os.path.getsize(SORTIE) // 1024} Ko)")


if __name__ == "__main__":
    main()
