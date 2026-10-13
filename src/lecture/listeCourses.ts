// Liste de courses gardée sur le téléphone (utilisable sans réseau au
// magasin), et arrivée du lien « Ajouter à ma liste de courses » de
// Chef Feta.

import { ajouterRecette, ErreurRecette, lireRecette, type ArticleCourses } from '../lib/courses.ts';

const CLE_LISTE = 'panier-temoin:courses';
const CLE_MESSAGE = 'panier-temoin:courses-message';

export function nouvelId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function lireListe(): ArticleCourses[] {
  try {
    const brut = window.localStorage.getItem(CLE_LISTE);
    const liste = brut ? (JSON.parse(brut) as unknown) : [];
    return Array.isArray(liste) ? (liste as ArticleCourses[]) : [];
  } catch {
    return [];
  }
}

export function enregistrerListe(liste: ArticleCourses[]): void {
  try {
    window.localStorage.setItem(CLE_LISTE, JSON.stringify(liste));
  } catch {
    // Stockage indisponible : la liste reste en mémoire.
  }
}

/** Ajoute une recette (lien ou texte copié) à la liste ; renvoie le message à afficher. */
export function importerRecette(texte: string): { message: string; ok: boolean } {
  try {
    const lue = lireRecette(texte);
    enregistrerListe(ajouterRecette(lireListe(), lue, nouvelId));
    const n = lue.articles.length;
    return { ok: true, message: `${lue.recette} : ${n} article${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''}.` };
  } catch (e) {
    return { ok: false, message: e instanceof ErreurRecette ? e.message : 'Recette illisible.' };
  }
}

export type MessageCourses = { message: string; ok: boolean };

/** Lien de Chef Feta : ajoute la recette puis ouvre la liste. */
export function accueillirLienCourses(): void {
  const fragment = window.location.hash;
  if (!fragment.startsWith('#/courses/')) return;
  const resultat = importerRecette(fragment);
  try {
    window.sessionStorage.setItem(CLE_MESSAGE, JSON.stringify(resultat));
  } catch {
    // Le message sera simplement absent.
  }
  window.location.replace(`${window.location.pathname}${window.location.search}#/courses`);
}

/** Lit, puis efface, le message du dernier lien de recette. */
export function prendreMessageCourses(): MessageCourses | null {
  try {
    const brut = window.sessionStorage.getItem(CLE_MESSAGE);
    if (!brut) return null;
    window.sessionStorage.removeItem(CLE_MESSAGE);
    return JSON.parse(brut) as MessageCourses;
  } catch {
    return null;
  }
}
