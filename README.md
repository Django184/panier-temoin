# Panier Témoin

Application web installable (PWA) pour suivre l’évolution des prix de supermarché à partir de tickets de caisse : photo du ticket lue par Claude dans un projet de l’utilisateur, vérification ligne par ligne, puis courbes de prix, comparaison des magasins, promotions et indice de panier.

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
Téléphone                                                        Supabase (Zurich)
  Panier Témoin ── « Photographier le ticket » ──→ projet Claude   Auth : 2 comptes, mot de passe
                                                   (photo, lecture)
  écran de vérification ←── lien « Ouvrir dans Panier Témoin »
  → envoi des seules lignes validées ────────────────────────────→ Postgres + RLS :
                                                                     soumettre_ticket (doublons,
  ← courbes, comparaisons, paniers ←──────────────────────────────── aberrations), statistiques
GitHub : Pages sert l'app ; Actions teste, construit, publie et maintient Supabase éveillé.
```

- La photo est lue par Claude, dans un projet du compte Claude de l’utilisateur (abonnement existant, sans frais supplémentaires). L’app ne voit jamais la photo.
- Les instructions du projet (`INSTRUCTIONS_PROJET` dans `src/lib/importClaude.ts`, copiables depuis l’app) font répondre Claude par un lien `https://django184.github.io/panier-temoin/#/import/{…}` qui contient le ticket lu au format JSON compact. Le lien rouvre l’app sur l’écran de vérification. Le même JSON est donné dans un bloc de code : « Coller la réponse de Claude » le reprend si le lien ne s’ouvre pas.
- Les instructions interdisent à Claude de recopier le numéro Cumulus et les données de paiement, et l’app ne les enregistre pas.
- Toute écriture passe par la fonction `soumettre_ticket`, qui refuse les doublons et met de côté les prix inhabituels.
- La consultation des prix est ouverte sans compte ; l’ajout de tickets est réservé aux comptes créés à la main.

| Dossier | Contenu |
| --- | --- |
| `supabase/migrations/` | Schéma, sécurité (RLS), fonctions de la base |
| `supabase/tests/` | Tests SQL (éditeur Supabase ou Postgres local) |
| `supabase/demo/` | Historique fictif de 12 mois, contrôle et suppression |
| `src/lib/` | Instructions du projet Claude, lecture de sa réponse, contrôles arithmétiques, tests |
| `src/lecture/` | Adresse du projet Claude, arrivée des liens d’import |
| `src/ecrans/`, `src/composants/` | Interface |
| `.github/workflows/` | Tests, build, publication, maintien de Supabase |
| `src/lib/ean13.ts` | Carte Cumulus : code-barres EAN-13 du numéro de carte, relu par zxing-cpp en intégration continue |
| `src/lib/courses.ts` | Liste de courses : lecture des recettes de Chef Feta, parcours du magasin |
| `docs/checklist-telephone.md` | Tests à faire sur iPhone et Android |

## Écrans

| Onglet | Rôle |
| --- | --- |
| Courses | Liste de courses rangée selon le parcours du magasin, à cocher. Bouton Chef Feta, historique des recettes, mode « Modifier ». |
| Recette | Affiché quand une recette est dans la liste : ingrédients, étapes, astuces, portions ; modification à la main, puis adaptation de la liste. |
| Carte | Carte Cumulus du foyer : code-barres du numéro de carte, identique à celui de l’app Migros (points crédités ; bons bleus via l’app Migros). |
| Ticket | Bouton « Photographier le ticket » (projet Claude), puis vérification et envoi. |
| Prix | Recherche, favoris, derniers achats avec l’écart depuis l’achat précédent ; fiches produit et paniers types. |
| Réglages | Aides activables, projets Claude, prix à confirmer, tickets envoyés, installation, confidentialité, compte. |

