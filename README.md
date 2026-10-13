# Panier Témoin

Application indépendante pour suivre l'évolution des prix de supermarché à partir de tickets de caisse.

**Panier Témoin n'est ni affilié à Migros ni soutenu par Migros ou la Fédération des coopératives Migros.** Les noms de magasins et de produits cités proviennent des tickets des utilisateurs.

## État du dépôt

| Phase | Contenu | État |
| --- | --- | --- |
| 1 | Cadrage | validé |
| 2 | Backend Supabase : migrations, RLS, fonctions, tests, démonstration | livré |
| 3 | Application : capture, lecture, validation, consultation | à venir |
| 4 | Statistiques et graphiques | à venir |
| 5 | Guide de déploiement complet, tests sur téléphone, coûts | à venir |

## Structure

```
supabase/
  migrations/
    20261013000001_schema.sql      tables, types, index
    20261013000002_rls.sql         sécurité au niveau des lignes
    20261013000003_fonctions.sql   envoi de ticket, contrôles, statistiques
  tests/
    tests_backend.sql              tests à coller dans l'éditeur SQL (base non modifiée)
    local/
      supabase_minimal.sql         imitation de Supabase pour un Postgres local
      executer.sh                  exécution complète sur une instance jetable
  demo/
    donnees_demo.sql               12 mois d'historique fictif (3 magasins « Démo »)
    verifier_demo.sql              contrôle de cet historique
    purge_demo.sql                 suppression de l'historique fictif
```

## Installer le backend

1. Créer un projet sur [supabase.com](https://supabase.com), plan gratuit, région **Central Europe (Zurich)**.
2. Dans le tableau de bord, ouvrir l'éditeur SQL et exécuter, dans l'ordre, les trois fichiers de `supabase/migrations/`.
3. Exécuter `supabase/tests/tests_backend.sql`. Si tout passe, le résultat est une ligne « Tous les tests sont passés (56 vérifications) » ; sinon l'éditeur affiche une erreur « ÉCHEC : … ». Tout est annulé à la fin : la base reste vide.
4. Dans les réglages d'authentification, désactiver l'inscription de nouveaux utilisateurs, puis créer à la main les deux comptes (e-mail et mot de passe).
5. Facultatif : exécuter `supabase/demo/donnees_demo.sql` pour disposer d'un historique fictif. Le supprimer avec `supabase/demo/purge_demo.sql` avant d'utiliser l'application pour de bon : la consultation est publique.

## Tester sur sa machine (facultatif)

Avec Postgres 15 ou plus et ses extensions `contrib` :

```bash
supabase/tests/local/executer.sh /usr/lib/postgresql/16/bin
```

Le script crée une instance temporaire, applique les migrations, lance les tests, génère, contrôle puis purge la démonstration, et supprime l'instance.
