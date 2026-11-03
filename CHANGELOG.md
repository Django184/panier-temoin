# Changelog

Évolutions notables de Panier Témoin. Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versionnement sémantique.
La version est définie dans `package.json` et affichée en bas de Réglages.

## [0.6.0] - 2026-11-03

### Ajouté
- Numéro de version affiché en bas de Réglages.
- Le workflow de publication parcourt l'app construite (scénarios de `scripts/captures.mjs`) et bloque la publication en cas de violation de la politique de sécurité ou d'erreur de page.
- Dependabot : mises à jour des dépendances npm et des actions GitHub signalées chaque mois.

### Sécurité
- Politique de sécurité du contenu (CSP) en balise `<meta>`, ajoutée au build : seuls les fichiers de l'app et le projet Supabase (HTTPS et Realtime) sont autorisés.
- `Referrer-Policy: strict-origin-when-cross-origin` en balise `<meta>`.

## [0.5.0] - 2026-10-31

Historique reconstitué d'après le journal du projet (le numéro de version n'avait pas changé depuis la création).

- 2026-10-31 · Couleur d'accent au choix dans Réglages : bleu, vert, rouge, rose, fuchsia.
- 2026-10-31 · Dépôt passé en privé puis remis en public ; app republiée.
- 2026-10-19 · Catalogue des prix (migration 9) ; interface sans aide ; ingrédients hors liste, recettes sans doublon, historique cochable ; code Aztec retiré.
- 2026-10-14 · Courses et recettes partagées en direct (migration 8) ; code-barres de la carte identique à celui de l'app Migros.
- 2026-10-13 · Schéma, RLS, fonctions, carte Cumulus, derniers achats (migrations 1 à 7).
