"""Étape 3f : informations manquantes lues sur les sites officiels des organisations, à valider à la main.

Demande de l'utilisateur (24 novembre 2026). Premier lot : les organisations sans date de fondation
(data/sortie/a_dater.csv, « pas de date de fondation ») qui ont un site officiel dans Wikidata (propriété
P856, en cache dans data/sortie/cache_enrichissement.json). Option --statut : les organisations dont on ne
sait pas si elles existent encore (« ni date de fin, ni statut actif validé »).

Règles (prompt_maitre.md) : robots.txt lu et respecté avant toute page ; User-Agent avec l'adresse du dépôt
seulement ; une seconde au moins entre deux requêtes ; au plus 3 pages par site (accueil, puis « qui
sommes-nous », « histoire », « présentation »…) ; mentions légales repérées et signalées si elles interdisent
la reproduction ; tout est mis en cache (data/sortie/cache_sites.json) et rien n'est rechargé.

Un site parle de lui-même : ce qu'il dit de sa fondation ou de son activité est un candidat, jamais une
preuve automatique. Produit : data/manuel/sites_a_valider.csv (créé une fois, ensuite seules les nouvelles
lignes sont ajoutées). Colonnes : id, label, information (fondation ou derniere_activite), valeur, citation
(mot pour mot, texte de la page), url, consulte_le, note, decision (oui / non / vide).
"""
import csv
import datetime
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.robotparser

import requests

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SORTIE = os.path.join(RACINE, "data", "sortie")
MANUEL = os.path.join(RACINE, "data", "manuel")
CACHE = os.path.join(SORTIE, "cache_sites.json")
UA = "GeneaGauche/0.3 (https://github.com/srcchi/GeneaGauche) python-requests"
PAGES_MAX = 3
PAUSE = 1.5
RX_APROPOS = re.compile(r"qui[-_ ]?sommes|a[-_ ]?propos|à propos|presentation|présentation|historique|histoire|"
                        r"about|nous[-_ ]?connaitre|nous connaître|le[-_ ]parti|le[-_ ]mouvement|notre[-_ ]histoire", re.I)
RX_LEGAL = re.compile(r"mentions[-_ ]l[ée]gales|legal|cgu|conditions", re.I)
RX_INTERDIT = re.compile(r"reproduction[^.]{0,80}interdite|toute reproduction|aspiration|scraping|extraction "
                         r"(?:automatis|systémat)", re.I)
MOIS = "janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre"
RX_FONDATION = re.compile(r"(?:fond[ée]e?s?|cr[ée]{2}e?s?|cr[ée]ation|naissance|constitu[ée]e?s?|lanc[ée]e?s?|"
                          r"vu le jour|fondateur|existe depuis|né[es]? en)[^.]{0,120}?\b(1[89]\d\d|20[0-2]\d)\b"
                          r"|\b(1[89]\d\d|20[0-2]\d)\b[^.]{0,60}?(?:fond[ée]e?|cr[ée]{2}e?|naissance|constitu[ée]e?)", re.I)
RX_DATES = [re.compile(r"\b(\d{1,2})[/.-](\d{1,2})[/.-](20[0-2]\d)\b"),
            re.compile(rf"\b(\d{{1,2}})(?:er)?\s+({MOIS})\s+(20[0-2]\d)\b", re.I),
            re.compile(r"datetime=\"(20[0-2]\d)-(\d\d)-(\d\d)")]
NUM_MOIS = {m: i + 1 for i, m in enumerate("janvier février mars avril mai juin juillet août septembre octobre "
                                           "novembre décembre".split())}
NUM_MOIS.update(fevrier=2, aout=8, decembre=12)


def lire_json(chemin):
    if os.path.exists(chemin):
        with open(chemin, encoding="utf-8") as f:
            return json.load(f)
    return {}


cache = lire_json(CACHE)


def sauver():
    tmp = CACHE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False)
    for essai in range(8):
        try:
            os.replace(tmp, CACHE)
            return
        except OSError:
            time.sleep(0.5 * (essai + 1))


def charger(url):
    """Page en cache, sinon téléchargée une fois (statut, adresse finale, html)."""
    if url in cache:
        return cache[url]
    time.sleep(PAUSE)
    try:
        r = requests.get(url, headers={"User-Agent": UA}, timeout=25, allow_redirects=True)
        if r.status_code == 429:
            print(f"  429 sur {url} : on s'arrête là pour ce site (Retry-After : {r.headers.get('Retry-After')})")
            res = dict(statut=429, url=r.url, html="")
        else:
            r.encoding = r.encoding if r.encoding and r.encoding.lower() != "iso-8859-1" else r.apparent_encoding
            res = dict(statut=r.status_code, url=r.url, html=r.text if r.ok else "")
    except requests.RequestException as e:
        res = dict(statut=0, url=url, html="", erreur=str(e)[:200])
    res["consulte_le"] = datetime.date.today().isoformat()
    cache[url] = res
    sauver()
    return res


def robots(base):
    """robots.txt du site : None s'il est illisible (on n'en déduit aucune interdiction), sinon le parseur."""
    url = urllib.parse.urljoin(base, "/robots.txt")
    p = charger(url)
    rp = urllib.robotparser.RobotFileParser()
    if p["statut"] == 200:
        rp.parse(p["html"].splitlines())
    elif p["statut"] in (401, 403):
        rp.disallow_all = True
    else:
        rp.allow_all = True
    return rp


