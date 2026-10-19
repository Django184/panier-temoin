// Recettes de Chef Feta : arrivée du lien « Ajouter à ma liste de
// courses », reprise d'une recette de l'historique, enregistrement.

import { ajouterIngredient, cleTitre, dedoublonner, majListePourRecette, rayonDuParcours } from '../lib/courses.ts';
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

/** Retire tous les articles d'une recette de la liste (la recette reste dans l'historique). */
export function retirerRecetteDeLaListe(id: string): void {
  liste.modifier((l) => l.filter((a) => a.recetteId !== id));
}

/** Adapte les quantités des articles présents, sans remettre ceux qui ont été retirés. */
export function adapterListe(recette: Recette): void {
  liste.modifier((l) => majListePourRecette(l, recette, nouvelId, { seulementPresents: true }));
}

/** Remet un ingrédient de la recette dans la liste. */
export function remettreIngredient(recette: Recette, rang: number): void {
  liste.modifier((l) => ajouterIngredient(l, recette, rang, nouvelId));
}

/** Enregistre une recette modifiée (historique), sans toucher à la liste. */
export function enregistrerRecette(recette: Recette): void {
  recettes.modifier((tout) => tout.map((r) => (r.id === recette.id ? recette : r)));
}

/**
 * Enregistre une recette modifiée à la main. `origines[i]` est l'ancien
 * rang de l'ingrédient i (null s'il vient d'être ajouté) : les articles de
 * la liste suivent leur ingrédient, ceux d'un ingrédient supprimé sont
 * retirés, et un ingrédient ajouté rejoint la liste si la recette y est.
 */
export function enregistrerEdition(recette: Recette, origines: Array<number | null>): void {
  enregistrerRecette(recette);
  liste.modifier((l) => {
    const dansLaListe = l.some((a) => a.recetteId === recette.id);
    let suite = l.flatMap((a) => {
      if (a.recetteId !== recette.id || a.ingredient === null) return [a];
      const rang = origines.indexOf(a.ingredient);
      return rang === -1 ? [] : [{ ...a, ingredient: rang, recette: recette.titre }];
    });
    if (dansLaListe) {
      origines.forEach((origine, rang) => {
        if (origine === null) suite = ajouterIngredient(suite, recette, rang, nouvelId);
      });
    }
    return suite;
  });
}

/** Retire les doublons de recettes et d'articles (après un import ou une relecture). */
export function dedoublonnerTout(): void {
  const r = dedoublonner(recettes.lire(), liste.lire());
  if (r.recettes.length !== recettes.lire().length) recettes.modifier(() => r.recettes);
  if (r.liste.length !== liste.lire().length || r.liste.some((a, i) => a !== liste.lire()[i])) liste.modifier(() => r.liste);
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
    const existante = recettes.lire().find((r) => cleTitre(r.titre) === cleTitre(lue.titre));
    const recette: Recette = {
      ...lue,
      id: existante?.id ?? nouvelId(),
      portions: lue.personnes,
      importeLe: new Date().toISOString(),
      modifieLe: null,
    };
    recettes.modifier((tout) => [recette, ...tout.filter((r) => r.id !== recette.id)].slice(0, HISTORIQUE_MAX));
    chargerRecette(recette);
    dedoublonnerTout();
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
