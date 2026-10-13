-- =====================================================================
-- Panier Témoin — migration 3/3 : fonctions
--
-- Fonctions internes (préfixe « _ », non exécutables par les clients) :
--   _evaluer_prix         score d'aberration d'un prix
--   _enregistrer_ticket   contrôles et insertion atomique d'un ticket
--
-- Fonctions appelables depuis l'app (RPC) :
--   soumettre_ticket       membre    envoi d'un ticket validé
--   controler_prix         membre    avertissement dans l'écran de validation
--   confirmer_observation  membre    confirmation d'un prix mis de côté
--   rechercher_produits    public    recherche par similarité
--   serie_prix             public    courbe hebdomadaire du prix normal
--   comparaison_magasins   public    prix médian par magasin
--   stats_promotions       public    fréquence et profondeur des promotions
--   indice_panier          membre    indice base 100 d'un panier type
--
-- Codes d'erreur : le message de l'exception est un code stable
-- (ex. « ligne_incoherente ») que l'app traduit ; le détail est en français.
-- =====================================================================

-- ---------------------------------------------------------------------
-- _evaluer_prix : compare un prix normal à la médiane des 60 jours
-- précédant la date d'achat, pour le même produit et la même unité.
--
--   - moins de 5 relevés : pas de verdict ;
--   - sinon score z modifié, avec un plancher de dispersion :
--       D = max(MAD, 5 % de la médiane)
--       M = 0,6745 × (x − médiane) / D, signalé si |M| > 3,5.
--
-- Le plancher évite deux pièges constatés sur l'historique de
-- démonstration : un MAD nul (prix tous identiques, fréquent en magasin)
-- et un MAD minuscule qui signalerait une simple hausse ou la saison des
-- légumes. Avec le plancher, il faut au moins ≈ 26 % d'écart à la
-- médiane pour être signalé ; une erreur de lecture typique (virgule
-- décalée, chiffre en trop) dépasse largement ce seuil.
-- La fenêtre de 60 jours suit les variations saisonnières.
-- ---------------------------------------------------------------------
create or replace function public._evaluer_prix(
  p_produit        uuid,
  p_unite          public.unite_mesure,
  p_centimes       integer,
  p_date           date default current_date,
  p_exclure_ticket uuid default null
)
returns table (nb integer, mediane_centimes integer, score numeric, signale boolean)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_nb      integer;
  v_mediane numeric;
  v_mad     numeric;
  v_score   numeric;
begin
  select count(*)::integer,
         percentile_cont(0.5) within group (order by o.prix_normal_centimes)::numeric
    into v_nb, v_mediane
  from public.observations_prix o
  where o.produit_id = p_produit
    and o.unite = p_unite
    and o.statut_qualite in ('ok', 'confirme')
    and o.date_achat between p_date - 60 and p_date
    and (p_exclure_ticket is null or o.ticket_id <> p_exclure_ticket);

  if v_nb < 5 then
    return query select v_nb, round(v_mediane)::integer, null::numeric, false;
    return;
  end if;

  select percentile_cont(0.5) within group (order by abs(o.prix_normal_centimes - v_mediane))::numeric
    into v_mad
  from public.observations_prix o
  where o.produit_id = p_produit
    and o.unite = p_unite
    and o.statut_qualite in ('ok', 'confirme')
    and o.date_achat between p_date - 60 and p_date
    and (p_exclure_ticket is null or o.ticket_id <> p_exclure_ticket);

  -- Plancher de dispersion : 5 % de la médiane (la médiane est > 0).
  v_mad   := greatest(v_mad, 0.05 * v_mediane);
  v_score := round(0.6745 * (p_centimes - v_mediane) / v_mad, 2);
  v_score := least(greatest(v_score, -999999), 999999);
  return query select v_nb, round(v_mediane)::integer, v_score, abs(v_score) > 3.5;
end;
$$;

-- ---------------------------------------------------------------------
-- _enregistrer_ticket : cœur de l'enregistrement, sans contrôle d'identité.
-- Appelée par soumettre_ticket (contributeur = compte connecté) et par
-- le script de démonstration (contributeur nul, méthode 'demo').
--
-- Format attendu de p :
-- {
--   "magasin": {"numero_filiale": "064590", "nom": "MM Métropole Renens",
--               "format": "MM", "localite": "Renens", "canton": "VD"},
--   "date": "2026-10-12", "heure": "19:00:05",
--   "total_centimes": 2460, "rabais_total_centimes": 400,
--   "methode": "ocr_local",
--   "lignes": [
--     {"libelle_brut": "Agnesi Linguine N.10", "produit_id": null,
--      "produit_nom": "Agnesi Linguine N.10", "unite": "piece",
--      "quantite": 3, "prix_normal_centimes": 240, "rabais_centimes": 288,
--      "total_centimes": 432, "confirme": false},
--     ...
--   ]
-- }
-- « produit_id » désigne un produit existant ; sinon « produit_nom » crée
-- (ou retrouve) le produit de ce nom. « confirme » = l'utilisateur a vu
-- l'avertissement de prix inhabituel et le maintient.
--
-- Retour : {"statut": "ok", "ticket_id": …, "nb_lignes": …,
--           "lignes_a_verifier": [num, …]}  ou  {"statut": "doublon"}
-- ---------------------------------------------------------------------
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

  if v_methode is null or v_methode not in ('ocr_local', 'import_claude', 'saisie_manuelle', 'demo') then
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

