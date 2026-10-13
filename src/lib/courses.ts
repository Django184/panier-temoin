// Liste de courses : articles des recettes de Chef Feta, rangés selon le
// parcours du magasin, avec quantités adaptées aux portions choisies.

import { adapterQuantite, facteurPortions, type Recette } from './recettes.ts';

export const RAYON_AUTRES = 'Autres';
export const RAYON_PLACARD = 'Placard, à vérifier';

/** Parcours du Migros MM Métropole Renens, d'après les instructions de Chef Feta. */
export const PARCOURS = [
  'Fruits',
  'Légumes',
  'Herbes fraîches',
  'Boulangerie',
  'Viandes et poissons',
  'Produits laitiers',
  'Fromages',
  'Surgelés',
  'Fruits secs',
  'Bocaux',
  'Conserves',
  'Pâtes',
  'Produits asiatiques et Tex-Mex',
  'Divers non alimentaire',
  RAYON_AUTRES,
  RAYON_PLACARD,
];

export interface ArticleCourses {
  id: string;
  texte: string;
  rayon: string;
  /** Recette d'origine (null : article ajouté à la main). */
  recetteId: string | null;
  recette: string;
  /** Rang de l'ingrédient dans la recette, pour suivre ses quantités. */
  ingredient: number | null;
  coche: boolean;
  /** Quantité modifiée à la main : la recette ne la remplace plus. */
  manuel?: boolean;
  /** Date d'ajout (ISO), pour un ordre identique sur tous les téléphones. */
  creeLe?: string;
}

/** Ordre stable des articles : ajout, puis rang dans la recette. */
export function ordreArticles(a: ArticleCourses, b: ArticleCourses): number {
  return (
    (a.creeLe ?? '').localeCompare(b.creeLe ?? '') ||
    (a.ingredient ?? 0) - (b.ingredient ?? 0) ||
    a.id.localeCompare(b.id)
  );
}

/** Minuscules, sans accents, sans emoji ni ponctuation. */
function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const PARCOURS_NORMALISE = PARCOURS.map((r) => ({ rayon: r, cle: normaliser(r) })).sort((a, b) => b.cle.length - a.cle.length);

/** Nom de rayon lu (« 🧂 Placard — à vérifier », « LÉGUMES ») → rayon du parcours. */
export function rayonDuParcours(titre: string): string {
  const cle = normaliser(titre);
  if (cle.startsWith('placard')) return RAYON_PLACARD;
  if (cle.startsWith('produits asiatiques')) return 'Produits asiatiques et Tex-Mex';
  const trouve = PARCOURS_NORMALISE.find((r) => cle === r.cle || cle.startsWith(`${r.cle} `));
  return trouve ? trouve.rayon : RAYON_AUTRES;
}

/** Articles attendus pour une recette, quantités adaptées aux portions. */
export function articlesAttendus(recette: Recette): Array<{ ingredient: number; texte: string; rayon: string }> {
  const facteur = facteurPortions(recette);
  return recette.ingredients.map((ing, i) => ({
    ingredient: i,
    texte: adapterQuantite(ing.texte, facteur),
    rayon: rayonDuParcours(ing.rayon),
  }));
}

/**
 * Met la liste à jour pour une recette : ses articles sont recalculés,
 * en gardant ce qui est coché et les quantités modifiées à la main.
 */
export function majListePourRecette(liste: ArticleCourses[], recette: Recette, nouvelId: () => string): ArticleCourses[] {
  const actuels = new Map(
    liste.filter((a) => a.recetteId === recette.id && a.ingredient !== null).map((a) => [a.ingredient as number, a]),
  );
  const maintenant = new Date().toISOString();
  const nouveaux = articlesAttendus(recette).map((attendu): ArticleCourses => {
    const avant = actuels.get(attendu.ingredient);
    if (avant?.manuel) return { ...avant, recette: recette.titre, rayon: attendu.rayon };
    return {
      id: avant?.id ?? nouvelId(),
      creeLe: avant?.creeLe ?? maintenant,
      texte: attendu.texte,
      rayon: attendu.rayon,
      recetteId: recette.id,
      recette: recette.titre,
      ingredient: attendu.ingredient,
      coche: avant?.coche ?? false,
    };
  });
  // Anciens articles de la même recette, et articles d'une liste de
  // première version portant le même nom de recette, remplacés.
  const autres = liste.filter((a) => a.recetteId !== recette.id && !(a.recetteId === null && a.recette === recette.titre));
  return [...autres, ...nouveaux];
}

/** Nombre d'articles de la liste qui ne correspondent plus à la recette. */
export function ecartsAvecRecette(liste: ArticleCourses[], recette: Recette): number {
  const actuels = liste.filter((a) => a.recetteId === recette.id);
  if (actuels.length === 0) return 0;
  const parRang = new Map(actuels.map((a) => [a.ingredient, a]));
  let ecarts = actuels.filter((a) => a.ingredient === null || a.ingredient >= recette.ingredients.length).length;
  for (const attendu of articlesAttendus(recette)) {
    const a = parRang.get(attendu.ingredient);
    if (!a) ecarts++;
    else if (!a.manuel && (a.texte !== attendu.texte || a.rayon !== attendu.rayon)) ecarts++;
  }
  return ecarts;
}

/** Articles regroupés par rayon, dans l'ordre du parcours. */
export function parRayon(liste: ArticleCourses[]): Array<{ rayon: string; articles: ArticleCourses[] }> {
  return PARCOURS.map((rayon) => ({ rayon, articles: liste.filter((a) => a.rayon === rayon).sort(ordreArticles) })).filter(
    (g) => g.articles.length > 0,
  );
}
