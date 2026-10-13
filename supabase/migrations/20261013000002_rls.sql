-- =====================================================================
-- Panier Témoin — migration 2/3 : Row Level Security
--
-- Principe :
--   - les inscriptions sont fermées, donc « authenticated » = l'un des
--     deux comptes créés à la main dans le tableau de bord ;
--   - référentiels (magasins, produits, alias) : lecture publique ;
--   - tickets et lignes : aucune insertion ni modification directe,
--     tout passe par la fonction soumettre_ticket (migration 3) ;
--   - favoris et paniers : visibles et modifiables par leur seul auteur.
-- =====================================================================

alter table public.magasins          enable row level security;
alter table public.produits          enable row level security;
alter table public.alias_produits    enable row level security;
alter table public.tickets           enable row level security;
alter table public.observations_prix enable row level security;
alter table public.favoris           enable row level security;
alter table public.paniers           enable row level security;
alter table public.panier_articles   enable row level security;

-- ---------------------------------------------------------------------
-- Magasins
-- ---------------------------------------------------------------------
create policy magasins_lecture on public.magasins
  for select to anon, authenticated
  using (true);

create policy magasins_ajout on public.magasins
  for insert to authenticated
  with check (true);

create policy magasins_modif on public.magasins
  for update to authenticated
  using (true) with check (true);

-- ---------------------------------------------------------------------
-- Produits (renommage possible par les membres)
-- ---------------------------------------------------------------------
create policy produits_lecture on public.produits
  for select to anon, authenticated
  using (true);

create policy produits_ajout on public.produits
  for insert to authenticated
  with check (true);

create policy produits_modif on public.produits
  for update to authenticated
  using (true) with check (true);

-- ---------------------------------------------------------------------
-- Alias : lecture publique ; écriture uniquement par soumettre_ticket
-- ---------------------------------------------------------------------
create policy alias_lecture on public.alias_produits
  for select to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------
-- Tickets : chacun lit et supprime les siens (les lignes suivent en cascade)
-- ---------------------------------------------------------------------
create policy tickets_lire on public.tickets
  for select to authenticated
  using (contributeur_id = (select auth.uid()));

create policy tickets_supprimer on public.tickets
  for delete to authenticated
  using (contributeur_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Observations : chacun lit les siennes ; le public passe par les
-- fonctions de statistiques, qui ne renvoient que des agrégats.
-- ---------------------------------------------------------------------
create policy obs_lire on public.observations_prix
  for select to authenticated
  using (contributeur_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Favoris et paniers : propriété exclusive
-- ---------------------------------------------------------------------
create policy favoris_miens on public.favoris
  for all to authenticated
  using (contributeur_id = (select auth.uid()))
  with check (contributeur_id = (select auth.uid()));

create policy paniers_miens on public.paniers
  for all to authenticated
  using (contributeur_id = (select auth.uid()))
  with check (contributeur_id = (select auth.uid()));

create policy panier_articles_miens on public.panier_articles
  for all to authenticated
  using (exists (
    select 1 from public.paniers p
    where p.id = panier_id and p.contributeur_id = (select auth.uid())))
  with check (exists (
    select 1 from public.paniers p
    where p.id = panier_id and p.contributeur_id = (select auth.uid())));

-- ---------------------------------------------------------------------
-- Privilèges explicites.
-- On retire tout, puis on accorde exactement ce dont l'app a besoin.
-- La migration fonctionne ainsi que l'option « Automatically expose new
-- tables » du projet Supabase soit cochée ou non, et une politique
-- ajoutée par erreur ne suffirait pas à ouvrir l'écriture des tickets.
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

revoke all on public.magasins, public.produits, public.alias_produits,
              public.tickets, public.observations_prix,
              public.favoris, public.paniers, public.panier_articles
  from anon, authenticated;

-- Référentiels : lecture publique ; ajout et modification par les membres
grant select                 on public.magasins, public.produits, public.alias_produits to anon, authenticated;
grant insert, update         on public.magasins, public.produits                        to authenticated;

-- Tickets et lignes : lecture et suppression de ses propres tickets ;
-- toute écriture passe par soumettre_ticket
grant select, delete         on public.tickets           to authenticated;
grant select                 on public.observations_prix to authenticated;

-- Favoris et paniers
grant select, insert, update, delete on public.favoris, public.paniers, public.panier_articles to authenticated;
