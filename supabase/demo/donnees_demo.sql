-- =====================================================================
-- Panier Témoin — données de démonstration
--
-- Historique FICTIF de 12 mois (13 octobre 2025 → 10 octobre 2026),
-- destiné à essayer courbes, comparaisons, promotions et indice de panier
-- avant d'avoir de vrais tickets.
--
--   - 3 magasins fictifs, clairement nommés « Démo » (filiales 990001 à
--     990003) : ce ne sont pas de vrais magasins ;
--   - les 13 produits de tes deux tickets du 12 octobre 2026, avec leurs
--     prix réels comme point d'arrivée ;
--   - variations inventées : saisonnalité des fruits et légumes, écart
--     entre magasins sur le frais, trois hausses de prix, promotions
--     aléatoires ;
--   - deux erreurs de lecture volontaires (Feta à 32.00, YogQuark à
--     9.15), qui doivent être mises de côté par l'anti-aberration.
--
-- Tous les tickets ont la méthode 'demo' et aucun contributeur.
-- Suppression complète : supabase/demo/purge_demo.sql.
-- Le générateur est déterministe : relancé sur une base vide, il produit
-- exactement les mêmes tickets ; relancé sur une base qui les contient
-- déjà, il les reconnaît comme doublons et n'ajoute rien.
-- =====================================================================

begin;

-- Catalogue : prix normal d'octobre 2026 (celui de tes tickets), et
-- paramètres de variation inventés.
create temporary table demo_catalogue (
  nom          text primary key,
  unite        public.unite_mesure not null,
  prix_oct     integer not null,           -- prix normal en octobre 2026, en centimes
  frais        boolean not null,           -- fruit ou légume : saison et écart entre magasins
  amplitude    numeric not null default 0, -- variation saisonnière (0,15 = ±15 %)
  mois_cher    integer,                    -- mois où le prix est au plus haut
  hausse_le    date,                       -- date d'une hausse de prix
  prix_avant   integer,                    -- prix normal avant cette hausse
  proba_promo  numeric not null            -- probabilité d'un rabais sur la ligne
) on commit drop;

insert into demo_catalogue values
  ('Poivrons rouges',        'kg',    380, true,  0.15, 1,    null,              null, 0.05),
  ('MClass fromage salade',  'piece', 190, false, 0,    null, null,              null, 0.10),
  ('Migros lait coco light', 'piece', 140, false, 0,    null, null,              null, 0.08),
  ('MClass YogQuark',        'piece', 195, false, 0,    null, date '2026-01-15', 185,  0.12),
  ('Agnesi Linguine N.10',   'piece', 240, false, 0,    null, date '2026-03-01', 220,  0.18),
  ('Bio lentilles rouges',   'piece', 280, false, 0,    null, null,              null, 0.12),
  ('MBud gnocchi',           'piece', 195, false, 0,    null, null,              null, 0.04),
  ('Bio Feta',               'piece', 320, false, 0,    null, date '2026-05-01', 300,  0.10),
  ('Aubergines',             'kg',    400, true,  0.20, 1,    null,              null, 0.05),
  ('Bio yogourt nature',     'piece', 140, false, 0,    null, null,              null, 0.06),
  ('Bio courgettes',         'piece', 330, true,  0.15, 2,    null,              null, 0.05),
  ('Bio Fairtrade bananes',  'kg',    295, true,  0.03, 6,    null,              null, 0.05),
  ('Pommes rou. douce Gala', 'kg',    280, true,  0.12, 7,    null,              null, 0.05);

create temporary table demo_magasins (
  rang    integer primary key,
  infos   jsonb not null,
  facteur numeric not null,   -- écart de prix appliqué au frais seulement
  poids   numeric not null    -- part des visites
) on commit drop;

insert into demo_magasins values
  (1, '{"numero_filiale": "990001", "nom": "MM Démo Lausanne", "format": "MM", "localite": "Lausanne", "canton": "VD"}', 1.00, 0.50),
  (2, '{"numero_filiale": "990002", "nom": "M Démo Morges",    "format": "M",  "localite": "Morges",   "canton": "VD"}', 1.05, 0.30),
  (3, '{"numero_filiale": "990003", "nom": "MMM Démo Genève",  "format": "MMM", "localite": "Genève",  "canton": "GE"}', 1.08, 0.20);

do $$
declare
  v_date        date := date '2025-10-13';
  v_fin         date := date '2026-10-10';
  v_numero      integer := 0;
  v_tirage      numeric;
  v_magasin     record;
  v_produit     record;
  v_nb_articles integer;
  v_lignes      jsonb;
  v_total       integer;
  v_rabais_tot  integer;
  v_prix        integer;
  v_pct         integer;
  v_qte         numeric;
  v_poids       numeric;
  v_brut        integer;
  v_rabais      integer;
  v_tot         integer;
  v_heure       text;
  v_resultat    jsonb;
  v_ajoutes     integer := 0;
  v_mois        integer;
