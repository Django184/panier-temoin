-- =====================================================================
-- Panier Témoin — tests du backend
--
-- Exécution : coller ce fichier dans l'éditeur SQL du tableau de bord
-- Supabase et lancer. Tout se passe dans une transaction annulée à la
-- fin : la base n'est pas modifiée. La première vérification qui échoue
-- arrête tout avec une erreur « ÉCHEC : … ». Si tout passe, le résultat
-- affiché est une ligne « Tous les tests sont passés ».
-- (Les messages « OK : … » s'affichent avec psql ; l'éditeur SQL de
-- Supabase ne les montre pas.)
--
-- Données : les deux tickets réels du 12 octobre 2026 (MM Métropole
-- Renens), plus quelques tickets synthétiques datés par rapport au jour
-- d'exécution, pour que les tests restent valables dans le temps.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Outils
-- ---------------------------------------------------------------------
create function pg_temp.verifier(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'ÉCHEC : %', p_message;
  end if;
  raise notice 'OK : %', p_message;
end;
$$;

-- Deux comptes de test (supprimés par le rollback final)
insert into auth.users (id, email, aud, role) values
  ('11111111-1111-4111-8111-111111111111', 'test-a@panier-temoin.invalid', 'authenticated', 'authenticated'),
  ('22222222-2222-4222-8222-222222222222', 'test-b@panier-temoin.invalid', 'authenticated', 'authenticated');

select set_config('test.compte_a', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select set_config('test.compte_b', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

-- Ticket réel n° 1 : 12.10.2026, 12:43:59, total 6.40
select set_config('test.ticket1', $json$
{
  "magasin": {"numero_filiale": "064590", "nom": "MM Métropole Renens", "format": "MM",
              "localite": "Renens", "canton": "VD"},
  "date": "2026-10-12", "heure": "12:43:59", "total_centimes": 640, "rabais_total_centimes": 0,
  "methode": "lecture_ia",
  "lignes": [
    {"libelle_brut": "Poivrons rouges", "produit_nom": "Poivrons rouges", "unite": "kg",
     "quantite": 0.303, "prix_normal_centimes": 380, "total_centimes": 115},
    {"libelle_brut": "MClass fromage salade", "produit_nom": "MClass fromage salade", "unite": "piece",
     "quantite": 1, "prix_normal_centimes": 190, "total_centimes": 190},
    {"libelle_brut": "Migros lait coco light", "produit_nom": "Migros lait coco light", "unite": "piece",
     "quantite": 1, "prix_normal_centimes": 140, "total_centimes": 140},
    {"libelle_brut": "MClass YogQuark", "produit_nom": "MClass YogQuark", "unite": "piece",
     "quantite": 1, "prix_normal_centimes": 195, "total_centimes": 195}
  ]
}
$json$, true);

-- Ticket réel n° 2 : 12.10.2026, 19:00:05, total 24.60, rabais 4.00
select set_config('test.ticket2', $json$
{
  "magasin": {"numero_filiale": "064590", "nom": "MM Métropole Renens", "format": "MM",
              "localite": "Renens", "canton": "VD"},
  "date": "2026-10-12", "heure": "19:00:05", "total_centimes": 2460, "rabais_total_centimes": 400,
  "methode": "import_claude",
  "lignes": [
    {"libelle_brut": "Agnesi Linguine N.10", "produit_nom": "Agnesi Linguine N.10", "unite": "piece",
     "quantite": 3, "prix_normal_centimes": 240, "rabais_centimes": 288, "total_centimes": 432},
    {"libelle_brut": "Bio lentilles rouges", "produit_nom": "Bio lentilles rouges", "unite": "piece",
     "quantite": 2, "prix_normal_centimes": 280, "rabais_centimes": 112, "total_centimes": 448},
    {"libelle_brut": "MBud gnocchi", "produit_nom": "MBud gnocchi", "unite": "piece",
     "quantite": 1, "prix_normal_centimes": 195, "total_centimes": 195},
    {"libelle_brut": "Bio Feta", "produit_nom": "Bio Feta", "unite": "piece",
     "quantite": 1, "prix_normal_centimes": 320, "total_centimes": 320},
    {"libelle_brut": "Aubergines", "produit_nom": "Aubergines", "unite": "kg",
     "quantite": 0.5, "prix_normal_centimes": 400, "total_centimes": 200},
    {"libelle_brut": "Bio yogourt nature", "produit_nom": "Bio yogourt nature", "unite": "piece",
     "quantite": 1, "prix_normal_centimes": 140, "total_centimes": 140},
    {"libelle_brut": "Bio courgettes", "produit_nom": "Bio courgettes", "unite": "piece",
     "quantite": 1, "prix_normal_centimes": 330, "total_centimes": 330},
    {"libelle_brut": "Bio Fairtrade bananes", "produit_nom": "Bio Fairtrade bananes", "unite": "kg",
     "quantite": 0.881, "prix_normal_centimes": 295, "total_centimes": 260},
    {"libelle_brut": "Pommes rou. douce Gala", "produit_nom": "Pommes rou. douce Gala", "unite": "kg",
     "quantite": 0.482, "prix_normal_centimes": 280, "total_centimes": 135}
  ]
}
$json$, true);

-- =====================================================================
-- 1. Visiteur anonyme : ne peut pas envoyer de ticket
-- =====================================================================
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
begin
  perform public.soumettre_ticket(current_setting('test.ticket1')::jsonb);
  raise exception 'ÉCHEC : un anonyme a pu envoyer un ticket';
exception
  when insufficient_privilege then
    raise notice 'OK : un anonyme ne peut pas appeler soumettre_ticket';
end $$;

-- =====================================================================
-- 2. Compte A : envoi du ticket réel n° 1
-- =====================================================================
reset role;
set local role authenticated;
select set_config('request.jwt.claims', current_setting('test.compte_a'), true);

select set_config('test.r1', public.soumettre_ticket(current_setting('test.ticket1')::jsonb)::text, true);

reset role;
do $$
declare
  r jsonb := current_setting('test.r1')::jsonb;
  o record;
begin
  perform pg_temp.verifier(r ->> 'statut' = 'ok', 'ticket 1 accepté');
  perform pg_temp.verifier((r ->> 'nb_lignes')::int = 4, 'ticket 1 : 4 lignes');
  perform pg_temp.verifier(
    exists (select 1 from public.magasins
             where numero_filiale = '064590' and nom = 'MM Métropole Renens' and canton = 'VD'),
    'magasin créé à partir du ticket');
  select * into o from public.observations_prix
   where ticket_id = (r ->> 'ticket_id')::uuid and num_ligne = 1;
  perform pg_temp.verifier(o.unite = 'kg' and o.quantite = 0.303 and o.prix_paye_centimes = 380,
    'poivrons pesés : 0,303 kg, prix payé 3.80 le kg');
  perform pg_temp.verifier(o.contributeur_id = '11111111-1111-4111-8111-111111111111',
    'la ligne porte l''identifiant du compte A');
end $$;

-- =====================================================================
-- 3. Doublons : même ticket renvoyé par A puis par B
-- =====================================================================
set local role authenticated;
select set_config('request.jwt.claims', current_setting('test.compte_a'), true);
select set_config('test.r1bis', public.soumettre_ticket(current_setting('test.ticket1')::jsonb)::text, true);

select set_config('request.jwt.claims', current_setting('test.compte_b'), true);
select set_config('test.r1ter', public.soumettre_ticket(current_setting('test.ticket1')::jsonb)::text, true);

reset role;
do $$
begin
  perform pg_temp.verifier(current_setting('test.r1bis')::jsonb ->> 'statut' = 'doublon',
    'ticket 1 renvoyé par A : doublon');
  perform pg_temp.verifier(current_setting('test.r1ter')::jsonb ->> 'statut' = 'doublon',
    'ticket 1 envoyé par B : doublon');
  perform pg_temp.verifier((select count(*) from public.tickets) = 1, 'un seul ticket en base');
end $$;

-- =====================================================================
-- 4. Compte B : envoi du ticket réel n° 2 (promotions, articles pesés)
-- =====================================================================
set local role authenticated;
select set_config('request.jwt.claims', current_setting('test.compte_b'), true);
select set_config('test.r2', public.soumettre_ticket(current_setting('test.ticket2')::jsonb)::text, true);

reset role;
do $$
declare
  r       jsonb := current_setting('test.r2')::jsonb;
  v_id    uuid  := (r ->> 'ticket_id')::uuid;
  o       record;
begin
  perform pg_temp.verifier(r ->> 'statut' = 'ok' and (r ->> 'nb_lignes')::int = 9, 'ticket 2 accepté, 9 lignes');

  select * into o from public.observations_prix where ticket_id = v_id and num_ligne = 1;
  perform pg_temp.verifier(o.est_promo and o.prix_normal_centimes = 240 and o.prix_paye_centimes = 144,
    'linguine : promotion, prix normal 2.40, payé 1.44');

  select * into o from public.observations_prix where ticket_id = v_id and num_ligne = 2;
  perform pg_temp.verifier(o.est_promo and o.prix_paye_centimes = 224, 'lentilles : promotion, payé 2.24');

  select * into o from public.observations_prix where ticket_id = v_id and num_ligne = 8;
  perform pg_temp.verifier(o.unite = 'kg' and not o.est_promo and o.prix_paye_centimes = 295,
    'bananes : pesées, pas de promotion, 2.95 le kg');

  perform pg_temp.verifier(
    (select rabais_total_centimes from public.tickets where id = v_id) = 400,
    'rabais total du ticket : 4.00');

  perform pg_temp.verifier(
    (select count(*) from public.alias_produits) = 13, '13 alias créés par les deux tickets');
end $$;

-- =====================================================================
-- 5. Refus des tickets incohérents
-- =====================================================================
set local role authenticated;
select set_config('request.jwt.claims', current_setting('test.compte_b'), true);

do $$
declare
  t2 jsonb := current_setting('test.ticket2')::jsonb;
  cas record;
begin
  for cas in
    select * from (values
      ('ligne_incoherente',
       jsonb_set(jsonb_set(jsonb_set(t2, '{heure}', '"19:10:00"'),
                           '{lignes,3,total_centimes}', '330'),
                 '{total_centimes}', '2470')),
      ('somme_incoherente',
       jsonb_set(jsonb_set(t2, '{heure}', '"19:20:00"'), '{total_centimes}', '2500')),
      ('rabais_incoherent',
       jsonb_set(jsonb_set(t2, '{heure}', '"19:30:00"'), '{rabais_total_centimes}', '300')),
      ('date_future',
       jsonb_set(t2, '{date}', to_jsonb((current_date + 5)::text))),
      ('methode_invalide',
       jsonb_set(jsonb_set(t2, '{heure}', '"19:40:00"'), '{methode}', '"demo"')),
      ('produit_manquant',
       jsonb_set(jsonb_set(t2, '{heure}', '"19:45:00"'), '{lignes,0}', ((t2 #> '{lignes,0}') - 'produit_nom'))),
      ('ligne_invalide',
       jsonb_set(jsonb_set(t2, '{heure}', '"19:50:00"'), '{lignes,2,quantite}', '1.5')),
      ('magasin_invalide',
       jsonb_set(t2, '{magasin}', '{"numero_filiale": "123456", "nom": "MM Nouveau", "format": "XL", "canton": "VD"}'))
    ) as v(code, ticket)
  loop
    begin
      perform public.soumettre_ticket(cas.ticket);
      raise exception 'ÉCHEC : ticket accepté alors que % était attendu', cas.code;
    exception
      when raise_exception then
        if sqlerrm <> cas.code then
          raise exception 'ÉCHEC : % attendu, % obtenu', cas.code, sqlerrm;
        end if;
        raise notice 'OK : refus « % »', cas.code;
    end;
  end loop;
end $$;

-- =====================================================================
-- 6. Écritures directes interdites, lectures cloisonnées
-- =====================================================================
-- Compte A
select set_config('request.jwt.claims', current_setting('test.compte_a'), true);

do $$
begin
  begin
    insert into public.tickets (magasin_id, date_achat, heure_ticket, total_centimes, empreinte, methode)
    select id, current_date, '10:00', 100, repeat('a', 64), 'saisie_manuelle' from public.magasins limit 1;
    raise exception 'ÉCHEC : insertion directe d''un ticket acceptée';
  exception when insufficient_privilege then
    raise notice 'OK : insertion directe dans tickets refusée';
  end;

  begin
    update public.observations_prix set prix_normal_centimes = 1;
    raise exception 'ÉCHEC : modification directe d''une ligne acceptée';
  exception when insufficient_privilege then
    raise notice 'OK : modification directe des lignes refusée';
  end;

  begin
    insert into public.favoris (contributeur_id, produit_id)
    select '22222222-2222-4222-8222-222222222222', id from public.produits limit 1;
    raise exception 'ÉCHEC : favori créé au nom d''un autre compte';
  exception when insufficient_privilege then
    raise notice 'OK : impossible de créer un favori pour un autre compte';
  end;

  insert into public.produits (nom) values ('Produit créé par un membre');
  raise notice 'OK : un membre peut créer un produit';

  if (select count(*) from public.tickets where contributeur_id <> auth.uid()) <> 0 then
    raise exception 'ÉCHEC : A voit des tickets de B';
  end if;
  if (select count(*) from public.tickets) <> 1 then
    raise exception 'ÉCHEC : A devrait voir exactement son ticket';
  end if;
  raise notice 'OK : A ne voit que ses propres tickets';
end $$;

-- Compte B : ne peut pas supprimer le ticket de A
select set_config('request.jwt.claims', current_setting('test.compte_b'), true);
do $$
declare
  n integer;
begin
  with suppr as (
    delete from public.tickets where contributeur_id = '11111111-1111-4111-8111-111111111111' returning 1
  ) select count(*) into n from suppr;
  if n <> 0 then raise exception 'ÉCHEC : B a supprimé un ticket de A'; end if;
  raise notice 'OK : B ne peut pas supprimer un ticket de A';
end $$;

-- Visiteur anonyme
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  begin
    perform count(*) from public.tickets;
    raise exception 'ÉCHEC : un anonyme peut interroger les tickets';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform count(*) from public.observations_prix;
    raise exception 'ÉCHEC : un anonyme peut interroger les lignes';
  exception when insufficient_privilege then
    null;
  end;
  if (select count(*) from public.magasins) < 1 or (select count(*) from public.produits) < 13 then
    raise exception 'ÉCHEC : un anonyme ne lit pas les référentiels';
  end if;
  raise notice 'OK : un anonyme lit magasins et produits, mais ni tickets ni lignes';

  begin
    insert into public.produits (nom) values ('Produit anonyme');
    raise exception 'ÉCHEC : un anonyme a créé un produit';
  exception when insufficient_privilege then
    raise notice 'OK : un anonyme ne peut pas créer de produit';
  end;
end $$;

-- =====================================================================
-- 7. Recherche de produits (publique)
-- =====================================================================
do $$
begin
  perform pg_temp.verifier(
    (select nom from public.rechercher_produits('AGNESI linguine n.10') limit 1) = 'Agnesi Linguine N.10'
    and (select score from public.rechercher_produits('AGNESI linguine n.10') limit 1) = 1,
    'un libellé déjà vu retrouve son produit avec le score maximal');
  perform pg_temp.verifier(
    exists (select 1 from public.rechercher_produits('yogourt') where nom = 'Bio yogourt nature'),
    'recherche par fragment de nom');
  perform pg_temp.verifier(
    not exists (select 1 from public.rechercher_produits('x')),
    'recherche ignorée sous 2 caractères');
end $$;

-- =====================================================================
-- 8. Prix inhabituels
-- =====================================================================
reset role;

-- Historique synthétique du compte A : Bio Feta toujours à 3.20 (écart
-- absolu médian nul), et un produit au prix variable (écart non nul).
do $$
declare
  i integer;
  v_prix integer;
begin
  for i in 1..6 loop
    perform public._enregistrer_ticket(jsonb_build_object(
      'magasin', jsonb_build_object('numero_filiale', '064590'),
      'date', (current_date - i * 10)::text,
      'heure', format('08:%s:00', lpad(i::text, 2, '0')),
      'total_centimes', 320,
      'methode', 'saisie_manuelle',
      'lignes', jsonb_build_array(jsonb_build_object(
        'libelle_brut', 'Bio Feta', 'produit_nom', 'Bio Feta', 'unite', 'piece',
        'quantite', 1, 'prix_normal_centimes', 320, 'total_centimes', 320))),
      '11111111-1111-4111-8111-111111111111');

    v_prix := (array[300, 310, 320, 330, 340, 320])[i];
    perform public._enregistrer_ticket(jsonb_build_object(
      'magasin', jsonb_build_object('numero_filiale', '064590'),
      'date', (current_date - i * 10)::text,
      'heure', format('09:%s:00', lpad(i::text, 2, '0')),
      'total_centimes', v_prix,
      'methode', 'saisie_manuelle',
      'lignes', jsonb_build_array(jsonb_build_object(
        'libelle_brut', 'Produit test variable', 'produit_nom', 'Produit test variable', 'unite', 'piece',
        'quantite', 1, 'prix_normal_centimes', v_prix, 'total_centimes', v_prix))),
      '11111111-1111-4111-8111-111111111111');
  end loop;
end $$;

select set_config('test.feta', (select id::text from public.produits where nom = 'Bio Feta'), true);
select set_config('test.variable', (select id::text from public.produits where nom = 'Produit test variable'), true);

set local role authenticated;
select set_config('request.jwt.claims', current_setting('test.compte_a'), true);

do $$
declare
  feta     uuid := current_setting('test.feta')::uuid;
  variable uuid := current_setting('test.variable')::uuid;
  c        jsonb;
begin
  c := public.controler_prix(feta, 'piece', 3200);
  perform pg_temp.verifier((c ->> 'signale')::boolean and (c ->> 'score')::numeric > 3.5
                           and (c ->> 'mediane_centimes')::int = 320,
    'Feta à 32.00 signalée malgré un écart absolu médian nul (plancher de 5 %)');
  c := public.controler_prix(feta, 'piece', 330);
  perform pg_temp.verifier(not (c ->> 'signale')::boolean, 'Feta à 3.30 acceptée');
  c := public.controler_prix(feta, 'piece', 400);
  perform pg_temp.verifier(not (c ->> 'signale')::boolean, 'Feta à 4.00 (+25 %) acceptée : hausse plausible');
  c := public.controler_prix(feta, 'piece', 410);
  perform pg_temp.verifier((c ->> 'signale')::boolean, 'Feta à 4.10 (+28 %) signalée');

  c := public.controler_prix(variable, 'piece', 500);
  perform pg_temp.verifier((c ->> 'signale')::boolean and (c ->> 'score')::numeric > 3.5,
    'prix variable à 5.00 signalé par le score z modifié');
  c := public.controler_prix(variable, 'piece', 330);
  perform pg_temp.verifier(not (c ->> 'signale')::boolean, 'prix variable à 3.30 accepté');

  c := public.controler_prix(variable, 'kg', 9999);
  perform pg_temp.verifier(not (c ->> 'signale')::boolean and (c ->> 'nb')::int = 0,
    'pas de verdict sans historique dans la même unité');
end $$;

-- Envoi d'une Feta à 32.00 : mise de côté, puis confirmée par A
select set_config('test.r_feta', public.soumettre_ticket(jsonb_build_object(
  'magasin', jsonb_build_object('numero_filiale', '064590'),
  'date', current_date::text, 'heure', '18:00:00', 'total_centimes', 3200, 'methode', 'ocr_local',
  'lignes', jsonb_build_array(jsonb_build_object(
    'libelle_brut', 'Bio Feta', 'produit_id', current_setting('test.feta'), 'unite', 'piece',
    'quantite', 1, 'prix_normal_centimes', 3200, 'total_centimes', 3200))))::text, true);

-- Même prix, mais déjà confirmé dans l'écran de validation
select set_config('test.r_feta_conf', public.soumettre_ticket(jsonb_build_object(
  'magasin', jsonb_build_object('numero_filiale', '064590'),
  'date', current_date::text, 'heure', '18:05:00', 'total_centimes', 3200, 'methode', 'ocr_local',
  'lignes', jsonb_build_array(jsonb_build_object(
    'libelle_brut', 'Bio Feta', 'produit_id', current_setting('test.feta'), 'unite', 'piece',
    'quantite', 1, 'prix_normal_centimes', 3200, 'total_centimes', 3200, 'confirme', true))))::text, true);

do $$
declare
  r     jsonb := current_setting('test.r_feta')::jsonb;
  v_obs bigint;
begin
  perform pg_temp.verifier(r -> 'lignes_a_verifier' = '[1]'::jsonb, 'la ligne 1 est annoncée à vérifier');
  select id into v_obs from public.observations_prix
   where ticket_id = (r ->> 'ticket_id')::uuid and num_ligne = 1;
  perform pg_temp.verifier(
    (select statut_qualite from public.observations_prix where id = v_obs) = 'a_verifier',
    'la ligne est mise de côté (a_verifier)');
  perform pg_temp.verifier(
    (select statut_qualite from public.observations_prix
      where ticket_id = (current_setting('test.r_feta_conf')::jsonb ->> 'ticket_id')::uuid) = 'confirme',
    'un prix confirmé à l''écran est enregistré comme confirmé');
  perform set_config('test.obs_feta', v_obs::text, true);
end $$;

-- B ne peut pas confirmer la ligne de A
select set_config('request.jwt.claims', current_setting('test.compte_b'), true);
do $$
begin
  perform public.confirmer_observation(current_setting('test.obs_feta')::bigint);
  raise exception 'ÉCHEC : B a confirmé une ligne de A';
exception when raise_exception then
  if sqlerrm <> 'observation_introuvable' then raise; end if;
  raise notice 'OK : B ne peut pas confirmer une ligne de A';
end $$;

-- A la confirme
select set_config('request.jwt.claims', current_setting('test.compte_a'), true);
select public.confirmer_observation(current_setting('test.obs_feta')::bigint);
do $$
begin
  perform pg_temp.verifier(
    (select statut_qualite from public.observations_prix
      where id = current_setting('test.obs_feta')::bigint) = 'confirme',
    'A confirme sa ligne mise de côté');
end $$;

-- =====================================================================
-- 9. Statistiques publiques
-- =====================================================================
reset role;
select set_config('test.linguine', (select id::text from public.produits where nom = 'Agnesi Linguine N.10'), true);
select set_config('test.lentilles', (select id::text from public.produits where nom = 'Bio lentilles rouges'), true);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare
  linguine  uuid := current_setting('test.linguine')::uuid;
  lentilles uuid := current_setting('test.lentilles')::uuid;
  variable  uuid := current_setting('test.variable')::uuid;
  s record;
begin
  perform pg_temp.verifier(
    (select count(*) from public.serie_prix(variable, p_debut => current_date - 90)) = 6,
    'courbe : 6 semaines de relevés pour le produit variable');
  perform pg_temp.verifier(
    (select mediane_centimes from public.serie_prix(linguine, p_debut => date '2026-01-01', p_fin => date '2026-12-31')) = 240,
    'courbe : linguine au prix normal de 2.40, malgré la promotion');
  perform pg_temp.verifier(
    (select count(*) from public.serie_prix(linguine, p_canton => 'GE', p_debut => date '2026-01-01', p_fin => date '2026-12-31')) = 0,
    'filtre par canton : rien à Genève');

  perform pg_temp.verifier(
    (select mediane_centimes from public.comparaison_magasins(linguine, 3650)) = 240
    and (select magasin_nom from public.comparaison_magasins(linguine, 3650)) = 'MM Métropole Renens',
    'comparaison : un magasin, 2.40');

  select * into s from public.stats_promotions(linguine, 3650);
  perform pg_temp.verifier(s.nb_achats = 1 and s.nb_promos = 1 and s.rabais_moyen_pct = 40.0,
    'promotions linguine : 1 achat sur 1, rabais de 40 %');
  select * into s from public.stats_promotions(lentilles, 3650);
  perform pg_temp.verifier(s.rabais_moyen_pct = 20.0, 'promotions lentilles : rabais de 20 %');

  begin
    perform public.indice_panier(gen_random_uuid());
    raise exception 'ÉCHEC : un anonyme a appelé indice_panier';
  exception when insufficient_privilege then
    raise notice 'OK : indice_panier réservé aux membres';
  end;
end $$;

-- =====================================================================
-- 10. Indice de panier
-- =====================================================================
reset role;
set local role authenticated;
select set_config('request.jwt.claims', current_setting('test.compte_a'), true);

insert into public.paniers (contributeur_id, nom, date_base)
values ('11111111-1111-4111-8111-111111111111', 'Panier test', current_date - 60);

insert into public.panier_articles (panier_id, produit_id, quantite)
select p.id, current_setting('test.variable')::uuid, 2
from public.paniers p where p.nom = 'Panier test';

do $$
declare
  v_panier uuid := (select id from public.paniers where nom = 'Panier test');
  v_premier record;
begin
  select * into v_premier from public.indice_panier(v_panier) order by mois limit 1;
  perform pg_temp.verifier(v_premier.indice = 100.0 and v_premier.nb_produits = 1,
    'indice de panier : 100 le mois de base');
  perform set_config('test.panier', v_panier::text, true);
end $$;

select set_config('request.jwt.claims', current_setting('test.compte_b'), true);
do $$
begin
  perform public.indice_panier(current_setting('test.panier')::uuid);
  raise exception 'ÉCHEC : B lit le panier de A';
exception when raise_exception then
  if sqlerrm <> 'panier_introuvable' then raise; end if;
  raise notice 'OK : B ne peut pas lire le panier de A';
end $$;

-- =====================================================================
-- 11. Suppression d'un ticket par son auteur
-- =====================================================================
select set_config('request.jwt.claims', current_setting('test.compte_a'), true);
delete from public.tickets where id = (current_setting('test.r1')::jsonb ->> 'ticket_id')::uuid;

reset role;
do $$
begin
  perform pg_temp.verifier(
    not exists (select 1 from public.observations_prix
                 where ticket_id = (current_setting('test.r1')::jsonb ->> 'ticket_id')::uuid),
    'A supprime son ticket ; ses lignes disparaissent avec lui');
  raise notice '=== Tous les tests sont passés ===';
end $$;

rollback;

-- Atteint seulement si aucune vérification n'a échoué.
select 'Tous les tests sont passés (56 vérifications)' as resultat;
