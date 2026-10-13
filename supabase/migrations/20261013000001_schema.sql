-- =====================================================================
-- Panier Témoin — migration 1/3 : schéma
-- Projet indépendant, sans lien avec Migros ni avec la Fédération des
-- coopératives Migros.
--
-- Contenu : extensions, types, fonction de normalisation, tables, index.
-- Tous les montants sont en centimes de franc (entiers).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extensions (Supabase les range dans le schéma « extensions »)
-- ---------------------------------------------------------------------
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------
-- Types énumérés
-- ---------------------------------------------------------------------
-- 'piece' : article vendu à l'unité ; 'kg' : article pesé à la caisse.
create type public.unite_mesure as enum ('piece', 'kg');

-- 'ok'         : prix intégré aux statistiques
-- 'a_verifier' : prix inhabituel, mis de côté en attendant confirmation
-- 'confirme'   : prix inhabituel confirmé par son auteur, intégré
create type public.statut_qualite as enum ('ok', 'a_verifier', 'confirme');

-- ---------------------------------------------------------------------
-- Normalisation des libellés : minuscules, accents retirés, ponctuation
-- réduite, espaces fusionnés. Déclarée immuable pour être indexable.
-- Exemple : « Pommes rou. douce Gala » → « pommes rou. douce gala »
-- ---------------------------------------------------------------------
create or replace function public.normaliser_libelle(p_texte text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select trim(
           regexp_replace(
             regexp_replace(
               lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_texte, ''))),
               '[^a-z0-9%.,/ ]+', ' ', 'g'),
             '\s+', ' ', 'g'))
$$;

-- ---------------------------------------------------------------------
-- Magasins : identifiés par le numéro de filiale imprimé en pied de ticket
-- ---------------------------------------------------------------------
create table public.magasins (
  id             uuid primary key default gen_random_uuid(),
  numero_filiale text not null unique check (numero_filiale ~ '^[0-9]{4,8}$'),
  nom            text not null check (length(nom) between 2 and 80),
  format         text not null check (format in ('M', 'MM', 'MMM')),
  localite       text check (localite is null or length(localite) between 2 and 60),
  canton         char(2) not null check (canton ~ '^[A-Z]{2}$'),
  cree_le        timestamptz not null default now()
);

comment on table public.magasins is
  'Supermarchés Migros, créés automatiquement au premier ticket.';

