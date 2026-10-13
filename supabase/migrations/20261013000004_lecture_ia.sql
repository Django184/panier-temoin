-- =====================================================================
-- Panier Témoin — migration 4 : lecture du ticket par un modèle d'image
--
-- Nouvelle méthode de saisie « lecture_ia » : la photo est lue par un
-- modèle d'image (Mistral) via la fonction Edge « lire-ticket », puis
-- vérifiée par l'utilisateur comme pour les autres méthodes.
-- Les corps des deux fonctions sont ceux de la migration 3, seule la
-- liste des méthodes acceptées change. Les droits d'exécution sont
-- conservés par CREATE OR REPLACE.
-- =====================================================================

alter table public.tickets drop constraint if exists tickets_methode_check;
alter table public.tickets add constraint tickets_methode_check
  check (methode in ('lecture_ia', 'ocr_local', 'import_claude', 'saisie_manuelle', 'demo'));

create or replace function public._enregistrer_ticket(p jsonb, p_contributeur uuid)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_mag            jsonb := p -> 'magasin';
  v_filiale        text;
  v_magasin_id     uuid;
  v_date           date;
  v_heure          time(0);
  v_total          integer;
  v_rabais_total   integer;
  v_methode        text;
  v_empreinte      text;
  v_ticket_id      uuid;
  v_ligne          jsonb;
  v_num            integer;
  v_nb_lignes      integer;
  v_libelle        text;
  v_unite          public.unite_mesure;
  v_qte            numeric;
  v_prix           integer;
  v_rabais         integer;
  v_tot            integer;
  v_confirme       boolean;
  v_produit        uuid;
  v_produit_nom    text;
  v_tolerance      integer;
  v_ecart          integer;
  v_somme          integer := 0;
  v_somme_rabais   integer := 0;
  v_eval           record;
  v_statut         public.statut_qualite;
  v_a_verifier     integer[] := '{}';
  v_norm           text;