Tickets, prix, carte Cumulus, liste de courses et recettes sont dans Supabase ; la liste et les recettes sont partagées par les comptes du foyer, en direct, avec une copie sur chaque téléphone pour les courses sans réseau (`src/donnees/synchro.ts`). Les préférences d’affichage restent sur le téléphone.

## Mise en place pas à pas

Ces étapes ont déjà été faites pour ce dépôt ; elles servent à tout réinstaller.

### 1. Supabase

1. Créer un projet sur [supabase.com](https://supabase.com), plan gratuit, région **Central Europe (Zurich)**. Le choix « Europe » général ne garantit pas la Suisse.
2. Dans l’**éditeur SQL**, exécuter dans l’ordre, une seule fois chacun, les fichiers de `supabase/migrations/`, dans l’ordre de leur nom.
3. Exécuter `supabase/tests/tests_backend.sql`. Résultat attendu : une ligne « Tous les tests sont passés (62 vérifications) ». La base n’est pas modifiée.
4. Dans **Authentication** : désactiver l’inscription de nouveaux utilisateurs, puis créer les comptes (**Users → Add user → Create new user**, avec « Auto Confirm User »).
5. Dans **Project Settings → API keys**, relever l’URL du projet et la clé « publishable », puis les reporter dans `src/config.ts` et dans `.github/workflows/maintien-supabase.yml`. Ne jamais utiliser la clé secrète dans l’app.

### 2. GitHub

1. Dépôt **public** (GitHub Pages gratuit n’est disponible que pour les dépôts publics). Le code ne contient aucun secret : la clé « publishable » est faite pour être publique.
2. **Settings → Pages → Source : GitHub Actions**.
3. Chaque envoi sur `main` lance le workflow « Tests et publication » :
   - backend : migrations, tests SQL et démonstration sur Postgres 16 ;
   - app : tests du lecteur, vérification des types, build ;
   - publication sur GitHub Pages si tout est vert.
4. Aucun secret n’est nécessaire.
5. Le workflow « Maintien Supabase » interroge la base deux fois par semaine pour éviter la mise en pause du projet gratuit.

### 3. Projet Claude (une fois par utilisateur)

Dans l’app : onglet **Ajouter → Configurer le projet Claude** (ou onglet Profil). L’écran guide les trois étapes : créer un projet « Panier Témoin » sur claude.ai, y coller les instructions copiées depuis l’app, puis coller l’adresse du projet (`https://claude.ai/project/…`) dans l’app. L’adresse est gardée dans le navigateur du téléphone.

### 4. Données de démonstration (facultatif)

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
| Lecture des tickets (Claude) | Projet Claude dans un abonnement Claude existant, dans ses limites d’usage | Un message par ticket | 0 CHF supplémentaire |

Pourquoi un projet Claude et pas une lecture automatique par API : l’API Claude est facturée à part de l’abonnement, les conditions du plan gratuit de Gemini en interdisent l’usage en Suisse et dans l’UE, et l’offre gratuite de Mistral, essayée, n’a pas donné de lecture fiable.

Sources : [tarifs Supabase](https://supabase.com/pricing), [limites de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits), [facturation de GitHub Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions), relevés du 13 octobre 2026.

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

- **Lecture par Claude.** Le passage par l’app Claude demande quelques gestes : ouvrir le projet, prendre la photo, toucher le lien. Selon le téléphone, le lien du projet s’ouvre dans l’app Claude ou dans le navigateur. Les contrôles arithmétiques signalent toute ligne incohérente avant l’envoi.
- **Articles pesés.** Le poids n’est pas imprimé : il est déduit du total et du prix au kilo, et la ligne est marquée à confirmer.
- **Comparaison entre magasins.** Pour les fruits et légumes, elle porte sur 60 jours, sinon la saison des visites fausserait l’écart.
- **Pistes hors MVP** : alertes de prix et notifications (Web Push, possible sur iPhone seulement pour l’app installée), export des données en CSV.
