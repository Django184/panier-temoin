// Contrôles arithmétiques d'une ligne et d'un ticket. Les mêmes règles
// sont appliquées par la base (fonction _enregistrer_ticket) : un ticket
// jugé prêt ici sera accepté par le serveur.

import type { LigneBrouillon, TicketBrouillon } from './types.ts';
import { produitCentimes } from './montants.ts';

/** Tolérance en centimes : 1 à la pièce, 3 pour un poids déduit. */
export function tolerance(ligne: Pick<LigneBrouillon, 'unite'>): number {
  return ligne.unite === 'piece' ? 1 : 3;
}

/** Écart entre quantité × prix − rabais et le total, ou null si incomplet. */
export function ecartLigne(
  ligne: Pick<LigneBrouillon, 'quantite' | 'prixCentimes' | 'rabaisCentimes' | 'totalCentimes'>,
): number | null {
  if (ligne.prixCentimes === null || ligne.totalCentimes === null || !(ligne.quantite > 0)) return null;
  return produitCentimes(ligne.quantite, ligne.prixCentimes) - ligne.rabaisCentimes - ligne.totalCentimes;
}

export function ligneCoherente(ligne: LigneBrouillon): boolean {
  const ecart = ecartLigne(ligne);
  if (ecart === null) return false;
  if (ligne.unite === 'piece' && !Number.isInteger(ligne.quantite)) return false;
  return Math.abs(ecart) <= tolerance(ligne);
}

export interface EtatTicket {
  sommeLignesCentimes: number;
  sommeRabaisCentimes: number;
  /** Somme des lignes − total du ticket (null si total inconnu). */
  ecartTotalCentimes: number | null;
  /** Somme des rabais − « Vous économisez » (null si non renseigné). */
  ecartRabaisCentimes: number | null;
  lignesIncoherentes: string[];
  problemes: string[];
  pret: boolean;
}

/** Bilan d'un brouillon : ce qui empêche encore l'envoi, en français. */
export function etatTicket(ticket: TicketBrouillon): EtatTicket {
  const problemes: string[] = [];
  const lignesIncoherentes: string[] = [];
  let somme = 0;
  let sommeRabais = 0;

  ticket.lignes.forEach((ligne, index) => {
    somme += ligne.totalCentimes ?? 0;
    sommeRabais += ligne.rabaisCentimes;
    if (!ligneCoherente(ligne)) lignesIncoherentes.push(ligne.cle);
    if (ligne.libelle.trim().length === 0) problemes.push(`Ligne ${index + 1} : libellé manquant.`);
    if (!ligne.produitId && ligne.produitNom.trim().length < 2) {
      problemes.push(`Ligne ${index + 1} : produit à choisir ou à nommer.`);
    }
  });

  if (lignesIncoherentes.length > 0) {
    problemes.push(
      lignesIncoherentes.length === 1
        ? '1 ligne ne tombe pas juste : quantité × prix − rabais ≠ total.'
        : `${lignesIncoherentes.length} lignes ne tombent pas juste : quantité × prix − rabais ≠ total.`,
    );
  }

  const m = ticket.magasin;
  if (!/^\d{4,8}$/.test(m.numeroFiliale)) problemes.push('Numéro de filiale manquant (pied du ticket).');
  if (m.nom.trim().length < 2 || m.format === '' || !/^[A-Z]{2}$/.test(m.canton)) {
    problemes.push('Magasin incomplet : nom, format et canton.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ticket.date)) problemes.push('Date manquante.');
  if (!/^\d{2}:\d{2}:\d{2}$/.test(ticket.heure)) problemes.push('Heure du ticket manquante.');
  if (ticket.lignes.length === 0) problemes.push('Aucune ligne.');

  let ecartTotal: number | null = null;
  if (ticket.totalCentimes === null) {
    problemes.push('Total du ticket manquant.');
  } else {
    ecartTotal = somme - ticket.totalCentimes;
    if (Math.abs(ecartTotal) > 4) problemes.push('La somme des lignes ne correspond pas au total.');
  }

  let ecartRabais: number | null = null;
  if (ticket.rabaisTotalCentimes !== null) {
    ecartRabais = sommeRabais - ticket.rabaisTotalCentimes;
    if (ecartRabais !== 0) problemes.push('La somme des rabais ne correspond pas à « Vous économisez ».');
  }

  return {
    sommeLignesCentimes: somme,
    sommeRabaisCentimes: sommeRabais,
    ecartTotalCentimes: ecartTotal,
    ecartRabaisCentimes: ecartRabais,
    lignesIncoherentes,
    problemes,
    pret: problemes.length === 0,
  };
}