-- ---------------------------------------------------------------------
-- soumettre_ticket : point d'entrée de l'app pour un ticket validé.
-- ---------------------------------------------------------------------
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

  if coalesce(p ->> 'methode', '') not in ('ocr_local', 'import_claude', 'saisie_manuelle') then
    raise exception 'methode_invalide'
      using detail = 'Méthode attendue : ocr_local, import_claude ou saisie_manuelle.';
  end if;

  return public._enregistrer_ticket(p, v_uid);
end;
$$;

-- ---------------------------------------------------------------------
-- controler_prix : même calcul que lors de l'envoi, pour avertir dans
-- l'écran de validation avant l'envoi.
-- Retour : {"nb": 12, "mediane_centimes": 320, "score": null, "signale": true}
-- ---------------------------------------------------------------------
create or replace function public.controler_prix(
  p_produit  uuid,
  p_unite    public.unite_mesure,
  p_centimes integer,
  p_date     date default current_date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'nb', e.nb,
           'mediane_centimes', e.mediane_centimes,
           'score', e.score,
           'signale', e.signale)
  from public._evaluer_prix(p_produit, p_unite, p_centimes, coalesce(p_date, current_date), null) e
$$;

-- ---------------------------------------------------------------------
-- confirmer_observation : l'auteur confirme un prix mis de côté.
-- Pour corriger un prix, on supprime le ticket et on le saisit à nouveau.
-- ---------------------------------------------------------------------
create or replace function public.confirmer_observation(p_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'non_connecte' using errcode = '42501';
  end if;

  update public.observations_prix o
     set statut_qualite = 'confirme'
   where o.id = p_id
     and o.contributeur_id = auth.uid()
     and o.statut_qualite = 'a_verifier';

  if not found then
    raise exception 'observation_introuvable'
      using detail = 'Aucune ligne à vérifier ne correspond à cet identifiant pour ce compte.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- rechercher_produits : recherche par sous-chaîne et similarité, sur les
-- noms de produits et sur les alias. Un alias identique au libellé
-- cherché obtient le score maximal (1) : c'est ainsi que l'écran de
-- validation retrouve le produit d'un libellé déjà vu.
-- ---------------------------------------------------------------------
create or replace function public.rechercher_produits(p_texte text, p_limite integer default 20)
returns table (
  produit_id            uuid,
  nom                   text,
  vendu_au_poids        boolean,
  score                 real,
  nb_releves            bigint,
  dernier_prix_centimes integer,
  derniere_unite        public.unite_mesure
)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select public.normaliser_libelle(p_texte) as v
  ),
  candidats as (
    select pr.id,
           greatest(extensions.similarity(public.normaliser_libelle(pr.nom), q.v),
                    case when strpos(public.normaliser_libelle(pr.nom), q.v) > 0 then 0.6 else 0 end)::real as s
    from public.produits pr, q
    where length(q.v) >= 2
      and (strpos(public.normaliser_libelle(pr.nom), q.v) > 0
           or extensions.similarity(public.normaliser_libelle(pr.nom), q.v) > 0.25)
    union all
    select a.produit_id,
           case when a.libelle_normalise = q.v then 1
                else greatest(extensions.similarity(a.libelle_normalise, q.v),
                              case when strpos(a.libelle_normalise, q.v) > 0 then 0.6 else 0 end)
           end::real
    from public.alias_produits a, q
    where length(q.v) >= 2
      and (a.libelle_normalise = q.v
           or strpos(a.libelle_normalise, q.v) > 0
           or extensions.similarity(a.libelle_normalise, q.v) > 0.25)
  ),
  meilleurs as (
    select c.id, max(c.s) as s
    from candidats c
    group by c.id
  )
  select m.id,
         pr.nom,
         pr.vendu_au_poids,
         m.s,
         (select count(*) from public.observations_prix o
           where o.produit_id = m.id and o.statut_qualite <> 'a_verifier'),
         d.prix_normal_centimes,
         d.unite
  from meilleurs m
  join public.produits pr on pr.id = m.id
  left join lateral (
    select o.prix_normal_centimes, o.unite
    from public.observations_prix o
    where o.produit_id = m.id and o.statut_qualite <> 'a_verifier'
    order by o.date_achat desc, o.id desc
    limit 1
  ) d on true
  order by m.s desc, pr.nom
  limit greatest(1, least(coalesce(p_limite, 20), 50))
