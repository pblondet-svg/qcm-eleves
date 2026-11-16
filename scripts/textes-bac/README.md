# Textes du bac (entraînement au paragraphe argumenté)

Source : *Recueil des sujets d'explication de texte de l'épreuve de philosophie au baccalauréat, 1996-2024*
(Paul Hamel, IAN de philosophie, académie de Montpellier), mis à jour chaque année.

Pour mettre à jour `public/data/textes-bac.json` avec une nouvelle édition du recueil (PDF) :

```bash
mkdir -p pdf && cp Recueil.pdf pdf/textes.pdf
pdftotext -layout pdf/textes.pdf pdf/tout.txt
python3 scripts/textes-bac/parse_index.py     # index des notions (programme 2020) → notions_index.json
python3 scripts/textes-bac/parse_textes.py    # un texte par page → textes_bac.json
python3 scripts/textes-bac/export.py textes_bac.json
```

Chaque texte : auteur, référence, session, série (« techno » quand il a des questions), notions du programme 2020,
texte, notes de bas de page, questions.
