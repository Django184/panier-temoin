// Recettes de Chef Feta : arrivée du lien « Ajouter à ma liste de
// courses », reprise d'une recette de l'historique, enregistrement.

import { majListePourRecette, rayonDuParcours } from '../lib/courses.ts';
import { ErreurRecette, recetteDepuisLien, type Recette } from '../lib/recettes.ts';
import { liste, nouvelId, recetteActive, recettes } from '../donnees/local.ts';

const CLE_MESSAGE = 'panier-temoin:courses-message';
const HISTORIQUE_MAX = 60;

export type MessageCourses = { message: string; ok: boolean };

/** Met les articles d'une recette dans la liste et l'affiche dans l'onglet Recette. */
export function chargerRecette(recette: Recette): void {
  liste.modifier((l) => majListePourRecette(l, recette, nouvelId));
  recetteActive.modifier(() => recette.id);
}

/** Enregistre une recette modifiée (historique), sans toucher à la liste. */
export function enregistrerRecette(recette: Recette): void {
  recettes.modifier((tout) => tout.map((r) => (r.id === recette.id ? recette : r)));
}

export function supprimerRecette(id: string): void {
  recettes.modifier((tout) => tout.filter((r) => r.id !== id));
  liste.modifier((l) => l.filter((a) => a.recetteId !== id));
}

/** Lien de Chef Feta → recette enregistrée et chargée dans la liste. */
export function importerRecette(lien: string): MessageCourses {
  try {
    const lue = recetteDepuisLien(lien);
    lue.ingredients = lue.ingredients.map((i) => ({ ...i, rayon: rayonDuParcours(i.rayon) }));
    // Une recette de même nom remplace l'ancienne (pas de doublon dans l'historique).
    const existante = recettes.lire().find((r) => r.titre.toLowerCase() === lue.titre.toLowerCase());
    const recette: Recette = {
      ...lue,
      id: existante?.id ?? nouvelId(),
      portions: lue.personnes,
      importeLe: new Date().toISOString(),
      modifieLe: null,
    };
    recettes.modifier((tout) => [recette, ...tout.filter((r) => r.id !== recette.id)].slice(0, HISTORIQUE_MAX));
    chargerRecette(recette);
    const n = recette.ingredients.length;
    return { ok: true, message: `${recette.titre} : ${n} article${n > 1 ? 's' : ''} dans la liste.` };
  } catch (e) {
    return { ok: false, message: e instanceof ErreurRecette ? e.message : 'Recette illisible.' };
  }
}

/** Lien de Chef Feta reçu : ajoute la recette puis ouvre la liste de courses. */
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