begin
  -- 1. En-tête -----------------------------------------------------------
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'donnees_invalides' using detail = 'Le ticket doit être un objet JSON.';
  end if;

  begin
    v_filiale      := nullif(trim(v_mag ->> 'numero_filiale'), '');
    v_date         := (p ->> 'date')::date;
    v_heure        := (p ->> 'heure')::time(0);
    v_total        := (p ->> 'total_centimes')::integer;
    v_rabais_total := (p ->> 'rabais_total_centimes')::integer;
    v_methode      := p ->> 'methode';
  exception
    when invalid_text_representation or invalid_datetime_format
         or datetime_field_overflow or numeric_value_out_of_range then
      raise exception 'donnees_invalides' using detail = 'En-tête illisible : ' || sqlerrm;
  end;

  if v_filiale is null or v_date is null or v_heure is null or v_total is null then
    raise exception 'donnees_incompletes'
      using detail = 'Le numéro de filiale, la date, l''heure et le total sont obligatoires.';
  end if;

  if v_date > current_date + 1 then
    raise exception 'date_future' using detail = format('Date d''achat dans le futur : %s.', v_date);
  end if;

  if v_methode is null or v_methode not in ('lecture_ia', 'ocr_local', 'import_claude', 'saisie_manuelle', 'demo') then
    raise exception 'methode_invalide' using detail = format('Méthode inconnue : %s.', coalesce(v_methode, 'aucune'));
  end if;

  if jsonb_typeof(p -> 'lignes') is distinct from 'array' then
    raise exception 'lignes_manquantes' using detail = 'Le ticket ne contient aucune ligne.';
  end if;
  v_nb_lignes := jsonb_array_length(p -> 'lignes');
  if v_nb_lignes not between 1 and 300 then
    raise exception 'lignes_manquantes' using detail = format('%s lignes reçues, 1 à 300 attendues.', v_nb_lignes);
  end if;

  -- 2. Magasin : créé au premier ticket, jamais écrasé ensuite ------------
  -- Pour un magasin déjà connu, seul le numéro de filiale est nécessaire.
  select m.id into v_magasin_id from public.magasins m where m.numero_filiale = v_filiale;

  if v_magasin_id is null then
    begin
      insert into public.magasins (numero_filiale, nom, format, localite, canton)
      values (v_filiale,
              trim(v_mag ->> 'nom'),
              upper(trim(v_mag ->> 'format')),
              nullif(trim(v_mag ->> 'localite'), ''),
              upper(trim(v_mag ->> 'canton')))
      on conflict (numero_filiale) do nothing
      returning id into v_magasin_id;
    exception
      when not_null_violation or check_violation then
        raise exception 'magasin_invalide'
          using detail = 'Nouveau magasin : numéro de filiale (4 à 8 chiffres), nom, format (M, MM ou MMM) et canton sont obligatoires.';
    end;

    -- Création simultanée par un autre envoi : on relit.
    if v_magasin_id is null then
      select m.id into v_magasin_id from public.magasins m where m.numero_filiale = v_filiale;
    end if;
  end if;

  -- 3. Empreinte anti-doublon ----------------------------------------------
  v_empreinte := encode(
    sha256(convert_to(format('%s|%s|%s|%s',
                             v_filiale,
                             to_char(v_date, 'YYYY-MM-DD'),
                             to_char(v_heure, 'HH24:MI:SS'),
                             v_total), 'UTF8')),
    'hex');

  if exists (select 1 from public.tickets t where t.empreinte = v_empreinte) then
    return jsonb_build_object('statut', 'doublon');
  end if;

  begin
    insert into public.tickets (contributeur_id, magasin_id, date_achat, heure_ticket,
                                total_centimes, rabais_total_centimes, empreinte, methode)
    values (p_contributeur, v_magasin_id, v_date, v_heure,
            v_total, coalesce(v_rabais_total, 0), v_empreinte, v_methode)
    returning id into v_ticket_id;
  exception
    when unique_violation then
      -- Deux envois simultanés du même ticket : le second est un doublon.
      return jsonb_build_object('statut', 'doublon');
  end;

  -- 4. Lignes ---------------------------------------------------------------
  for v_ligne, v_num in
    select l.value, l.ordinality::integer
    from jsonb_array_elements(p -> 'lignes') with ordinality as l(value, ordinality)
  loop
    begin
      v_libelle     := nullif(trim(v_ligne ->> 'libelle_brut'), '');
      v_unite       := coalesce(nullif(v_ligne ->> 'unite', ''), 'piece')::public.unite_mesure;
      v_qte         := (v_ligne ->> 'quantite')::numeric;
      v_prix        := (v_ligne ->> 'prix_normal_centimes')::integer;
      v_rabais      := coalesce((v_ligne ->> 'rabais_centimes')::integer, 0);
      v_tot         := (v_ligne ->> 'total_centimes')::integer;
      v_confirme    := coalesce((v_ligne ->> 'confirme')::boolean, false);
      v_produit     := nullif(v_ligne ->> 'produit_id', '')::uuid;
      v_produit_nom := nullif(trim(v_ligne ->> 'produit_nom'), '');
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'ligne_invalide' using detail = format('Ligne %s illisible : %s', v_num, sqlerrm);
    end;

    if v_libelle is null or v_qte is null or v_prix is null or v_tot is null
       or v_qte <= 0 or v_prix <= 0 or v_rabais < 0 or v_tot < 0 then
      raise exception 'ligne_invalide'
        using detail = format('Ligne %s : libellé, quantité, prix et total sont obligatoires et positifs.', v_num);
    end if;

    if v_unite = 'piece' and v_qte <> trunc(v_qte) then
      raise exception 'ligne_invalide'
        using detail = format('Ligne %s (%s) : quantité non entière pour un article à la pièce.', v_num, v_libelle);
    end if;

    -- Cohérence : quantité × prix − rabais = total.
    -- Tolérance : 1 centime à la pièce, 3 centimes pour un poids déduit.
    v_tolerance := case when v_unite = 'piece' then 1 else 3 end;
    v_ecart := abs(round(v_qte * v_prix)::integer - v_rabais - v_tot);
    if v_ecart > v_tolerance then
      raise exception 'ligne_incoherente'
        using detail = format('Ligne %s (%s) : %s × %s − %s ≠ %s.',
                              v_num, v_libelle,
                              trim(to_char(v_qte, 'FM9999990.999')),
                              to_char(v_prix / 100.0, 'FM999990.00'),
                              to_char(v_rabais / 100.0, 'FM999990.00'),
                              to_char(v_tot / 100.0, 'FM999990.00'));
    end if;

    -- Produit : existant, ou créé d'après le nom fourni.
    if v_produit is not null then
      if not exists (select 1 from public.produits pr where pr.id = v_produit) then
        raise exception 'produit_inconnu' using detail = format('Ligne %s : produit %s introuvable.', v_num, v_produit);
      end if;
    elsif v_produit_nom is not null then
      begin
        insert into public.produits (nom, vendu_au_poids)
        values (v_produit_nom, v_unite = 'kg')
        on conflict (nom) do nothing;
      exception
        when check_violation then
          raise exception 'ligne_invalide'
            using detail = format('Ligne %s : nom de produit trop court ou trop long.', v_num);
      end;
      select pr.id into v_produit from public.produits pr where pr.nom = v_produit_nom;
    else
      raise exception 'produit_manquant'
        using detail = format('Ligne %s (%s) : aucun produit associé.', v_num, v_libelle);
    end if;

    -- Prix inhabituel ?
    select * into v_eval
    from public._evaluer_prix(v_produit, v_unite, v_prix, v_date, v_ticket_id);

    if v_eval.signale then
      if v_confirme then
        v_statut := 'confirme';
      else
        v_statut := 'a_verifier';
        v_a_verifier := v_a_verifier || v_num;
      end if;
    else
      v_statut := 'ok';
    end if;

    insert into public.observations_prix (
      ticket_id, num_ligne, produit_id, magasin_id, contributeur_id, date_achat,
      libelle_brut, unite, quantite, prix_normal_centimes, rabais_centimes,
      total_centimes, prix_paye_centimes, statut_qualite, score_robuste,
      mediane_reference_centimes)
    values (
      v_ticket_id, v_num, v_produit, v_magasin_id, p_contributeur, v_date,
      left(v_libelle, 120), v_unite, v_qte, v_prix, v_rabais,
      v_tot, round(v_tot / v_qte)::integer, v_statut, v_eval.score,
      v_eval.mediane_centimes);

    -- Alias : ce libellé désigne désormais ce produit.
    v_norm := public.normaliser_libelle(v_libelle);
    if length(v_norm) >= 2 then
      insert into public.alias_produits (libelle_normalise, produit_id)
      values (left(v_norm, 120), v_produit)
      on conflict (libelle_normalise)
      do update set produit_id = excluded.produit_id, maj_le = now();
    end if;

    v_somme        := v_somme + v_tot;
    v_somme_rabais := v_somme_rabais + v_rabais;
  end loop;

  -- 5. Totaux du ticket ---------------------------------------------------
  -- Tolérance de 4 centimes pour un éventuel arrondi à 5 centimes.
  if abs(v_somme - v_total) > 4 then
    raise exception 'somme_incoherente'
      using detail = format('La somme des lignes (%s) diffère du total du ticket (%s).',
                            to_char(v_somme / 100.0, 'FM999990.00'),
                            to_char(v_total / 100.0, 'FM999990.00'));
  end if;

  if v_rabais_total is not null and v_rabais_total <> v_somme_rabais then
    raise exception 'rabais_incoherent'
      using detail = format('La somme des rabais (%s) diffère du montant « Vous économisez » (%s).',
                            to_char(v_somme_rabais / 100.0, 'FM999990.00'),
                            to_char(v_rabais_total / 100.0, 'FM999990.00'));
  end if;

  update public.tickets t
     set rabais_total_centimes = v_somme_rabais
   where t.id = v_ticket_id;

  return jsonb_build_object(
    'statut', 'ok',
    'ticket_id', v_ticket_id,
    'magasin_id', v_magasin_id,
    'nb_lignes', v_nb_lignes,
    'lignes_a_verifier', to_jsonb(v_a_verifier));
end;
$$;

create or replace function public.soumettre_ticket(p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'non_connecte' using errcode = '42501', detail = 'Connexion requise pour envoyer un ticket.';
  end if;

  if coalesce(p ->> 'methode', '') not in ('lecture_ia', 'ocr_local', 'import_claude', 'saisie_manuelle') then
    raise exception 'methode_invalide'
      using detail = 'Méthode attendue : lecture_ia, ocr_local, import_claude ou saisie_manuelle.';
  end if;

  return public._enregistrer_ticket(p, v_uid);
end;
$$;
