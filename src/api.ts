// Accès aux données : toutes les lectures et écritures de l'app passent
// par ce module. Les erreurs de la base arrivent avec un code stable
// (« ligne_incoherente »…) traduit ici en message pour l'utilisateur.

import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from './supabase.ts';
import type { TicketBrouillon, Unite } from './lib/types.ts';

// ---------------------------------------------------------------------
// Erreurs
// ---------------------------------------------------------------------

const MESSAGES: Record<string, string> = {
  non_connecte: 'Connectez-vous pour continuer.',
  donnees_invalides: 'Le ticket contient une valeur illisible.',
  donnees_incompletes: 'Il manque le numéro de filiale, la date, l’heure ou le total.',
  date_future: 'La date d’achat est dans le futur.',
  methode_invalide: 'Méthode de saisie inconnue.',
  lignes_manquantes: 'Le ticket ne contient aucune ligne.',
  magasin_invalide: 'Nouveau magasin : indiquez le nom, le format et le canton.',
  ligne_invalide: 'Une ligne est incomplète.',
  ligne_incoherente: 'Une ligne ne tombe pas juste.',
  produit_inconnu: 'Un produit choisi n’existe plus.',
  produit_manquant: 'Une ligne n’a pas de produit.',
  somme_incoherente: 'La somme des lignes ne correspond pas au total.',
  rabais_incoherent: 'La somme des rabais ne correspond pas à « Vous économisez ».',
  observation_introuvable: 'Cette ligne n’est plus à vérifier.',
  panier_introuvable: 'Ce panier n’existe pas ou n’est pas le vôtre.',
};

export class ErreurApi extends Error {}

function erreur(e: PostgrestError | Error | null | undefined): ErreurApi {
  if (!e) return new ErreurApi('Erreur inconnue.');
  if ('details' in e || 'code' in e) {
    const pg = e as PostgrestError;
    const base = MESSAGES[pg.message];
    if (base) return new ErreurApi(pg.details ? `${base} ${pg.details}` : base);
    if (pg.code === '42501') return new ErreurApi('Action non autorisée. Êtes-vous connecté ?');
    if (/fetch|network/i.test(pg.message)) return new ErreurApi('Pas de connexion au serveur. Réessayez une fois en ligne.');
    return new ErreurApi(pg.message);
  }
  if (/fetch|network/i.test(e.message)) return new ErreurApi('Pas de connexion au serveur. Réessayez une fois en ligne.');
  return new ErreurApi(e.message);
}

// ---------------------------------------------------------------------
// Connexion
// ---------------------------------------------------------------------

export async function connecter(email: string, motDePasse: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: motDePasse });
  if (error) {
    if (/invalid login credentials/i.test(error.message)) {
      throw new ErreurApi('E-mail ou mot de passe incorrect.');
    }
    throw erreur(error);
  }
}

export async function deconnecter(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw erreur(error);
  oublierCarteLocale();
}

// ---------------------------------------------------------------------
// Carte Cumulus du foyer (comptes connectés seulement)
// ---------------------------------------------------------------------

// Deux formes de la carte : « code » (texte du code Aztec de Google
// Wallet) et « numero » (13 chiffres, code-barres EAN-13). Copie locale,
// pour afficher la carte au magasin même sans réseau ; effacée à la
// déconnexion.
export interface Carte {
  code: string | null;
  numero: string | null;
}

const CLE_CARTE = 'panier-temoin:carte-cumulus';

export function carteLocale(): Carte | null {
  try {
    const brut = window.localStorage.getItem(CLE_CARTE);
    if (!brut) return null;
    const carte = JSON.parse(brut) as Carte;
    return carte.code || carte.numero ? carte : null;
  } catch {
    return null;
  }
}

function garderCarteLocale(carte: Carte | null): void {
  try {
    if (carte && (carte.code || carte.numero)) window.localStorage.setItem(CLE_CARTE, JSON.stringify(carte));
    else window.localStorage.removeItem(CLE_CARTE);
  } catch {
    // Stockage indisponible : la carte sera relue en ligne.
  }
}

function oublierCarteLocale(): void {
  garderCarteLocale(null);
}

/** Carte enregistrée dans la base (null s'il n'y en a pas). */
export async function lireCarteCumulus(): Promise<Carte | null> {
  const { data, error } = await supabase.from('carte_cumulus').select('code, numero').maybeSingle();
  if (error) throw erreur(error);
  const carte = (data as Carte | null) ?? null;
  garderCarteLocale(carte);
  return carte;
}