def texte(h):
    h = re.sub(r"(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", h)
    h = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</li>|</h\d>", "\n", h)
    t = html.unescape(re.sub(r"<[^>]+>", " ", h))
    return re.sub(r"[ \t\r\f\v]+", " ", re.sub(r"\n\s*\n+", "\n", t)).strip()


def liens(h, base):
    res = []
    for m in re.finditer(r'(?is)<a\s[^>]*href="([^"#]+)"[^>]*>(.*?)</a>', h):
        url = urllib.parse.urljoin(base, html.unescape(m.group(1)))
        if urllib.parse.urlparse(url).netloc == urllib.parse.urlparse(base).netloc:
            res.append((url, texte(m.group(2))))
    return res


def phrase_autour(t, debut, fin):
    g = max(t.rfind(".", 0, debut), t.rfind("\n", 0, debut)) + 1
    d = [x for x in (t.find(".", fin), t.find("\n", fin)) if x != -1]
    return t[g:(min(d) + 1 if d else len(t))].strip()[:400]


def derniere_date(h):
    meilleure = None
    for rx in RX_DATES:
        for m in rx.finditer(h):
            try:
                if rx is RX_DATES[0]:
                    d = datetime.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
                elif rx is RX_DATES[1]:
                    d = datetime.date(int(m.group(3)), NUM_MOIS[m.group(2).lower()], int(m.group(1)))
                else:
                    d = datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            except (ValueError, KeyError):
                continue
            if d <= datetime.date.today() and (meilleure is None or d > meilleure[0]):
                meilleure = (d, m.group(0))
    return meilleure


def main():
    statut = "--statut" in sys.argv
    raison = "ni date de fin, ni statut actif validé" if statut else "pas de date de fondation"
    with open(os.path.join(SORTIE, "a_dater.csv"), encoding="utf-8") as f:
        cibles = [r for r in csv.DictReader(f) if r["raison"] == raison]
    ent = lire_json(os.path.join(SORTIE, "cache_enrichissement.json")).get("entites", {})
    lignes, bilan = [], []
    for r in cibles:
        sites = (ent.get(r["id"]) or {}).get("site") or []
        if not sites:
            continue
        accueil = sites[0]
        rp = robots(accueil)
        if not rp.can_fetch(UA, accueil):
            bilan.append(f"{r['label']} : robots.txt interdit {accueil}")
            continue
        p = charger(accueil)
        if not p["html"]:
            bilan.append(f"{r['label']} : site injoignable ({p['statut']} {p.get('erreur', '')[:60]})")
            continue
        base = p["url"]
        pages = [(base, p)]
        candidats = [u for u, t in liens(p["html"], base) if RX_APROPOS.search(u) or RX_APROPOS.search(t)]
        legal = next((u for u, t in liens(p["html"], base) if RX_LEGAL.search(u) or RX_LEGAL.search(t)), None)
        note = []
        if legal and rp.can_fetch(UA, legal):
            pl = charger(legal)
            if pl["html"] and RX_INTERDIT.search(texte(pl["html"])):
                note.append(f"mentions légales restrictives ({legal}) : citation courte seulement")
        for u in list(dict.fromkeys(candidats))[:PAGES_MAX - 1]:
            if rp.can_fetch(UA, u):
                pu = charger(u)
                if pu["html"]:
                    pages.append((pu["url"], pu))
        vus = set()
        for url, pg in pages:
            t = texte(pg["html"])
            for m in RX_FONDATION.finditer(t):
                an = m.group(1) or m.group(2)
                ph = phrase_autour(t, m.start(), m.end())
                if (an, ph) in vus:
                    continue
                vus.add((an, ph))
                lignes.append([r["id"], r["label"], "fondation", an, ph, url, pg["consulte_le"], " ; ".join(note), ""])
        d = derniere_date(p["html"])
        if d:
            lignes.append([r["id"], r["label"], "derniere_activite", d[0].isoformat(), d[1], base, p["consulte_le"],
                           " ; ".join(note + ["date la plus récente lue sur l'accueil : indice d'activité, pas une preuve"]), ""])
        bilan.append(f"{r['label']} : {len(pages)} page(s), {sum(1 for x in lignes if x[0] == r['id'] and x[2] == 'fondation')} "
                     f"phrase(s) de fondation, dernière date {d[0].isoformat() if d else 'aucune'}")
    chemin = os.path.join(MANUEL, "sites_a_valider.csv")
    entetes = ["id", "label", "information", "valeur", "citation", "url", "consulte_le", "note", "decision"]
    existants = set()
    if os.path.exists(chemin):
        with open(chemin, encoding="utf-8") as f:
            existants = {(x["id"], x["information"], x["valeur"], x["citation"]) for x in csv.DictReader(f)}
    nouvelles = [l for l in lignes if (l[0], l[2], l[3], l[4]) not in existants]
    neuf = not os.path.exists(chemin)
    with open(chemin, "a", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        if neuf:
            w.writerow(entetes)
        w.writerows(nouvelles)
    for b in bilan:
        print(" ", b)
    print(f"{len(cibles)} organisations « {raison} », {len(bilan)} avec un site ; {len(lignes)} candidats, "
          f"{len(nouvelles)} nouveaux dans data/manuel/sites_a_valider.csv")


if __name__ == "__main__":
    main()
