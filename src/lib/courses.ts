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
 * Avec `seulementPresents`, les ingrédients retirés de la liste n'y
 * reviennent pas (adaptation des quantités seulement).
 */
export function majListePourRecette(
  liste: ArticleCourses[],
  recette: Recette,
  nouvelId: () => string,
  { seulementPresents = false }: { seulementPresents?: boolean } = {},
): ArticleCourses[] {
  const actuels = new Map(
    liste.filter((a) => a.recetteId === recette.id && a.ingredient !== null).map((a) => [a.ingredient as number, a]),
  );
  const maintenant = new Date().toISOString();
  const nouveaux = articlesAttendus(recette)
    .filter((attendu) => !seulementPresents || actuels.has(attendu.ingredient))
    .map((attendu): ArticleCourses => {
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

/** Ajoute un seul ingrédient de la recette à la liste (s'il n'y est pas déjà). */
export function ajouterIngredient(liste: ArticleCourses[], recette: Recette, rang: number, nouvelId: () => string): ArticleCourses[] {
  if (liste.some((a) => a.recetteId === recette.id && a.ingredient === rang)) return liste;
  const attendu = articlesAttendus(recette)[rang];
  if (!attendu) return liste;
  return [
    ...liste,
    {
      id: nouvelId(),
      creeLe: new Date().toISOString(),
      texte: attendu.texte,
      rayon: attendu.rayon,
      recetteId: recette.id,
      recette: recette.titre,
      ingredient: rang,
      coche: false,
    },
  ];
}

/**
 * Nombre d'articles de la liste dont la quantité ne suit plus la recette.
 * Un ingrédient absent de la liste n'est pas un écart : il a été retiré
 * exprès, ou déjà acheté.
 */
export function ecartsAvecRecette(liste: ArticleCourses[], recette: Recette): number {
  const attendus = new Map(articlesAttendus(recette).map((a) => [a.ingredient, a]));
  return liste.filter((a) => {
    if (a.recetteId !== recette.id || a.manuel) return false;
    const attendu = a.ingredient === null ? undefined : attendus.get(a.ingredient);
    return !attendu || a.texte !== attendu.texte || a.rayon !== attendu.rayon;
  }).length;
}

/** Titre comparable : sans casse, accents ni ponctuation. */
export function cleTitre(titre: string): string {
  return normaliser(titre);
}

/**
 * Supprime les doublons : recettes de même titre (une seule gardée, la plus
 * récente ; ses articles remplacent ceux des copies) et articles en double
 * pour un même ingrédient d'une même recette.
 */
export function dedoublonner<R extends { id: string; titre: string; importeLe: string }>(
  recettes: R[],
  liste: ArticleCourses[],
): { recettes: R[]; liste: ArticleCourses[] } {
  const gardees = new Map<string, R>();
  const remplacee = new Map<string, string>(); // id de la copie → id gardé
  for (const r of [...recettes].sort((a, b) => b.importeLe.localeCompare(a.importeLe) || a.id.localeCompare(b.id))) {
    const cle = cleTitre(r.titre);
    const gardee = gardees.get(cle);
    if (gardee) remplacee.set(r.id, gardee.id);
    else gardees.set(cle, r);
  }
  const recettesUniques = recettes.filter((r) => !remplacee.has(r.id));

  const vus = new Set<string>();
  const listeUnique: ArticleCourses[] = [];
  // Articles de la recette gardée d'abord, puis ceux des copies si l'ingrédient manque.
  const tries = [...liste].sort((a, b) => Number(remplacee.has(a.recetteId ?? '')) - Number(remplacee.has(b.recetteId ?? '')));
  for (const a of tries) {
    const recetteId = a.recetteId ? (remplacee.get(a.recetteId) ?? a.recetteId) : null;
    const cle = recetteId && a.ingredient !== null ? `${recetteId}:${a.ingredient}` : null;
    if (cle && vus.has(cle)) continue;
    if (cle) vus.add(cle);
    listeUnique.push(recetteId === a.recetteId ? a : { ...a, recetteId });
  }
  const ordreInitial = new Map(liste.map((a, i) => [a.id, i]));
  listeUnique.sort((a, b) => (ordreInitial.get(a.id) ?? 0) - (ordreInitial.get(b.id) ?? 0));
  return { recettes: recettesUniques, liste: listeUnique };
}

/** Articles regroupés par rayon, dans l'ordre du parcours. */
export function parRayon(liste: ArticleCourses[]): Array<{ rayon: string; articles: ArticleCourses[] }> {
  return PARCOURS.map((rayon) => ({ rayon, articles: liste.filter((a) => a.rayon === rayon).sort(ordreArticles) })).filter(
    (g) => g.articles.length > 0,
  );
}