export async function enregistrerCarteCumulus(carte: Carte): Promise<void> {
  const propre = { code: carte.code?.trim() || null, numero: carte.numero?.replace(/\s/g, '') || null };
  const { error } = await supabase.from('carte_cumulus').upsert({ id: 1, ...propre, modifie_le: new Date().toISOString() });
  if (error) throw erreur(error);
  garderCarteLocale(propre);
}

export async function supprimerCarteCumulus(): Promise<void> {
  const { error } = await supabase.from('carte_cumulus').delete().eq('id', 1);
  if (error) throw erreur(error);
  garderCarteLocale(null);
}

// ---------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------

export type ResultatEnvoi =
  | { statut: 'ok'; ticketId: string; nbLignes: number; lignesAVerifier: number[] }
  | { statut: 'doublon' };

/** Envoie un ticket validé. Les contrôles définitifs sont faits par la base. */
export async function soumettreTicket(ticket: TicketBrouillon): Promise<ResultatEnvoi> {
  const p = {
    magasin: {
      numero_filiale: ticket.magasin.numeroFiliale,
      nom: ticket.magasin.nom.trim(),
      format: ticket.magasin.format,
      localite: ticket.magasin.localite.trim(),
      canton: ticket.magasin.canton,
    },
    date: ticket.date,
    heure: ticket.heure,
    total_centimes: ticket.totalCentimes,
    rabais_total_centimes: ticket.rabaisTotalCentimes,
    methode: ticket.methode,
    lignes: ticket.lignes.map((l) => ({
      libelle_brut: l.libelle.trim(),
      produit_id: l.produitId,
      produit_nom: l.produitId ? null : l.produitNom.trim(),
      unite: l.unite,
      quantite: l.quantite,
      prix_normal_centimes: l.prixCentimes,
      rabais_centimes: l.rabaisCentimes,
      total_centimes: l.totalCentimes,
      confirme: l.prixConfirme,
    })),
  };
  const { data, error } = await supabase.rpc('soumettre_ticket', { p });
  if (error) throw erreur(error);
  const r = data as { statut: string; ticket_id?: string; nb_lignes?: number; lignes_a_verifier?: number[] };
  if (r.statut === 'doublon') return { statut: 'doublon' };
  return {
    statut: 'ok',
    ticketId: r.ticket_id ?? '',
    nbLignes: r.nb_lignes ?? 0,
    lignesAVerifier: r.lignes_a_verifier ?? [],
  };
}

export interface MonTicket {
  id: string;
  date_achat: string;
  heure_ticket: string;
  total_centimes: number;
  methode: string;
  magasin: string;
}

export async function mesTickets(): Promise<MonTicket[]> {
  const { data, error } = await supabase
    .from('tickets')
    .select('id, date_achat, heure_ticket, total_centimes, methode, magasins(nom)')
    .order('date_achat', { ascending: false })
    .order('heure_ticket', { ascending: false })
    .limit(200);
  if (error) throw erreur(error);
  return (data ?? []).map((t) => {
    const ligne = t as unknown as Omit<MonTicket, 'magasin'> & { magasins: { nom: string } | null };
    return { ...ligne, magasin: ligne.magasins?.nom ?? '' };
  });
}

export async function supprimerTicket(id: string): Promise<void> {
  const { error } = await supabase.from('tickets').delete().eq('id', id);
  if (error) throw erreur(error);
}

export interface LigneAVerifier {
  id: number;
  libelle_brut: string;
  date_achat: string;
  prix_normal_centimes: number;
  mediane_reference_centimes: number | null;
  unite: Unite;
}

export async function lignesAVerifier(): Promise<LigneAVerifier[]> {
  const { data, error } = await supabase
    .from('observations_prix')
    .select('id, libelle_brut, date_achat, prix_normal_centimes, mediane_reference_centimes, unite')
    .eq('statut_qualite', 'a_verifier')
    .order('date_achat', { ascending: false });
  if (error) throw erreur(error);
  return (data ?? []) as LigneAVerifier[];
}

export async function confirmerObservation(id: number): Promise<void> {
  const { error } = await supabase.rpc('confirmer_observation', { p_id: id });
  if (error) throw erreur(error);
}

// ---------------------------------------------------------------------
// Magasins et produits
// ---------------------------------------------------------------------

export interface Magasin {
  id: string;
  numero_filiale: string;
  nom: string;
  format: 'M' | 'MM' | 'MMM';
  localite: string | null;
  canton: string;
}

export async function magasinParFiliale(numero: string): Promise<Magasin | null> {
  const { data, error } = await supabase.from('magasins').select('*').eq('numero_filiale', numero).maybeSingle();
  if (error) throw erreur(error);
  return (data as Magasin | null) ?? null;
}

