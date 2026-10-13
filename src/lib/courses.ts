// Liste de courses : lecture d'une recette de Chef Feta (projet Claude
// de l'utilisateur) et tri des articles selon le parcours du magasin.
//
// Deux entrées possibles :
//  - le lien « Ajouter à ma liste de courses » que Chef Feta ajoute à ses
//    recettes (#/courses/{"r":"Nom","i":[["Rayon","Article"],…]}) ;
//  - le texte de la recette copié depuis Claude (bouton de copie), dont
//    la partie « Ingrédients » est lue rayon par rayon.

import { decoderLien } from './importClaude.ts';

/** Début des liens produits par Chef Feta. */
export const ADRESSE_COURSES = 'https://django184.github.io/panier-temoin/#/courses/';

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
  recette: string;
  coche: boolean;
}

export interface RecetteLue {
  recette: string;
  articles: Array<{ rayon: string; texte: string }>;
}

export class ErreurRecette extends Error {}

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

/** Retire le balisage Markdown et les emoji de tête d'une ligne. */
function texteSimple(ligne: string): string {
  return ligne
    .replace(/^#+\s*/, '')
    .replace(/\*\*|__/g, '')
    .replace(/^[*_]\s*|\s*[*_]$/g, '')
    .replace(/^[^\p{L}\p{N}(]+/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const PUCE = /^\s*(?:[-*•–]|\d+[.)])\s+(.+)$/;
const FIN_INGREDIENTS = /^(?:pr[ée]paration|instructions|[ée]tapes|recette|valeurs nutritionnelles|astuce|variante)\b/i;

/** Lecture du lien de Chef Feta. */
function depuisLien(contenu: string): RecetteLue | null {
  const texte = decoderLien(contenu);
  const debut = texte.indexOf('{');
  const fin = texte.lastIndexOf('}');
  if (debut === -1 || fin <= debut) return null;
  try {
    const d = JSON.parse(texte.slice(debut, fin + 1)) as { r?: unknown; i?: unknown };
    if (!Array.isArray(d.i)) return null;
    const articles = d.i
      .filter((x): x is unknown[] => Array.isArray(x) && x.length >= 2)
      .map(([rayon, article]) => ({ rayon: rayonDuParcours(String(rayon)), texte: String(article).trim() }))
      .filter((a) => a.texte !== '');
    return articles.length ? { recette: typeof d.r === 'string' && d.r.trim() ? d.r.trim() : 'Recette', articles } : null;
  } catch {
    return null;
  }
}

/** Lecture du texte d'une recette complète (Markdown ou texte simple). */
function depuisTexte(texte: string): RecetteLue | null {
  const lignes = texte.split(/\r?\n/);
  const debut = lignes.findIndex((l) => !PUCE.test(l) && /ingr[ée]dients/i.test(l));
  if (debut === -1) return null;

  // Nom du plat : la dernière ligne pleine avant « Ingrédients », hors
  // ligne d'informations (« Pour 4 personnes · Préparation : … »).
  let recette = 'Recette';
  for (let i = debut - 1; i >= 0; i--) {
    const l = texteSimple(lignes[i]);
    if (l === '' || /personnes|pr[ée]paration\s*:|cuisson\s*:/i.test(l)) continue;
    recette = l.replace(/\s*\((?:projet|nouvelle)\)\s*$/i, '');
    break;
  }

  const articles: RecetteLue['articles'] = [];
  let rayon = RAYON_AUTRES;
  for (const ligne of lignes.slice(debut + 1)) {
    if (ligne.trim() === '') continue;
    const puce = ligne.match(PUCE);
    if (puce) {
      const article = texteSimple(puce[1]);
      if (article) articles.push({ rayon, texte: article });
      continue;
    }
    const titre = texteSimple(ligne);
    if (titre === '' || titre.startsWith('(')) continue; // note entre parenthèses
    if (FIN_INGREDIENTS.test(titre)) break;
    rayon = rayonDuParcours(titre);
  }
  return articles.length ? { recette, articles } : null;
}

/** Recette de Chef Feta (lien, ou texte copié) → articles à ajouter à la liste. */
export function lireRecette(texte: string): RecetteLue {
  const lien = texte.match(/#\/courses\/([^\s<>]+)/);
  const lue = (lien && depuisLien(lien[1])) || depuisTexte(texte);
  if (!lue) {
    throw new ErreurRecette('Aucune liste d’ingrédients trouvée. Copiez une recette complète de Chef Feta, avec sa partie « Ingrédients ».');
  }
  return lue;
}

/** Ajoute une recette à la liste ; une recette déjà présente est remplacée. */
export function ajouterRecette(liste: ArticleCourses[], lue: RecetteLue, nouvelId: () => string): ArticleCourses[] {
  const autres = liste.filter((a) => a.recette !== lue.recette);
  return [...autres, ...lue.articles.map((a) => ({ id: nouvelId(), texte: a.texte, rayon: a.rayon, recette: lue.recette, coche: false }))];
}

/** Articles regroupés par rayon, dans l'ordre du parcours. */
export function parRayon(liste: ArticleCourses[]): Array<{ rayon: string; articles: ArticleCourses[] }> {
  return PARCOURS.map((rayon) => ({ rayon, articles: liste.filter((a) => a.rayon === rayon) })).filter((g) => g.articles.length > 0);
}

/** Texte à ajouter aux instructions du projet Chef Feta. */
export const AJOUT_INSTRUCTIONS_CHEF_FETA = `## Liste de courses pour l'app Panier Témoin

À la fin de chaque recette complète, juste avant la proposition de sauvegarde, ajoute un lien Markdown dont le texte est « 🛒 Ajouter à ma liste de courses » et l'adresse ${ADRESSE_COURSES} suivie d'un objet JSON compact, sur une seule ligne :
{"r":"<nom du plat>","i":[["<rayon>","<ingrédient avec sa quantité>"],["<rayon>","<ingrédient avec sa quantité>"]]}

Règles :
- Un élément par ingrédient de la recette, dans l'ordre de la liste, avec le nom exact du rayon du parcours (« Légumes », « Bocaux », « Placard — à vérifier »…).
- Dans l'adresse, remplace chaque espace par %20, chaque « % » par %25, chaque « ( » par %28 et chaque « ) » par %29. Ne change rien d'autre.
- N'affiche pas le JSON ailleurs que dans le lien.`;