begin
  -- Graine fixe : même historique à chaque exécution.
  perform setseed(0.2026);

  while v_date <= v_fin loop
    v_numero := v_numero + 1;

    -- Magasin, selon les parts de visite.
    v_tirage := random();
    select * into v_magasin from demo_magasins
     where v_tirage < (select sum(m2.poids) from demo_magasins m2 where m2.rang <= demo_magasins.rang)
     order by rang limit 1;
    if v_magasin is null then
      select * into v_magasin from demo_magasins order by rang desc limit 1;
    end if;

    v_nb_articles := 3 + floor(random() * 6)::integer;  -- 3 à 8 articles
    v_lignes      := '[]'::jsonb;
    v_total       := 0;
    v_rabais_tot  := 0;
    v_mois        := extract(month from v_date)::integer;

    -- Tirage des articles ; les tickets 80 et 95 contiennent toujours
    -- le produit qui recevra l'erreur de lecture volontaire.
    for v_produit in
      select c.* from demo_catalogue c
      order by (c.nom = case v_numero when 80 then 'Bio Feta'
                                      when 95 then 'MClass YogQuark' end) desc nulls last,
               random()
      limit v_nb_articles
    loop
      -- Prix normal du jour
      if v_produit.hausse_le is not null and v_date < v_produit.hausse_le then
        v_prix := v_produit.prix_avant;
      else
        v_prix := v_produit.prix_oct;
      end if;

      if v_produit.frais then
        -- Saisonnalité ramenée au prix d'octobre, puis écart du magasin.
        v_prix := round(
          v_prix
          * (1 + v_produit.amplitude * cos(2 * pi() * (v_mois - v_produit.mois_cher) / 12))
          / (1 + v_produit.amplitude * cos(2 * pi() * (10 - v_produit.mois_cher) / 12))
          * v_magasin.facteur / 5) * 5;
      end if;

      -- Erreurs de lecture volontaires (à mettre de côté)
      if v_numero = 80 and v_produit.nom = 'Bio Feta' then
        v_prix := 3200;
      elsif v_numero = 95 and v_produit.nom = 'MClass YogQuark' then
        v_prix := 915;
      end if;

      -- Rabais éventuel
      if random() < v_produit.proba_promo then
        v_pct := (array[20, 25, 30, 40, 50])[1 + floor(random() * 5)::integer];
      else
        v_pct := 0;
      end if;

      if v_produit.unite = 'kg' then
        v_poids  := round((0.25 + random() * 1.25)::numeric, 3);
        v_brut   := round(v_poids * v_prix / 5) * 5;
        v_rabais := round(v_brut * v_pct / 100.0 / 5) * 5;
        v_tot    := v_brut - v_rabais;
        -- Le ticket n'imprime pas le poids : il est déduit comme dans l'app.
        v_qte    := round((v_tot + v_rabais)::numeric / v_prix, 3);
      else
        v_tirage := random();
        v_qte    := case when v_tirage < 0.7 then 1 when v_tirage < 0.9 then 2 else 3 end;
        v_brut   := (v_qte * v_prix)::integer;
        v_rabais := round(v_brut * v_pct / 100.0 / 5) * 5;
        v_tot    := v_brut - v_rabais;
      end if;

      v_lignes := v_lignes || jsonb_build_object(
        'libelle_brut',         v_produit.nom,
        'produit_nom',          v_produit.nom,
        'unite',                v_produit.unite,
        'quantite',             v_qte,
        'prix_normal_centimes', v_prix,
        'rabais_centimes',      v_rabais,
        'total_centimes',       v_tot);

      v_total      := v_total + v_tot;
      v_rabais_tot := v_rabais_tot + v_rabais;
    end loop;

    v_heure := to_char(time '08:00' + (floor(random() * 43200) || ' seconds')::interval, 'HH24:MI:SS');

    v_resultat := public._enregistrer_ticket(
      jsonb_build_object(
        'magasin',               v_magasin.infos,
        'date',                  v_date::text,
        'heure',                 v_heure,
        'total_centimes',        v_total,
        'rabais_total_centimes', v_rabais_tot,
        'methode',               'demo',
        'lignes',                v_lignes),
      null);

    if v_resultat ->> 'statut' = 'ok' then
      v_ajoutes := v_ajoutes + 1;
    end if;

    -- Prochaine visite dans 1 à 4 jours
    v_date := v_date + 1 + floor(random() * 4)::integer;
  end loop;

  raise notice 'Démonstration : % tickets générés, % ajoutés (les autres existaient déjà).', v_numero, v_ajoutes;
end $$;

commit;

-- Résumé visible dans l'éditeur SQL de Supabase
select count(*) as tickets_demo from public.tickets where methode = 'demo';