-- ---------------------------------------------------------------------
-- Produits canoniques
-- ---------------------------------------------------------------------
create table public.produits (
  id             uuid primary key default gen_random_uuid(),
  nom            text not null unique check (length(nom) between 2 and 120),
  vendu_au_poids boolean not null default false,
  cree_le        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Alias : libellé de ticket normalisé → produit canonique.
-- Mis à jour à chaque validation ; la dernière validation l'emporte.
-- ---------------------------------------------------------------------
create table public.alias_produits (
  libelle_normalise text primary key check (length(libelle_normalise) between 2 and 120),
  produit_id        uuid not null references public.produits (id) on delete cascade,
  maj_le            timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Tickets
-- ---------------------------------------------------------------------
create table public.tickets (
  id                    uuid primary key default gen_random_uuid(),
  -- Identifiant aléatoire du compte : aucun nom ni e-mail ici.
  contributeur_id       uuid references auth.users (id) on delete set null,
  magasin_id            uuid not null references public.magasins (id),
  date_achat            date not null check (date_achat >= date '2020-01-01'),
  -- Heure du pied de ticket, pas celle du paiement.
  heure_ticket          time(0) not null,
  total_centimes        integer not null check (total_centimes > 0),
  rabais_total_centimes integer not null default 0 check (rabais_total_centimes >= 0),
  -- SHA-256 de « filiale|date|heure|total », calculé par soumettre_ticket.
  empreinte             text not null unique check (empreinte ~ '^[0-9a-f]{64}$'),
  -- 'demo' marque l'historique fictif, supprimable par purge_demo.sql.
  methode               text not null check (methode in ('ocr_local', 'import_claude', 'saisie_manuelle', 'demo')),
  cree_le               timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Lignes de ticket = observations de prix
-- ---------------------------------------------------------------------
create table public.observations_prix (
  id                         bigint generated always as identity primary key,
  ticket_id                  uuid not null references public.tickets (id) on delete cascade,
  num_ligne                  smallint not null check (num_ligne between 1 and 300),
  produit_id                 uuid not null references public.produits (id),
  -- Copiés du ticket pour accélérer les statistiques.
  magasin_id                 uuid not null references public.magasins (id),
  contributeur_id            uuid references auth.users (id) on delete set null,
  date_achat                 date not null,
  libelle_brut               text not null check (length(libelle_brut) between 1 and 120),
  unite                      public.unite_mesure not null,
  -- Nombre de pièces, ou poids en kg déduit de total ÷ prix au kilo.
  quantite                   numeric(10,3) not null check (quantite > 0),
  -- Colonne « Prix » du ticket : prix normal à la pièce ou au kilo.
  prix_normal_centimes       integer not null check (prix_normal_centimes > 0),
  rabais_centimes            integer not null default 0 check (rabais_centimes >= 0),
  total_centimes             integer not null check (total_centimes >= 0),
  -- Prix effectivement payé par pièce ou par kilo : total ÷ quantité.
  prix_paye_centimes         integer not null check (prix_paye_centimes >= 0),
  est_promo                  boolean generated always as (rabais_centimes > 0) stored,
  statut_qualite             public.statut_qualite not null default 'ok',
  -- Score z modifié (null si moins de 5 relevés de référence).
  score_robuste              numeric(8,2),
  mediane_reference_centimes integer,
  unique (ticket_id, num_ligne)
);

-- ---------------------------------------------------------------------
-- Favoris et paniers types
-- ---------------------------------------------------------------------
create table public.favoris (
  contributeur_id uuid not null references auth.users (id) on delete cascade,
  produit_id      uuid not null references public.produits (id) on delete cascade,
  primary key (contributeur_id, produit_id)
);

create table public.paniers (
  id              uuid primary key default gen_random_uuid(),
  contributeur_id uuid not null references auth.users (id) on delete cascade,
  nom             text not null check (length(nom) between 1 and 60),
  -- Le mois de cette date sert de base 100 à l'indice.
  date_base       date not null default current_date,
  cree_le         timestamptz not null default now()
);

create table public.panier_articles (
  panier_id  uuid not null references public.paniers (id) on delete cascade,
  produit_id uuid not null references public.produits (id) on delete cascade,
  -- Pièces, ou kg pour un article pesé.
  quantite   numeric(8,3) not null default 1 check (quantite > 0),
  primary key (panier_id, produit_id)
);

-- ---------------------------------------------------------------------
-- Index
-- ---------------------------------------------------------------------
create index produits_recherche_idx   on public.produits
  using gin (public.normaliser_libelle(nom) extensions.gin_trgm_ops);
create index alias_recherche_idx      on public.alias_produits
  using gin (libelle_normalise extensions.gin_trgm_ops);
create index alias_produit_idx        on public.alias_produits (produit_id);
create index tickets_contrib_idx      on public.tickets (contributeur_id, cree_le desc);
create index tickets_magasin_idx      on public.tickets (magasin_id, date_achat);
create index obs_produit_date_idx     on public.observations_prix (produit_id, date_achat);
create index obs_produit_magasin_idx  on public.observations_prix (produit_id, magasin_id, date_achat);
create index obs_magasin_idx          on public.observations_prix (magasin_id);
create index obs_contrib_idx          on public.observations_prix (contributeur_id);
create index obs_a_verifier_idx       on public.observations_prix (produit_id)
  where statut_qualite = 'a_verifier';
create index favoris_produit_idx      on public.favoris (produit_id);
create index paniers_contrib_idx      on public.paniers (contributeur_id);
create index panier_articles_prod_idx on public.panier_articles (produit_id);
