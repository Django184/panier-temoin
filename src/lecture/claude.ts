// Lien avec le projet Claude de l'utilisateur :
//  - l'adresse du projet, gardée dans le navigateur ;
//  - l'arrivée d'un lien « #/import/… » envoyé par Claude, transformée en
//    brouillon de ticket puis ouverte sur l'écran de vérification.

import { ErreurImport, lireReponseClaude } from '../lib/importClaude.ts';
import { enregistrerBrouillon } from '../stockageLocal.ts';

// Deux projets Claude : la lecture des tickets et Chef Feta (recettes).
export type QuelProjet = 'tickets' | 'recettes';
const CLES_PROJET: Record<QuelProjet, string> = {
  tickets: 'panier-temoin:projet-claude',
  recettes: 'panier-temoin:projet-chef-feta',
};
const CLE_RETOUR = 'panier-temoin:retour-claude';

/** Adresse d'un projet Claude (« https://claude.ai/project/… »). */
export const MOTIF_PROJET = /^https:\/\/claude\.ai\/project\/[0-9a-zA-Z-]+\/?$/;

/** Page de création des projets, si aucun projet n'est encore enregistré. */
export const ADRESSE_PROJETS = 'https://claude.ai/projects';

export function lireProjet(quel: QuelProjet = 'tickets'): string | null {
  try {
    const adresse = window.localStorage.getItem(CLES_PROJET[quel]);
    return adresse && MOTIF_PROJET.test(adresse) ? adresse : null;
  } catch {
    return null;
  }
}

/** Enregistre l'adresse du projet ; renvoie l'adresse nettoyée ou null si elle est invalide. */
export function enregistrerProjet(saisie: string, quel: QuelProjet = 'tickets'): string | null {
  const trouvee = saisie.match(/https:\/\/claude\.ai\/project\/[0-9a-zA-Z-]+/);
  if (!trouvee) return null;
  try {
    window.localStorage.setItem(CLES_PROJET[quel], trouvee[0]);
  } catch {
    // Stockage indisponible : l'adresse sera redemandée.
  }
  return trouvee[0];
}

export function oublierProjet(quel: QuelProjet = 'tickets'): void {
  try {
    window.localStorage.removeItem(CLES_PROJET[quel]);
  } catch {
    // Rien à faire.
  }
}

type Retour = { ouvrir: true } | { erreur: string };

/**
 * Si l'adresse courante est un lien d'import envoyé par Claude, garde le
 * ticket en brouillon et passe à l'écran « Ajouter », qui l'ouvrira.
 * À appeler au démarrage et à chaque changement de fragment.
 */
export function accueillirLienImport(): void {
  const fragment = window.location.hash;
  if (!fragment.startsWith('#/import/')) return;
  let retour: Retour;
  try {
    enregistrerBrouillon(lireReponseClaude(fragment));
    retour = { ouvrir: true };
  } catch (e) {
    retour = { erreur: e instanceof ErreurImport ? e.message : 'Le lien envoyé par Claude est illisible.' };
  }
  try {
    window.sessionStorage.setItem(CLE_RETOUR, JSON.stringify(retour));
  } catch {
    // Sans stockage de session, le brouillon reste proposé par « Reprendre ».
  }
  // Remplace l'adresse : le ticket ne reste ni dans l'historique ni dans la barre d'adresse.
  window.location.replace(`${window.location.pathname}${window.location.search}#/ajouter`);
}

/** Résultat du dernier lien d'import, sans l'effacer. */
export function consulterRetour(): Retour | null {
  try {
    const brut = window.sessionStorage.getItem(CLE_RETOUR);
    return brut ? (JSON.parse(brut) as Retour) : null;
  } catch {
    return null;
  }
}

export function effacerRetour(): void {
  try {
    window.sessionStorage.removeItem(CLE_RETOUR);
  } catch {
    // Rien à faire.
  }
}

/** Lit, puis efface, le résultat du dernier lien d'import. */
export function prendreRetour(): Retour | null {
  const retour = consulterRetour();
  effacerRetour();
  return retour;
}

/**
 * Lit le presse-papiers sans geste de l'utilisateur, seulement si le
 * navigateur l'a déjà autorisé (Chrome sur Android après un premier
 * « Coller »). Ailleurs, renvoie null sans rien demander.
 */
export async function lirePressePapiersSiAutorise(): Promise<string | null> {
  try {
    const etat = await navigator.permissions.query({ name: 'clipboard-read' as PermissionName });
    if (etat.state !== 'granted') return null;
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}
