# Panier Témoin

Application web installable (PWA) pour suivre l’évolution des prix de supermarché à partir de tickets de caisse : photo du ticket, lecture automatique par un modèle d’image, vérification ligne par ligne, puis courbes de prix, comparaison des magasins, promotions et indice de panier.

**Panier Témoin est un projet indépendant. Il n’est ni affilié à Migros ni soutenu par Migros ou la Fédération des coopératives Migros.** Les noms de magasins et de produits proviennent des tickets des utilisateurs.

Adresse de l’app : **https://django184.github.io/panier-temoin/**

## Sommaire

1. [Fonctionnement](#fonctionnement)
2. [Mise en place pas à pas](#mise-en-place-pas-à-pas)
3. [Installer l’app sur le téléphone](#installer-lapp-sur-le-téléphone)
4. [Entretien](#entretien)
5. [Coûts](#coûts)
6. [Développer sur sa machine](#développer-sur-sa-machine)
7. [Limites connues et pistes](#limites-connues-et-pistes)

## Fonctionnement

```
Téléphone (PWA)                     GitHub                         Supabase (Zurich)
  photo du ticket ──────────────────────────────────────────────→ fonction lire-ticket
                                                                    (session vérifiée) ──→ Mistral
  ← lignes lues (JSON) ←─────────────────────────────────────────── (plan gratuit, UE)
  → vérification ligne par ligne    Pages : sert l'app             Auth : 2 comptes, mot de passe
  → envoi des seules lignes validées ─────────────────────────────→ Postgres + RLS :
                                    Actions : tests, build,          soumettre_ticket (doublons,
                                      publication, déploiement       aberrations), statistiques
  ← courbes, comparaisons, paniers ←──────────────────────────────── fonctions publiques
```

- La photo, réduite à 2000 pixels, passe par la fonction `lire-ticket` de Supabase, qui la transmet à Mistral (`mistral-small-latest`) et renvoie les lignes lues. Ni la fonction ni l’app ne conservent l’image. La consigne demande de ne jamais recopier le numéro Cumulus ni les données de paiement, et l’app ne les enregistre pas.
- La clé Mistral reste dans les secrets de Supabase ; la fonction n’accepte que les utilisateurs connectés.
- Toute écriture passe par la fonction `soumettre_ticket`, qui refuse les doublons et met de côté les prix inhabituels.
- La consultation des prix est ouverte sans compte ; l’ajout de tickets est réservé aux comptes créés à la main.

| Dossier | Contenu |
| --- | --- |
| `supabase/migrations/` | Schéma, sécurité (RLS), fonctions de la base |
| `supabase/tests/` | Tests SQL (éditeur Supabase ou Postgres local) |
| `supabase/demo/` | Historique fictif de 12 mois, contrôle et suppression |
| `supabase/functions/lire-ticket/` | Fonction de lecture du ticket (Deno), appel à Mistral |
| `src/lib/` | Contrôles arithmétiques, lecture de la réponse JSON, tests |
| `src/lecture/` | Réduction de la photo et appel à la fonction de lecture |
| `src/ecrans/`, `src/composants/` | Interface |
| `.github/workflows/` | Tests, build, publication, maintien de Supabase |
| `docs/checklist-telephone.md` | Tests à faire sur iPhone et Android |

## Mise en place pas à pas

Ces étapes ont déjà été faites pour ce dépôt ; elles servent à tout réinstaller.

### 1. Supabase

1. Créer un projet sur [supabase.com](https://supabase.com), plan gratuit, région **Central Europe (Zurich)**. Le choix « Europe » général ne garantit pas la Suisse.
2. Dans l’**éditeur SQL**, exécuter dans l’ordre, une seule fois chacun, les quatre fichiers de `supabase/migrations/`.
3. Exécuter `supabase/tests/tests_backend.sql`. Résultat attendu : une ligne « Tous les tests sont passés (56 vérifications) ». La base n’est pas modifiée.
4. Dans **Authentication** : désactiver l’inscription de nouveaux utilisateurs, puis créer les comptes (**Users → Add user → Create new user**, avec « Auto Confirm User »).
5. Dans **Project Settings → API keys**, relever l’URL du projet et la clé « publishable », puis les reporter dans `src/config.ts` et dans `.github/workflows/maintien-supabase.yml`. Ne jamais utiliser la clé secrète dans l’app.

### 2. GitHub

1. Dépôt **public** (GitHub Pages gratuit n’est disponible que pour les dépôts publics). Le code ne contient aucun secret : la clé « publishable » est faite pour être publique.
2. **Settings → Pages → Source : GitHub Actions**.
3. Chaque envoi sur `main` lance le workflow « Tests et publication » :
   - backend : migrations, tests SQL et démonstration sur Postgres 16 ;
   - app : tests du lecteur, vérification des types, build ;
   - publication sur GitHub Pages si tout est vert ;
   - déploiement de la fonction `lire-ticket` sur Supabase, avec la clé Mistral.
4. **Settings → Secrets and variables → Actions → New repository secret**, deux secrets :
   - `MISTRAL_API_KEY` : clé créée sur [console.mistral.ai](https://console.mistral.ai), plan gratuit « Experiment » (vérification par numéro de téléphone, sans carte bancaire) ;
   - `SUPABASE_ACCESS_TOKEN` : jeton personnel créé dans Supabase, **Account → Access Tokens**.
   Sans eux, l’app est publiée mais la lecture automatique répond « service non configuré » ; la saisie à la main et l’import par l’app Claude restent possibles.
5. Le workflow « Maintien Supabase » interroge la base deux fois par semaine pour éviter la mise en pause du projet gratuit.

### 3. Données de démonstration (facultatif)

`supabase/demo/donnees_demo.sql` ajoute 137 tickets fictifs sur 12 mois dans trois magasins « Démo ». Pratique pour voir les graphiques avant d’avoir de vrais tickets. **La consultation étant publique, les supprimer avant l’usage réel** avec `supabase/demo/purge_demo.sql`.

## Installer l’app sur le téléphone

**iPhone (Safari)** : ouvrir l’adresse de l’app, bouton Partager, « Sur l’écran d’accueil », laisser « Ouvrir comme app web » activé, « Ajouter ».

**Android (Chrome)** : ouvrir l’adresse, menu ⋮, « Installer l’application ».

Puis se connecter dans l’onglet Profil avec l’e-mail et le mot de passe du compte. La liste des vérifications à faire sur chaque téléphone est dans [`docs/checklist-telephone.md`](docs/checklist-telephone.md).

## Entretien

| Situation | Que faire |
| --- | --- |
| E-mail de GitHub : tâche planifiée désactivée | GitHub coupe les tâches planifiées d’un dépôt inactif depuis 60 jours. Onglet **Actions → Maintien Supabase → Enable workflow**. |
| Projet Supabase en pause | Tableau de bord Supabase, bouton de reprise du projet. Vérifier ensuite que la tâche de maintien est active. |
| Mot de passe oublié | Tableau de bord Supabase, **Authentication → Users**, réinitialiser ou recréer le compte. |
| Un prix est mis de côté à tort | Dans l’app, onglet Profil, « Prix à confirmer ». |
| Un ticket a été mal saisi | Profil, supprimer le ticket, puis le saisir à nouveau. |
| Deux fiches pour un même produit | Renommer l’une des deux depuis sa fiche ; le regroupement de fiches se fait dans l’éditeur SQL (`update observations_prix set produit_id = …`). |
| Nouvelle version de l’app | Envoyer sur `main` ; l’app affiche « Une nouvelle version est disponible ». |

## Coûts

Coût d’exploitation : **0 CHF par mois** pour deux utilisateurs.

| Service | Offre | Usage prévu | Coût |
| --- | --- | --- | --- |
| Supabase (Zurich) | Plan gratuit : base de 500 Mo, 50 000 utilisateurs actifs par mois ; pause après une semaine sans activité | Environ 3 Ko par ticket : 500 Mo représentent plus de 100 000 tickets | 0 CHF |
| GitHub Pages | Gratuit pour un dépôt public ; site de 1 Go au plus, 100 Go de trafic par mois (limite souple) | Moins de 1 Mo | 0 CHF |
| GitHub Actions | Gratuit pour un dépôt public avec les machines standard | Quelques minutes par envoi, deux courtes tâches par semaine | 0 CHF |
| Supabase Edge Functions | Comprises dans le plan gratuit (500 000 appels par mois) | Un appel par ticket | 0 CHF |
| Lecture des tickets (Mistral) | Plan gratuit « Experiment », limité en débit ; pas de carte bancaire, donc aucune facturation possible | Un appel par ticket, quelques secondes | 0 CHF |
| Import par l’app Claude (secours) | Compris dans un abonnement Claude existant | Ponctuel | 0 CHF supplémentaire |

Pourquoi Mistral : l’API Claude est facturée à part de l’abonnement Claude Pro, et les conditions du plan gratuit de Gemini en interdisent l’usage pour des utilisateurs en Suisse et dans l’UE. Sur le plan gratuit, Mistral indique que les requêtes peuvent servir à entraîner ses modèles ; on peut s’y opposer depuis les réglages de confidentialité du compte Mistral ([politique d’entraînement](https://help.mistral.ai/en/articles/323757-do-you-use-my-user-data-to-train-your-artificial-intelligence-models)). C’est une raison de plus pour replier le bas du ticket.

Sources : [tarifs Supabase](https://supabase.com/pricing), [limites de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits), [facturation de GitHub Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [plan Experiment de Mistral](https://help.mistral.ai/en/articles/450104-how-can-i-try-the-api-for-free-with-the-experiment-plan), relevés du 13 octobre 2026.

Seul déclencheur de coût prévisible : passer au plan Supabase Pro (25 USD par mois) pour supprimer la mise en pause, inutile tant que la tâche de maintien fonctionne.

## Développer sur sa machine

Prérequis : Node.js 22.18 ou plus.

```bash
npm install
npm run dev        # app sur http://localhost:5173/panier-temoin/
npm test           # tests du lecteur de ticket (sans dépendance)
npm run build      # vérification des types et build de production
```

Tests du backend sur un Postgres local (15 ou plus, avec les extensions `contrib`) :

```bash
supabase/tests/local/executer.sh /usr/lib/postgresql/16/bin
```

## Limites connues et pistes

- **Lecture automatique.** Le modèle lit bien les tickets nets ; les contrôles arithmétiques signalent toute ligne incohérente, à corriger avant l’envoi. Si Mistral change son plan gratuit, la saisie à la main et l’import par l’app Claude restent disponibles.
- **Articles pesés.** Le poids n’est pas imprimé : il est déduit du total et du prix au kilo, et la ligne est marquée à confirmer.
- **Comparaison entre magasins.** Pour les fruits et légumes, elle porte sur 60 jours, sinon la saison des visites fausserait l’écart.
- **Pistes hors MVP** : alertes de prix et notifications (Web Push, possible sur iPhone seulement pour l’app installée), export des données en CSV.
