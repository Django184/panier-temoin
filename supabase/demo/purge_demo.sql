-- =====================================================================
-- Panier Témoin — suppression des données de démonstration
--
-- Supprime les tickets 'demo' (leurs lignes suivent en cascade), les
-- trois magasins « Démo », et ceux des 13 produits de démonstration qui
-- ne servent plus à rien (aucune ligne, aucun favori, aucun panier).
-- Les vrais tickets et ce qu'ils utilisent ne sont pas touchés.
-- =====================================================================

begin;

delete from public.tickets where methode = 'demo';

delete from public.magasins m
where m.numero_filiale in ('990001', '990002', '990003')
  and not exists (select 1 from public.tickets t where t.magasin_id = m.id);

delete from public.produits p
where p.nom in (
        'Poivrons rouges', 'MClass fromage salade', 'Migros lait coco light', 'MClass YogQuark',
        'Agnesi Linguine N.10', 'Bio lentilles rouges', 'MBud gnocchi', 'Bio Feta', 'Aubergines',
        'Bio yogourt nature', 'Bio courgettes', 'Bio Fairtrade bananes', 'Pommes rou. douce Gala')
  and not exists (select 1 from public.observations_prix o where o.produit_id = p.id)
  and not exists (select 1 from public.favoris f where f.produit_id = p.id)
  and not exists (select 1 from public.panier_articles a where a.produit_id = p.id);

do $$
begin
  if exists (select 1 from public.tickets where methode = 'demo') then
    raise exception 'ÉCHEC : des tickets de démonstration subsistent';
  end if;
  raise notice 'Démonstration supprimée. Restent : % tickets, % magasins, % produits.',
    (select count(*) from public.tickets),
    (select count(*) from public.magasins),
    (select count(*) from public.produits);
end $$;

commit;

-- Résumé visible dans l'éditeur SQL de Supabase
select (select count(*) from public.tickets where methode = 'demo') as tickets_demo_restants,
       (select count(*) from public.tickets)                        as tickets,
       (select count(*) from public.magasins)                       as magasins,
       (select count(*) from public.produits)                       as produits;