$$;

-- ---------------------------------------------------------------------
-- serie_prix : médiane hebdomadaire du prix normal (semaine = lundi),
-- filtrable par magasin et par canton. Les prix mis de côté sont exclus.
-- ---------------------------------------------------------------------
create or replace function public.serie_prix(
  p_produit uuid,
  p_magasin uuid    default null,
  p_canton  char(2) default null,
  p_debut   date    default (current_date - 365),
  p_fin     date    default current_date
)
returns table (
  semaine          date,
  unite            public.unite_mesure,
  mediane_centimes integer,
  min_centimes     integer,
  max_centimes     integer,
  nb_releves       bigint,
  nb_magasins      bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select date_trunc('week', o.date_achat)::date,
         o.unite,
         round(percentile_cont(0.5) within group (order by o.prix_normal_centimes))::integer,
         min(o.prix_normal_centimes),
         max(o.prix_normal_centimes),
         count(*),
         count(distinct o.magasin_id)
  from public.observations_prix o
  join public.magasins m on m.id = o.magasin_id
  where o.produit_id = p_produit
    and o.statut_qualite in ('ok', 'confirme')
    and o.date_achat between coalesce(p_debut, current_date - 365) and coalesce(p_fin, current_date)
    and (p_magasin is null or o.magasin_id = p_magasin)
    and (p_canton is null or m.canton = upper(p_canton))
  group by 1, 2
  order by 1, 2
$$;

-- ---------------------------------------------------------------------
-- comparaison_magasins : prix normal médian et dernier prix relevé par
-- magasin sur la période, du moins cher au plus cher.
-- ---------------------------------------------------------------------
create or replace function public.comparaison_magasins(p_produit uuid, p_jours integer default 180)
returns table (
  magasin_id            uuid,
  magasin_nom           text,
  localite              text,
  canton                char(2),
  unite                 public.unite_mesure,
  mediane_centimes      integer,
  dernier_prix_centimes integer,
  dernier_releve        date,
  nb_releves            bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id,
         m.nom,
         m.localite,
         m.canton,
         o.unite,
         round(percentile_cont(0.5) within group (order by o.prix_normal_centimes))::integer,
         (array_agg(o.prix_normal_centimes order by o.date_achat desc, o.id desc))[1],
         max(o.date_achat),
         count(*)
  from public.observations_prix o
  join public.magasins m on m.id = o.magasin_id
  where o.produit_id = p_produit
    and o.statut_qualite in ('ok', 'confirme')
    and o.date_achat >= current_date - greatest(coalesce(p_jours, 180), 1)
  group by m.id, m.nom, m.localite, m.canton, o.unite
  order by 6, 2
$$;

-- ---------------------------------------------------------------------
-- stats_promotions : part des achats en promotion et profondeur du rabais
-- (rabais ÷ (quantité × prix normal)), en pourcentage.
-- ---------------------------------------------------------------------
create or replace function public.stats_promotions(p_produit uuid, p_jours integer default 365)
returns table (
  nb_achats        bigint,
  nb_promos        bigint,
  part_promo_pct   numeric,
  rabais_moyen_pct numeric,
  rabais_max_pct   numeric,
  derniere_promo   date
)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*),
         count(*) filter (where o.est_promo),
         round(100.0 * count(*) filter (where o.est_promo) / nullif(count(*), 0), 1),
         round(avg(100.0 * o.rabais_centimes / (o.quantite * o.prix_normal_centimes))
               filter (where o.est_promo), 1),
         round(max(100.0 * o.rabais_centimes / (o.quantite * o.prix_normal_centimes))
               filter (where o.est_promo), 1),
         max(o.date_achat) filter (where o.est_promo)
  from public.observations_prix o
  where o.produit_id = p_produit
    and o.statut_qualite in ('ok', 'confirme')
    and o.date_achat >= current_date - greatest(coalesce(p_jours, 365), 1)
$$;

-- ---------------------------------------------------------------------
-- indice_panier : indice base 100 d'un panier type, par mois.
--
-- Pour chaque produit, prix du mois = médiane des prix normaux du mois,
-- tous magasins confondus ; un mois sans relevé reprend le dernier prix
-- connu. Base = prix du mois de date_base (ou, à défaut, premier prix
-- connu). Indice = Σ quantité × prix du mois ÷ Σ quantité × prix de base
-- × 100, sur les produits qui ont un prix ce mois-là.
-- ---------------------------------------------------------------------
create or replace function public.indice_panier(p_panier uuid)
returns table (
  mois                 date,
  indice               numeric,
  nb_produits_couverts integer,
  nb_produits          integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_base    date;
  v_proprio uuid;
begin
  select pa.date_base, pa.contributeur_id
    into v_base, v_proprio
  from public.paniers pa
  where pa.id = p_panier;

  if v_proprio is null or auth.uid() is null or v_proprio <> auth.uid() then
    raise exception 'panier_introuvable' using detail = 'Ce panier n''existe pas ou n''est pas le vôtre.';
  end if;

  return query
  with articles as (
    select a.produit_id, a.quantite
    from public.panier_articles a
    where a.panier_id = p_panier
  ),
  serie as (
    select g::date as mois
    from generate_series(date_trunc('month', v_base),
                         date_trunc('month', current_date),
                         interval '1 month') as g
  ),
  mensuel as (
    select o.produit_id,
           date_trunc('month', o.date_achat)::date as mois,
           (percentile_cont(0.5) within group (order by o.prix_normal_centimes))::numeric as prix
    from public.observations_prix o
    join articles a on a.produit_id = o.produit_id
    where o.statut_qualite in ('ok', 'confirme')
    group by o.produit_id, date_trunc('month', o.date_achat)
  ),
  grille as (
    select a.produit_id, a.quantite, s.mois,
           (select me.prix from mensuel me
             where me.produit_id = a.produit_id and me.mois <= s.mois
             order by me.mois desc limit 1) as prix
    from articles a
    cross join serie s
  ),
  base as (
    select a.produit_id,
           coalesce(
             (select me.prix from mensuel me
               where me.produit_id = a.produit_id
                 and me.mois <= date_trunc('month', v_base)::date
               order by me.mois desc limit 1),
             (select me.prix from mensuel me
               where me.produit_id = a.produit_id
               order by me.mois limit 1)) as prix_base
    from articles a
  )
  select g.mois,
         round(100 * sum(g.quantite * g.prix) / nullif(sum(g.quantite * b.prix_base), 0), 1),
         count(*)::integer,
         (select count(*) from articles)::integer
  from grille g
  join base b on b.produit_id = g.produit_id
  where g.prix is not null and b.prix_base is not null
  group by g.mois
  order by g.mois;
end;
$$;

-- ---------------------------------------------------------------------
-- Droits d'exécution.
-- Postgres accorde EXECUTE à PUBLIC par défaut, et Supabase l'accorde
-- aussi à anon et authenticated : on retire tout, puis on accorde.
-- ---------------------------------------------------------------------
revoke execute on function public._evaluer_prix(uuid, public.unite_mesure, integer, date, uuid)
  from public, anon, authenticated;
revoke execute on function public._enregistrer_ticket(jsonb, uuid)
  from public, anon, authenticated;

revoke execute on function public.soumettre_ticket(jsonb)                                  from public, anon, authenticated;
revoke execute on function public.controler_prix(uuid, public.unite_mesure, integer, date) from public, anon, authenticated;
revoke execute on function public.confirmer_observation(bigint)                            from public, anon, authenticated;
revoke execute on function public.indice_panier(uuid)                                      from public, anon, authenticated;
revoke execute on function public.rechercher_produits(text, integer)                       from public, anon, authenticated;
revoke execute on function public.serie_prix(uuid, uuid, char, date, date)                 from public, anon, authenticated;
revoke execute on function public.comparaison_magasins(uuid, integer)                      from public, anon, authenticated;
revoke execute on function public.stats_promotions(uuid, integer)                          from public, anon, authenticated;

-- Membres connectés
grant execute on function public.soumettre_ticket(jsonb)                                  to authenticated;
grant execute on function public.controler_prix(uuid, public.unite_mesure, integer, date) to authenticated;
grant execute on function public.confirmer_observation(bigint)                            to authenticated;
grant execute on function public.indice_panier(uuid)                                      to authenticated;

-- Consultation publique
grant execute on function public.rechercher_produits(text, integer)       to anon, authenticated;
grant execute on function public.serie_prix(uuid, uuid, char, date, date) to anon, authenticated;
grant execute on function public.comparaison_magasins(uuid, integer)      to anon, authenticated;
grant execute on function public.stats_promotions(uuid, integer)          to anon, authenticated;
grant execute on function public.normaliser_libelle(text)                 to anon, authenticated;
