// Brouillon du ticket en cours, gardé dans le navigateur pour ne rien
// perdre si l'app est fermée en pleine saisie. Le stockage peut être
// indisponible (navigation privée) ou vidé par iOS : tout est protégé.

import type { TicketBrouillon } from './lib/types.ts';

const CLE = 'panier-temoin:brouillon';

export function lireBrouillon(): TicketBrouillon | null {
  try {
    const brut = window.localStorage.getItem(CLE);
    if (!brut) return null;
    const brouillon = JSON.parse(brut) as TicketBrouillon;
    return Array.isArray(brouillon.lignes) ? brouillon : null;
  } catch {
    return null;
  }
}

export function enregistrerBrouillon(brouillon: TicketBrouillon): void {
  try {
    window.localStorage.setItem(CLE, JSON.stringify(brouillon));
  } catch {
    // Stockage plein ou indisponible : le brouillon reste en mémoire.
  }
}

export function effacerBrouillon(): void {
  try {
    window.localStorage.removeItem(CLE);
  } catch {
    // Rien à faire.
  }
}
