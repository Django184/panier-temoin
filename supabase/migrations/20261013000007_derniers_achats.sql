-- =====================================================================
-- Panier Témoin — derniers achats et tendance des prix
--
-- Pour chaque produit acheté : son dernier prix normal, et l'écart en %
-- avec le prix normal de l'achat précédent (à une date antérieure).
-- Les prix mis de côté (« à vérifier ») sont exclus. Consultation
-- publique, comme les autres statistiques : aucun contributeur n'apparaît.
-- =====================================================================

create or replace function public.derniers_achats(p_limite integer default 30)
returns table (
  produit_id               uuid,
  nom                      text,
  vendu_au_poids           boolean,
  unite                    public.unite_mesure,
  date_achat               date,
  prix_normal_centimes     integer,
  prix_paye_centimes       integer,
  est_promo                boolean,
  precedent_prix_centimes  integer,
  precedent_date           date,
  variation_pct            numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with valides as (
    select o.produit_id, o.unite, o.date_achat, o.prix_normal_centimes, o.prix_paye_centimes, o.est_promo,
           row_number() over (partition by o.produit_id, o.unite
                              order by o.date_achat desc, t.heure_ticket desc, o.id desc) as rang
    from public.observations_prix o
    join public.tickets t on t.id = o.ticket_id
    where o.statut_qualite <> 'a_verifier'
  ),
  derniers as (
    select * from valides where rang = 1
  ),
  precedents as (
    select distinct on (d.produit_id, d.unite)
           d.produit_id, d.unite, v.date_achat, v.prix_normal_centimes
    from derniers d
    join valides v on v.produit_id = d.produit_id and v.unite = d.unite and v.date_achat < d.date_achat
    order by d.produit_id, d.unite, v.rang
  )
  select d.produit_id,
         p.nom,
         p.vendu_au_poids,
         d.unite,
         d.date_achat,
         d.prix_normal_centimes,
         d.prix_paye_centimes,
         d.est_promo,
         pr.prix_normal_centimes,
         pr.date_achat,
         case when pr.prix_normal_centimes is null then null
              else round((d.prix_normal_centimes - pr.prix_normal_centimes) * 100.0 / pr.prix_normal_centimes, 1)
         end
  from derniers d
  join public.produits p on p.id = d.produit_id
  left join precedents pr on pr.produit_id = d.produit_id and pr.unite = d.unite
  order by d.date_achat desc, p.nom
  limit least(greatest(coalesce(p_limite, 30), 1), 100);
$$;

revoke execute on function public.derniers_achats(integer) from public, anon, authenticated;
grant execute on function public.derniers_achats(integer) to anon, authenticated;
