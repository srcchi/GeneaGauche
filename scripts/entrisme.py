"""Étape 3e : candidats à l'entrisme (des militants d'une organisation entrent, de manière concertée, dans
une autre), à valider à la main.

Demande de l'utilisateur (23 novembre 2026) : l'entrisme manque à la généalogie (trotskystes dans la SFIO
en 1934, lambertistes dans le PS…). La détection générale des proximités (proximites.py) ne garde qu'une
phrase par paire d'organisations ; ici, on lit toutes les phrases qui parlent d'entrisme.

Sources (texte en cache, réseau seulement pour les articles généraux absents du cache, mis en cache) :
l'article de chaque organisation de data/sortie/organisations.csv, et les articles « Entrisme »,
« Trotskisme en France », « Courant lambertiste ». Une phrase est gardée si elle contient « entrisme »,
« entriste », « noyaut » ou « infiltr », et relie au moins deux organisations connues (l'organisation de l'article
compte). Le sens (qui entre, et dans quelle organisation) est deviné : « dans le / au sein du / rejoindre
[[X]] » désigne l'organisation d'accueil ; il est à vérifier.

Produit : data/manuel/entrisme.csv (créé une fois, puis seules les nouvelles paires sont ajoutées).
Colonnes : entriste_id, entriste, hote_id, hote, annee, sens (deviné ou à préciser), citation (mot pour
mot), source, decision. decision = oui : le lien « entrisme » apparaît dans l'application (scripts/export.py),
avec sa citation ; non : ignoré ; vide : à décider.
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
ARTICLES_GENERAUX = ["Entrisme", "Trotskisme en France", "Courant lambertiste"]
RX_ENTRISME = re.compile(r"entris|noyaut|infiltr", re.I)
RX_LIEN = re.compile(r"\[\[([^\[\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]")
# juste avant le lien : l'organisation d'accueil
RX_ACCUEIL = re.compile(r"(?:dans|au sein d[eu]|au sein de la|au sein de l'|rejoindre|rejoint|intégrer|intègrent|"
                        r"infiltr\w*|adhérer à|à l'intérieur d[eu])\s*(?:l[ea]\s|l'|les\s)?$", re.I)
RX_ANNEE = re.compile(r"\b(1[89]\d\d|20[0-2]\d)\b")
ENTETES = ["entriste_id", "entriste", "hote_id", "hote", "annee", "sens", "citation", "source", "decision"]


def textes_generaux():
    """Articles généraux : depuis le cache d'enrichissement, téléchargés (et mis en cache) s'ils manquent."""
    import enrichissement
    return enrichissement.wikitextes("fr", ARTICLES_GENERAUX)


def main():
    corpus = preuves.Corpus()
    with open(os.path.join(SORTIE, "organisations.csv"), encoding="utf-8") as f:
        orgs = {r["id"]: r for r in csv.DictReader(f)}
    sources = []      # (organisation de l'article ou None, titre, texte)
    for q in orgs:
        for lang, titre, txt in corpus.textes.get(q, []):
            if lang == "fr":
                sources.append((q, titre, txt))
                break
    for titre, txt in textes_generaux().items():
        if txt:
            sources.append((None, titre, txt))

    trouvees, vus = [], set()
    for sujet, titre, txt in sources:
        for m in RX_ENTRISME.finditer(txt):
            phrase = preuves.phrase_autour(txt, m.start(), m.end())
            if phrase.lstrip().startswith(("|", "{{", "[[Catégorie", "*")) or phrase not in txt:
                continue
            liees = []        # (id, accueil ?) dans l'ordre de la phrase
            for lien in RX_LIEN.finditer(phrase):
                q = corpus.resoudre("fr", lien.group(1))
                if q in orgs and q not in [x for x, _ in liees]:
                    liees.append((q, bool(RX_ACCUEIL.search(phrase[max(0, lien.start() - 40):lien.start()]))))
            hotes = [q for q, acc in liees if acc]
            autres = [q for q, acc in liees if not acc]
            if sujet and sujet not in hotes and sujet not in autres:
                autres.insert(0, sujet)
            paires = [(e, h, "deviné") for h in hotes for e in autres if e != h]
            if not paires and len(autres) >= 2:
                paires = [(autres[0], h, "à préciser") for h in autres[1:]]
            an = RX_ANNEE.search(phrase)
            for e, h, sens in paires:
                if (e, h) in vus:
                    continue
                vus.add((e, h))
                trouvees.append([e, orgs[e]["label"], h, orgs[h]["label"], an.group(1) if an else "", sens,
                                 phrase.strip(), f"fr:{titre}", ""])
    chemin = os.path.join(MANUEL, "entrisme.csv")
    existants = set()
    if os.path.exists(chemin):
        with open(chemin, encoding="utf-8") as f:
            existants = {(r["entriste_id"], r["hote_id"]) for r in csv.DictReader(f)}
    nouvelles = [t for t in trouvees if (t[0], t[2]) not in existants]
    neuf = not os.path.exists(chemin)
    with open(chemin, "a", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        if neuf:
            w.writerow(ENTETES)
        w.writerows(nouvelles)
    print(f"{len(trouvees)} candidats à l'entrisme, {len(nouvelles)} nouveaux dans data/manuel/entrisme.csv "
          f"(sens deviné : {sum(t[5] == 'deviné' for t in trouvees)}, à préciser : {sum(t[5] != 'deviné' for t in trouvees)})")


if __name__ == "__main__":
    main()
