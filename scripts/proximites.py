"""Étape 3d : proximités entre organisations (courants internes, entrisme, adhésions, alliances).

Elles servent à rapprocher les barres dans l'arbre (une voie commune aux socialistes, communistes et
trotskystes : la Ligue communiste, courant interne de la SFIO en 1934, se range près d'elle), et à
placer les partis « sans généalogie documentée » près des partis dont ils sont proches (Place publique
près du PS). Le placement n'affirme rien ; une proximité n'apparaît dans une fiche que validée.

Source : le texte en cache de l'article de chaque organisation dessinée (aucun réseau). Une phrase est
gardée si elle lie une autre organisation dessinée et dit la nature du rapport ; citation mot pour mot.
Produit : data/manuel/proximites.csv (créé une fois, puis seules les nouvelles paires sont ajoutées ;
decision : vide = placement seulement, oui = aussi dans la fiche, non = ignorée).
"""
import csv
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import preuves  # noqa: E402

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SORTIE = os.path.join(RACINE, "data", "sortie")
MANUEL = os.path.join(RACINE, "data", "manuel")
NATURES = [
    ("entrisme", r"entrisme|entriste"),
    ("courant interne", r"courant (?:interne|minoritaire|majoritaire)?|tendance (?:organisée|interne)?|fraction|"
                        r"au sein (?:du|de la|de l')"),
    ("adhésion", r"adhér|adhésion|rejoin|rejoign|intègre|intégr|ralli"),
    ("alliance", r"liste commune|listes communes|alliance|allié|accord électoral|cartel|coalition|front commun"),
    ("proximité", r"proche d|proches d|soutien|soutient|sympathis"),
]
RX_NATURES = [(n, re.compile(rx, re.I)) for n, rx in NATURES]
RX_LIEN = re.compile(r"\[\[([^\[\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]")


def main():
    corpus = preuves.Corpus()
    orgs = {r["id"]: r for r in csv.DictReader(open(os.path.join(SORTIE, "organisations.csv"), encoding="utf-8"))}
    dessinees = {q for q, r in orgs.items() if r["garde"] == "oui"}
    lignee = set()
    for r in csv.DictReader(open(os.path.join(SORTIE, "liens.csv"), encoding="utf-8")):
        lignee |= {(r["source"], r["cible"]), (r["cible"], r["source"])}
    trouvees, vus = [], set()
    for q in sorted(dessinees):
        for lang, titre, txt in corpus.textes.get(q, []):
            if lang != "fr":
                continue
            for m in RX_LIEN.finditer(txt):
                cible = corpus.resoudre("fr", m.group(1))
                if cible not in dessinees or cible == q or (q, cible) in vus:
                    continue
                phrase = preuves.phrase_autour(txt, m.start(), m.end())
                if phrase.lstrip().startswith(("|", "{{", "[[Catégorie", "*")) or phrase not in txt:
                    continue           # champs d'infobox, modèles, listes : déjà lus ailleurs
                nature = next((n for n, rx in RX_NATURES if rx.search(phrase)), None)
                if not nature:
                    continue
                vus.add((q, cible))
                trouvees.append([q, orgs[q]["label"], cible, orgs[cible]["label"], nature,
                                 "oui" if (q, cible) in lignee else "", phrase, f"fr:{titre}", ""])
            break
    chemin = os.path.join(MANUEL, "proximites.csv")
    entetes = ["org_id", "org_label", "proche_id", "proche_label", "nature", "deja_lien_de_lignee", "citation",
               "source", "decision"]
    existants = set()
    if os.path.exists(chemin):
        with open(chemin, encoding="utf-8") as fh:
            existants = {(r["org_id"], r["proche_id"]) for r in csv.DictReader(fh)}
    nouvelles = [t for t in trouvees if (t[0], t[2]) not in existants]
    neuf = not os.path.exists(chemin)
    with open(chemin, "a", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        if neuf:
            w.writerow(entetes)
        w.writerows(nouvelles)
    par_nature = {}
    for t in trouvees:
        par_nature[t[4]] = par_nature.get(t[4], 0) + 1
    print(f"{len(trouvees)} proximités trouvées ({par_nature}), {len(nouvelles)} nouvelles dans data/manuel/proximites.csv")


if __name__ == "__main__":
    main()
