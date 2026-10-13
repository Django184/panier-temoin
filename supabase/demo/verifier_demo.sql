-- =====================================================================
-- Panier Témoin — contrôle des données de démonstration
--
-- À lancer après donnees_demo.sql. Ne modifie rien. Affiche un résumé
-- puis vérifie que l'historique exerce bien chaque statistique.
-- =====================================================================

do $$
declare
  v_tickets    integer;
  v_lignes     integer;
  v_part_promo numeric;
  v_a_verifier text;
  v_linguine   uuid;
  v_bananes    uuid;
  v_prix       integer[];
  v_premier    text;
  v_dernier    text;
begin
  select count(*) into v_tickets from public.tickets where methode = 'demo';
  select count(*), round(100.0 * count(*) filter (where o.est_promo) / nullif(count(*), 0), 1)
    into v_lignes, v_part_promo
  from public.observations_prix o
  join public.tickets t on t.id = o.ticket_id
  where t.methode = 'demo';

  select string_agg(format('%s à %s', o.libelle_brut, to_char(o.prix_normal_centimes / 100.0, 'FM9990.00')), ', ')
    into v_a_verifier
  from public.observations_prix o
  join public.tickets t on t.id = o.ticket_id
  where t.methode = 'demo' and o.statut_qualite = 'a_verifier';

  raise notice 'Démonstration : % tickets, % lignes, % %% en promotion.', v_tickets, v_lignes, v_part_promo;
  raise notice 'Mis de côté : %', coalesce(v_a_verifier, 'aucun');

  if v_tickets not between 100 and 200 then
    raise exception 'ÉCHEC : % tickets de démonstration, 100 à 200 attendus', v_tickets;
  end if;
  if (select count(*) from public.magasins where numero_filiale in ('990001', '990002', '990003')) <> 3 then
    raise exception 'ÉCHEC : les 3 magasins de démonstration sont attendus';
  end if;
  if v_part_promo not between 3 and 20 then
    raise exception 'ÉCHEC : part de promotions improbable (% %%)', v_part_promo;
  end if;

  -- Les deux erreurs volontaires sont mises de côté, et presque rien d'autre.
  if not exists (select 1 from public.observations_prix o join public.tickets t on t.id = o.ticket_id
                  where t.methode = 'demo' and o.libelle_brut = 'Bio Feta'
                    and o.prix_normal_centimes = 3200 and o.statut_qualite = 'a_verifier') then
    raise exception 'ÉCHEC : la Feta à 32.00 aurait dû être mise de côté';
  end if;
  if not exists (select 1 from public.observations_prix o join public.tickets t on t.id = o.ticket_id
                  where t.methode = 'demo' and o.libelle_brut = 'MClass YogQuark'
                    and o.prix_normal_centimes = 915 and o.statut_qualite = 'a_verifier') then
    raise exception 'ÉCHEC : le YogQuark à 9.15 aurait dû être mis de côté';
  end if;
  if (select count(*) from public.observations_prix o join public.tickets t on t.id = o.ticket_id
       where t.methode = 'demo' and o.statut_qualite = 'a_verifier') > 6 then
    raise exception 'ÉCHEC : trop de prix légitimes mis de côté (%)', v_a_verifier;
  end if;
  raise notice 'OK : les deux erreurs de lecture volontaires sont mises de côté';

  -- La hausse des linguine (2.20 → 2.40 au 1er mars 2026) se voit sur la courbe.
  select id into v_linguine from public.produits where nom = 'Agnesi Linguine N.10';
  select array_agg(s.mediane_centimes order by s.semaine)
    into v_prix
  from public.serie_prix(v_linguine, p_debut => date '2025-10-01', p_fin => date '2026-10-31') s;
  if v_prix[1] <> 220 or v_prix[array_upper(v_prix, 1)] <> 240 then
    raise exception 'ÉCHEC : la courbe des linguine devrait passer de 2.20 à 2.40 (%)', v_prix;
  end if;
  raise notice 'OK : courbe des linguine de 2.20 à 2.40';

  -- Bananes (peu saisonnières) : moins chères à Lausanne, plus chères à Genève.
  -- Sur un produit très saisonnier comme les aubergines, une médiane
  -- annuelle reflète surtout la saison des visites : la comparaison entre
  -- magasins doit alors porter sur une période courte.
  select id into v_bananes from public.produits where nom = 'Bio Fairtrade bananes';
  select (array_agg(c.magasin_nom order by c.mediane_centimes))[1],
         (array_agg(c.magasin_nom order by c.mediane_centimes desc))[1]
    into v_premier, v_dernier
  from public.comparaison_magasins(v_bananes, 100000) c;
  if v_premier <> 'MM Démo Lausanne' or v_dernier <> 'MMM Démo Genève' then
    raise exception 'ÉCHEC : comparaison des bananes inattendue (% le moins cher, % le plus cher)', v_premier, v_dernier;
  end if;
  raise notice 'OK : bananes les moins chères à Lausanne, les plus chères à Genève';

  if (select nb_promos from public.stats_promotions(v_linguine, 100000)) < 1 then
    raise exception 'ÉCHEC : aucune promotion sur les linguine';
  end if;
  raise notice 'OK : promotions présentes sur les linguine';
end $$;

-- Résumé visible dans l'éditeur SQL de Supabase (atteint seulement si
-- toutes les vérifications ci-dessus ont réussi).
select count(distinct t.id)                                           as tickets_demo,
       count(o.id)                                                    as lignes,
       round(100.0 * count(o.id) filter (where o.est_promo) / nullif(count(o.id), 0), 1) as pct_promotions,
       count(o.id) filter (where o.statut_qualite = 'a_verifier')     as prix_mis_de_cote
from public.tickets t
join public.observations_prix o on o.ticket_id = t.id
where t.methode = 'demo';
