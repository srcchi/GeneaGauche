"""Étape 3g : années de fondation lues dans le texte des articles Wikipédia en cache, à valider à la main.

Demande de l'utilisateur (24 novembre 2026). Pour les organisations sans date de fondation
(data/sortie/a_dater.csv, « pas de date de fondation ») : ni Wikidata (P571) ni l'infobox ne donnent
l'année, mais le texte de l'article la dit souvent (« fondé en 1929 », « créée le 12 mars 1966 »).
Aucun réseau : le texte en cache (preuves.Corpus).

Une phrase est candidate si un verbe de fondation (fondé, créé, constitué, naît, apparaît, lancé…) est suivi
d'une année à moins de 60 caractères, hors infobox, modèles et listes. Les premières phrases de l'article
passent en premier (l'introduction dit d'ordinaire la fondation). Trois candidats au plus par organisation.

Produit : data/manuel/fondations_a_valider.csv (créé une fois, ensuite seules les nouvelles lignes sont
ajoutées). Colonnes : id, label, annee, citation (mot pour mot), source, rang (1 = première phrase
trouvée dans l'article), decision (oui : nettoyage.py retient l'année ; non ; vide : à décider), note.
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
RX = re.compile(r"\b(?:fond[ée]e?s?|cr[ée]{2}e?s?|constitu[ée]e?s?|na[iî]t|naissance|apparu[es]?|appara[iî]t|"
                r"lanc[ée]e?s?|form[ée]e?s?|vu le jour)\b[^.\n]{0,60}?\b(1[789]\d\d|20[0-2]\d)\b", re.I)
ENTETES = ["id", "label", "annee", "citation", "source", "rang", "decision", "note"]


def main():
    corpus = preuves.Corpus()
    with open(os.path.join(SORTIE, "a_dater.csv"), encoding="utf-8") as f:
        cibles = [r for r in csv.DictReader(f) if r["raison"] == "pas de date de fondation"]
    lignes, sans_texte = [], []
    for r in cibles:
        textes = [(t, x) for lang, t, x in corpus.textes.get(r["id"], []) if lang == "fr"]
        if not textes:
            sans_texte.append(r["label"])
            continue
        titre, txt = textes[0]
        vus, rang = set(), 0
        for m in RX.finditer(txt):
            phrase = preuves.phrase_autour(txt, m.start(), m.end())
            if phrase.lstrip().startswith(("|", "{{", "[[Catégorie", "*", "!")) or phrase not in txt:
                continue
            an = m.group(1)
            if (an, phrase) in vus:
                continue
            vus.add((an, phrase))
            rang += 1
            lignes.append([r["id"], r["label"], an, phrase.strip(), f"fr:{titre}", str(rang), "", ""])
            if rang >= 3:
                break
    chemin = os.path.join(MANUEL, "fondations_a_valider.csv")
    existants = set()
    if os.path.exists(chemin):
        with open(chemin, encoding="utf-8") as f:
            existants = {(x["id"], x["annee"], x["citation"]) for x in csv.DictReader(f)}
    nouvelles = [l for l in lignes if (l[0], l[2], l[3]) not in existants]
    neuf = not os.path.exists(chemin)
    with open(chemin, "a", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        if neuf:
            w.writerow(ENTETES)
        w.writerows(nouvelles)
    avec = len({l[0] for l in lignes})
    print(f"{len(cibles)} organisations sans date de fondation : {len(cibles) - len(sans_texte)} ont un article en cache, "
          f"{avec} avec au moins un candidat ; {len(lignes)} candidats, {len(nouvelles)} nouveaux dans "
          f"data/manuel/fondations_a_valider.csv")


if __name__ == "__main__":
    main()
