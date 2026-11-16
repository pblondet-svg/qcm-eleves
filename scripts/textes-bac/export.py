# Convertit textes_bac.json (sortie de parse_textes.py) en public/data/textes-bac.json pour le site.
import json, sys
ART = {"Art": "L'art", "Bonheur": "Le bonheur", "Conscience": "La conscience", "Devoir": "Le devoir", "État": "L'État",
       "Inconscient": "L'inconscient", "Justice": "La justice", "Langage": "Le langage", "Liberté": "La liberté",
       "Nature": "La nature", "Raison": "La raison", "Religion": "La religion", "Science": "La science",
       "Technique": "La technique", "Temps": "Le temps", "Travail": "Le travail", "Vérité": "La vérité"}
d = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "textes_bac.json"))
out = [{"id": "bac-%d" % o["page"], "auteur": o["auteur"], "reference": o["reference"], "session": o["session"],
        "serie": o["serie"], "notions": [ART[n] for n in o["notions"]], "texte": o["texte"], "notes": o["notes"],
        "questions": o["questions"]} for o in d]
json.dump({"source": "Recueil des sujets d'explication de texte de l'épreuve de philosophie au baccalauréat, 1996-2024 "
                     "(Paul Hamel, IAN de philosophie, académie de Montpellier)", "textes": out},
          open("public/data/textes-bac.json", "w"), ensure_ascii=False, separators=(",", ":"))
print(len(out), "textes")
