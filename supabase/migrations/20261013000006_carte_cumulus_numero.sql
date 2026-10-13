-- =====================================================================
-- Panier Témoin — carte Cumulus : numéro de carte en plus du code Wallet
--
-- La carte Cumulus existe sous deux formes :
--  - « code » : le texte du code Aztec de Google Wallet / de l'app Migros ;
--  - « numero » : les 13 chiffres de la carte (code-barres EAN-13).
-- L'un des deux au moins est enregistré.
-- =====================================================================

alter table public.carte_cumulus
  add column numero text check (numero ~ '^[0-9]{13}$');

alter table public.carte_cumulus alter column code drop not null;

alter table public.carte_cumulus
  add constraint carte_code_ou_numero check (code is not null or numero is not null);
