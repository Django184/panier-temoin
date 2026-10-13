-- =====================================================================
-- Panier Témoin — liste de courses et recettes partagées par le foyer
--
-- Chaque article et chaque recette est une ligne, pour que deux personnes
-- puissent cocher en même temps sans s'écraser. Lisibles et modifiables
-- par les comptes connectés (le foyer), invisibles sans compte.
-- Le téléphone garde une copie locale (courses sans réseau) et envoie ses
-- changements dès que possible ; les autres téléphones les reçoivent en
-- direct (Supabase Realtime, compris dans le plan gratuit).
-- =====================================================================

create table public.courses_articles (
  id          uuid primary key,
  texte       text not null check (length(texte) <= 300),
  rayon       text not null check (length(rayon) <= 80),
  -- Recette d'origine (pas de clé étrangère : article et recette peuvent
  -- arriver dans n'importe quel ordre depuis un téléphone hors ligne).
  recette_id  uuid,
  recette     text not null default '' check (length(recette) <= 300),
  ingredient  smallint check (ingredient between 0 and 999),
  coche       boolean not null default false,
  manuel      boolean not null default false,
  cree_le     timestamptz not null default now(),
  modifie_le  timestamptz not null default now(),
  modifie_par uuid default auth.uid()
);

create index courses_articles_recette on public.courses_articles (recette_id);

create table public.recettes (
  id          uuid primary key,
  titre       text not null check (length(titre) between 1 and 300),
  personnes   smallint check (personnes between 1 and 99),
  portions    smallint check (portions between 1 and 99),
  infos       text not null default '' check (length(infos) <= 1000),
  ingredients jsonb not null default '[]' check (jsonb_typeof(ingredients) = 'array' and octet_length(ingredients::text) <= 50000),
  etapes      jsonb not null default '[]' check (jsonb_typeof(etapes) = 'array' and octet_length(etapes::text) <= 50000),
  astuces     jsonb not null default '[]' check (jsonb_typeof(astuces) = 'array' and octet_length(astuces::text) <= 20000),
  nutrition   text not null default '' check (length(nutrition) <= 1000),
  importe_le  timestamptz not null default now(),
  modifie_le  timestamptz,
  maj_le      timestamptz not null default now(),
  maj_par     uuid default auth.uid()
);

alter table public.courses_articles enable row level security;
alter table public.recettes enable row level security;

create policy courses_foyer on public.courses_articles
  for all to authenticated using (true) with check (true);
create policy recettes_foyer on public.recettes
  for all to authenticated using (true) with check (true);

revoke all on public.courses_articles, public.recettes from anon, authenticated;
grant select, insert, update, delete on public.courses_articles, public.recettes to authenticated;

-- Diffusion en direct des changements aux autres téléphones.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.courses_articles, public.recettes;
  end if;
end $$;
