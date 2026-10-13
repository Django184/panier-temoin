-- =====================================================================
-- Panier Témoin — carte Cumulus partagée
--
-- Le code de la carte Cumulus du foyer, affiché en QR code à la caisse.
-- Une seule carte (ligne unique), lisible et modifiable par les comptes
-- connectés, invisible sans compte : le code n'est ni dans le code
-- public de l'app ni dans les statistiques. Il n'est jamais lié aux
-- tickets enregistrés.
-- =====================================================================

create table public.carte_cumulus (
  id          smallint primary key default 1 check (id = 1),
  code        text not null check (length(code) between 4 and 500),
  modifie_le  timestamptz not null default now(),
  modifie_par uuid default auth.uid()
);

comment on table public.carte_cumulus is
  'Code de la carte Cumulus du foyer, affiché en QR code. Réservé aux comptes connectés.';

alter table public.carte_cumulus enable row level security;

create policy carte_lecture on public.carte_cumulus
  for select to authenticated using (true);
create policy carte_ajout on public.carte_cumulus
  for insert to authenticated with check (id = 1);
create policy carte_modification on public.carte_cumulus
  for update to authenticated using (true) with check (id = 1);
create policy carte_suppression on public.carte_cumulus
  for delete to authenticated using (true);

revoke all on public.carte_cumulus from anon, authenticated;
grant select, insert, update, delete on public.carte_cumulus to authenticated;
