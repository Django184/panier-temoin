// Recettes de Chef Feta (projet Claude de l'utilisateur) : lecture du
// lien « Ajouter à ma liste de courses », portions et quantités.
//
// Format du lien (#/courses/ suivi d'un objet JSON) :
//   r : nom du plat           p : nombre de personnes
//   m : temps et saison       i : [[rayon, ingrédient avec quantité], …]
//   e : étapes                a : astuces et variantes
//   n : valeurs nutritionnelles
// Les liens de la première version (r et i seulement) restent acceptés.

import { decoderLien } from './importClaude.ts';

/** Début des liens produits par Chef Feta. */
export const ADRESSE_RECETTE = 'https://django184.github.io/panier-temoin/#/courses/';

export interface Ingredient {
  rayon: string;
  texte: string;
}

export interface Recette {
  id: string;
  titre: string;
  /** Personnes prévues par la recette (base des quantités). */
  personnes: number | null;
  /** Personnes choisies par l'utilisateur ; les quantités sont adaptées. */
  portions: number | null;
  infos: string;
  ingredients: Ingredient[];
  etapes: string[];
  astuces: string[];
  nutrition: string;
  importeLe: string;
  modifieLe: string | null;
}

export type RecetteLue = Omit<Recette, 'id' | 'portions' | 'importeLe' | 'modifieLe'>;

export class ErreurRecette extends Error {}

function textes(valeur: unknown): string[] {
  return Array.isArray(valeur) ? valeur.map((x) => String(x ?? '').trim()).filter(Boolean) : [];
}

/** Contenu d'un lien de Chef Feta → recette (rayons bruts, à ranger par l'appelant). */
export function recetteDepuisLien(lien: string): RecetteLue {
  const trouve = lien.match(/#\/courses\/(.+)$/s);
  const texte = decoderLien(trouve ? trouve[1] : lien);
  const debut = texte.indexOf('{');
  const fin = texte.lastIndexOf('}');
  let d: Record<string, unknown> | null = null;
  if (debut !== -1 && fin > debut) {
    try {
      d = JSON.parse(texte.slice(debut, fin + 1)) as Record<string, unknown>;
    } catch {
      d = null;
    }
  }
  if (!d || !Array.isArray(d.i)) {
    throw new ErreurRecette('Le lien de Chef Feta est incomplet. Redemandez-lui le lien de la recette.');
  }
  const ingredients = d.i
    .filter((x): x is unknown[] => Array.isArray(x) && x.length >= 2)
    .map(([rayon, article]) => ({ rayon: String(rayon ?? '').trim(), texte: String(article ?? '').trim() }))
    .filter((x) => x.texte !== '');
  if (ingredients.length === 0) throw new ErreurRecette('La recette envoyée ne contient aucun ingrédient.');
  const personnes = Number(String(d.p ?? '').replace(/\D+/g, ''));
  return {
    titre: typeof d.r === 'string' && d.r.trim() ? d.r.trim() : 'Recette',
    personnes: Number.isFinite(personnes) && personnes > 0 ? personnes : null,
    infos: typeof d.m === 'string' ? d.m.trim() : '',
    ingredients,
    etapes: textes(d.e),
    astuces: textes(d.a),
    nutrition: typeof d.n === 'string' ? d.n.trim() : '',
  };
}

// ---------------------------------------------------------------------
// Quantités
// ---------------------------------------------------------------------

const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
const NOMBRE = String.raw`\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|[½¼¾⅓⅔]`;
const DEBUT = new RegExp(String.raw`^(\s*)(${NOMBRE})(?:\s*(?:à|-|–)\s*(${NOMBRE}))?(?=\s|[a-zA-Zµ]|$)(.*)$`, 's');

function valeur(texte: string): number {
  const t = texte.replace(/\s/g, '').replace(',', '.');
  if (t in FRACTIONS) return FRACTIONS[t];
  const fraction = t.match(/^(\d+(?:\.\d+)?)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  return Number(t);
}

/** Nombre au format suisse romand : virgule décimale, sans zéros inutiles. */
export function formaterNombre(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

function arrondir(n: number, suite: string): number {
  const unite = suite.trim().match(/^([a-zA-Zµ]+)/)?.[1]?.toLowerCase() ?? '';
  if (unite === 'g' || unite === 'ml') return n >= 100 ? Math.max(5, Math.round(n / 5) * 5) : Math.max(1, Math.round(n));
  if (unite === 'kg' || unite === 'l' || unite === 'cl') return Math.max(0.05, Math.round(n * 20) / 20);
  return Math.max(0.5, Math.round(n * 2) / 2);
}

/** Quantité de tête d'un ingrédient (« 250 g de… » → 250), ou null. */
export function quantiteDe(texte: string): number | null {
  const m = texte.match(DEBUT);
  return m ? valeur(m[2]) : null;
}

/** Multiplie la quantité de tête (« 250 g », « 2 à 3 gousses », « ½ citron »). */
export function adapterQuantite(texte: string, facteur: number): string {
  if (facteur === 1 || !Number.isFinite(facteur) || facteur <= 0) return texte;
  const m = texte.match(DEBUT);
  if (!m) return texte;
  const [, espace, a, b, suite] = m;
  const nouveauA = formaterNombre(arrondir(valeur(a) * facteur, suite));
  const nouveauB = b ? ` à ${formaterNombre(arrondir(valeur(b) * facteur, suite))}` : '';
  return `${espace}${nouveauA}${nouveauB}${suite}`;
}

/** Facteur entre les personnes choisies et celles de la recette. */
export function facteurPortions(recette: Pick<Recette, 'personnes' | 'portions'>): number {
  return recette.personnes && recette.portions ? recette.portions / recette.personnes : 1;
}

/** Texte à ajouter aux instructions du projet Chef Feta. */
export const AJOUT_INSTRUCTIONS_CHEF_FETA = `## Liste de courses et recette pour l'app Panier Témoin

À la fin de chaque recette complète, juste avant la proposition de sauvegarde, ajoute un lien Markdown dont le texte est « 🛒 Ajouter à ma liste de courses » et l'adresse ${ADRESSE_RECETTE} suivie d'un objet JSON compact, sur une seule ligne :
{"r":"<nom du plat>","p":<nombre de personnes>,"m":"<préparation, cuisson et saison>","i":[["<rayon>","<ingrédient avec sa quantité>"]],"e":["<étape 1>","<étape 2>"],"a":["<astuce ou variante>"],"n":"<valeurs nutritionnelles par portion>"}

Règles :
- "i" : un élément par ingrédient de la recette, dans l'ordre de la liste, avec le nom exact du rayon du parcours (« Légumes », « Bocaux », « Placard — à vérifier »…). La quantité est en tête du texte (« 250 g de champignons de Paris »).
- "e" : les étapes de préparation, dans l'ordre, sans leur numéro. "a" : les astuces et variantes. Textes simples, sans emoji.
- Dans l'adresse, remplace chaque espace par %20, chaque « % » par %25, chaque « # » par %23, chaque « ( » par %28 et chaque « ) » par %29. Ne change rien d'autre.
- N'affiche pas le JSON ailleurs que dans le lien.`;
