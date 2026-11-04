# Changelog

Évolutions notables de Panier Témoin. Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versionnement sémantique.
La version est définie dans `package.json` et affichée en bas de Réglages.

## [0.7.0] - 2026-11-04

Nouvelle adresse : **https://panier-temoin.pages.dev** (Cloudflare Pages), sur une origine propre à l'app : la session et la carte Cumulus ne sont plus lisibles par les autres apps de `django184.github.io`. L'ancienne adresse garde la version 0.6.0 jusqu'à son remplacement par le passeur.

### Ajouté
- Reprise depuis l'ancienne adresse (`#/demenagement/…`) : réglages, couleur, adresses des projets Claude, brouillon de ticket et changements de liste pas encore envoyés (envoyés après la connexion). Une donnée déjà présente n'est jamais écrasée ; la session Supabase et la carte Cumulus ne sont jamais transmises. Un message reste affiché sur la liste.
- Passeur de l'ancienne adresse (`passeur/`, publié à la main par le workflow « Passeur de l'ancienne adresse ») : il transmet ces données et désinstalle l'ancienne app (caches de l'app effacés, service worker désinscrit), sans toucher aux autres apps de l'origine. Les liens envoyés par Claude vers l'ancienne adresse suivent tels quels.
- Identifiant du manifeste (`id`).
- `version.json` publié avec l'app (version et commit), lu par la CI.
- Tests : réception du déménagement (`src/lib/demenagement.test.ts`), changement d'adresse de bout en bout (`scripts/demenagement.mjs`), vérification du site publié (`scripts/en_ligne.mjs`).

### Modifié
- Les liens renvoyés par les projets Claude (tickets et Chef Feta) pointent vers la nouvelle adresse : **recopier les instructions des deux projets depuis Réglages**. Adresse centralisée dans `src/config.ts` (`ADRESSE_APP`).
- Publication sur Cloudflare Pages au lieu de GitHub Pages, puis vérification du site publié ; résultat de la CI sur la branche `ci-statut`.

### Sécurité
- Vrais en-têtes HTTP (`_headers`, générés au build depuis la même CSP que la balise `<meta>`) : `frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.

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
