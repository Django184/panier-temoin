-- =====================================================================
-- Panier Témoin — contrôle des migrations 4 à 9 sur la base de production
--
-- LECTURE SEULE : rien n'est créé, modifié ni supprimé.
-- À coller dans Supabase → SQL Editor → New query, puis « Run ».
-- Résultat attendu : sept lignes, toutes avec « executee » à true.
-- Une ligne à false = la migration correspondante n'a pas été exécutée.
-- =====================================================================

select migration, executee
from (values
  (4, '4 · lecture_ia (méthode de saisie acceptée)',
      exists (select 1 from pg_constraint
              where conname = 'tickets_methode_check'
                and pg_get_constraintdef(oid) like '%lecture_ia%')),
  (5, '5 · carte_cumulus (table)',
      to_regclass('public.carte_cumulus') is not null),
  (6, '6 · carte_cumulus_numero (colonne numero)',
      exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'carte_cumulus' and column_name = 'numero')),
  (7, '7 · derniers_achats (fonction)',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'derniers_achats')),
  (8, '8 · courses_partagees (tables)',
      to_regclass('public.courses_articles') is not null
      and to_regclass('public.recettes') is not null),
  (8.5, '8 · courses_partagees (diffusion en direct entre les téléphones)',
      (select count(*) from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public'
         and tablename in ('courses_articles', 'recettes')) = 2),
  (9, '9 · catalogue_prix (derniers_achats jusqu''à 1000 produits)',
      exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'derniers_achats'
                and pg_get_functiondef(p.oid) like '%, 1000)%'))
) as controle(numero, migration, executee)
order by numero;