export async function listeMagasins(): Promise<Magasin[]> {
  const { data, error } = await supabase.from('magasins').select('*').order('nom');
  if (error) throw erreur(error);
  return (data ?? []) as Magasin[];
}

export interface Produit {
  id: string;
  nom: string;
  vendu_au_poids: boolean;
}

export async function produit(id: string): Promise<Produit | null> {
  const { data, error } = await supabase.from('produits').select('id, nom, vendu_au_poids').eq('id', id).maybeSingle();
  if (error) throw erreur(error);
  return (data as Produit | null) ?? null;
}

export async function renommerProduit(id: string, nom: string): Promise<void> {
  const { error } = await supabase.from('produits').update({ nom: nom.trim() }).eq('id', id);
  if (error) {
    if (error.code === '23505') throw new ErreurApi('Un autre produit porte déjà ce nom.');
    throw erreur(error);
  }
}

export interface ResultatRecherche {
  produit_id: string;
  nom: string;
  vendu_au_poids: boolean;
  score: number;
  nb_releves: number;
  dernier_prix_centimes: number | null;
  derniere_unite: Unite | null;
}

export async function rechercherProduits(texte: string, limite = 20): Promise<ResultatRecherche[]> {
  if (texte.trim().length < 2) return [];
  const { data, error } = await supabase.rpc('rechercher_produits', { p_texte: texte, p_limite: limite });
  if (error) throw erreur(error);
  return (data ?? []) as ResultatRecherche[];
}

export interface ControlePrix {
  nb: number;
  mediane_centimes: number | null;
  score: number | null;
  signale: boolean;
}

export async function controlerPrix(
  produitId: string,
  unite: Unite,
  centimes: number,
  date: string,
): Promise<ControlePrix> {
  const { data, error } = await supabase.rpc('controler_prix', {
    p_produit: produitId,
    p_unite: unite,
    p_centimes: centimes,
    p_date: date || null,
  });
  if (error) throw erreur(error);
  return data as ControlePrix;
}

// ---------------------------------------------------------------------
// Statistiques
// ---------------------------------------------------------------------

export interface DernierAchat {
  produit_id: string;
  nom: string;
  vendu_au_poids: boolean;
  unite: Unite;
  date_achat: string;
  prix_normal_centimes: number;
  prix_paye_centimes: number;
  est_promo: boolean;
  precedent_prix_centimes: number | null;
  precedent_date: string | null;
  variation_pct: number | null;
}

/** Derniers produits achetés, avec l'écart de prix par rapport à l'achat précédent. */
export async function derniersAchats(limite = 40): Promise<DernierAchat[]> {
  const { data, error } = await supabase.rpc('derniers_achats', { p_limite: limite });
  if (error) {
    // Fonction pas encore créée dans la base (migration 7 non exécutée).
    if (/derniers_achats|function|PGRST202/i.test(`${error.code} ${error.message}`)) return [];
    throw erreur(error);
  }
  return ((data ?? []) as DernierAchat[]).map((d) => ({
    ...d,
    variation_pct: d.variation_pct === null ? null : Number(d.variation_pct),
  }));
}

export interface PointSerie {
  semaine: string;
  unite: Unite;
  mediane_centimes: number;
  min_centimes: number;
  max_centimes: number;
  nb_releves: number;
  nb_magasins: number;
}

export async function seriePrix(
  produitId: string,
  options: { magasinId?: string | null; canton?: string | null; debut?: string | null },
): Promise<PointSerie[]> {
  const { data, error } = await supabase.rpc('serie_prix', {
    p_produit: produitId,
    p_magasin: options.magasinId ?? null,
    p_canton: options.canton ?? null,
    p_debut: options.debut ?? '2020-01-01',
  });
  if (error) throw erreur(error);
  return (data ?? []) as PointSerie[];
}

export interface PrixMagasin {
  magasin_id: string;
  magasin_nom: string;
  localite: string | null;
  canton: string;
  unite: Unite;
  mediane_centimes: number;
  dernier_prix_centimes: number;
  dernier_releve: string;
  nb_releves: number;
}

export async function comparaisonMagasins(produitId: string, jours: number): Promise<PrixMagasin[]> {
  const { data, error } = await supabase.rpc('comparaison_magasins', { p_produit: produitId, p_jours: jours });
  if (error) throw erreur(error);
  return (data ?? []) as PrixMagasin[];
}

export interface StatsPromotions {
  nb_achats: number;
  nb_promos: number;
  part_promo_pct: number | null;
  rabais_moyen_pct: number | null;
  rabais_max_pct: number | null;
  derniere_promo: string | null;
}

export async function statsPromotions(produitId: string, jours: number): Promise<StatsPromotions | null> {
  const { data, error } = await supabase.rpc('stats_promotions', { p_produit: produitId, p_jours: jours });
  if (error) throw erreur(error);
  const lignes = (data ?? []) as StatsPromotions[];
  return lignes[0] ?? null;
}

// ---------------------------------------------------------------------
// Favoris
// ---------------------------------------------------------------------

export async function mesFavoris(): Promise<Produit[]> {
  const { data, error } = await supabase.from('favoris').select('produits(id, nom, vendu_au_poids)');
  if (error) throw erreur(error);
  return (data ?? [])
    .map((f) => (f as unknown as { produits: Produit | null }).produits)
    .filter((p): p is Produit => p !== null)
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

export async function estFavori(produitId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('favoris')
    .select('produit_id', { count: 'exact', head: true })
    .eq('produit_id', produitId);
  if (error) throw erreur(error);
  return (count ?? 0) > 0;
}

export async function basculerFavori(produitId: string, utilisateurId: string, ajouter: boolean): Promise<void> {
  const requete = ajouter
    ? supabase.from('favoris').insert({ contributeur_id: utilisateurId, produit_id: produitId })
    : supabase.from('favoris').delete().eq('produit_id', produitId);
  const { error } = await requete;
  if (error && error.code !== '23505') throw erreur(error);
}

// ---------------------------------------------------------------------
// Paniers types
// ---------------------------------------------------------------------

export interface Panier {
  id: string;
  nom: string;
  date_base: string;
}

export interface ArticlePanier {
  produit_id: string;
  quantite: number;
  nom: string;
  vendu_au_poids: boolean;
}

export interface PointIndice {
  mois: string;
  indice: number;
  nb_produits_couverts: number;
  nb_produits: number;
}

export async function mesPaniers(): Promise<Panier[]> {
  const { data, error } = await supabase.from('paniers').select('id, nom, date_base').order('cree_le');
  if (error) throw erreur(error);
  return (data ?? []) as Panier[];
}

export async function creerPanier(utilisateurId: string, nom: string, dateBase: string): Promise<Panier> {
  const { data, error } = await supabase
    .from('paniers')
    .insert({ contributeur_id: utilisateurId, nom: nom.trim(), date_base: dateBase })
    .select('id, nom, date_base')
    .single();
  if (error) throw erreur(error);
  return data as Panier;
}

export async function supprimerPanier(id: string): Promise<void> {
  const { error } = await supabase.from('paniers').delete().eq('id', id);
  if (error) throw erreur(error);
}

export async function panier(id: string): Promise<Panier | null> {
  const { data, error } = await supabase.from('paniers').select('id, nom, date_base').eq('id', id).maybeSingle();
  if (error) throw erreur(error);
  return (data as Panier | null) ?? null;
}

export async function articlesPanier(panierId: string): Promise<ArticlePanier[]> {
  const { data, error } = await supabase
    .from('panier_articles')
    .select('produit_id, quantite, produits(nom, vendu_au_poids)')
    .eq('panier_id', panierId);
  if (error) throw erreur(error);
  return (data ?? [])
    .map((a) => {
      const brut = a as unknown as { produit_id: string; quantite: number; produits: { nom: string; vendu_au_poids: boolean } | null };
      return {
        produit_id: brut.produit_id,
        quantite: Number(brut.quantite),
        nom: brut.produits?.nom ?? '',
        vendu_au_poids: brut.produits?.vendu_au_poids ?? false,
      };
    })
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

export async function ajouterArticle(panierId: string, produitId: string, quantite: number): Promise<void> {
  const { error } = await supabase
    .from('panier_articles')
    .upsert({ panier_id: panierId, produit_id: produitId, quantite }, { onConflict: 'panier_id,produit_id' });
  if (error) throw erreur(error);
}

export async function retirerArticle(panierId: string, produitId: string): Promise<void> {
  const { error } = await supabase.from('panier_articles').delete().eq('panier_id', panierId).eq('produit_id', produitId);
  if (error) throw erreur(error);
}

export async function indicePanier(panierId: string): Promise<PointIndice[]> {
  const { data, error } = await supabase.rpc('indice_panier', { p_panier: panierId });
  if (error) throw erreur(error);
  return ((data ?? []) as PointIndice[]).map((p) => ({ ...p, indice: Number(p.indice) }));
}
