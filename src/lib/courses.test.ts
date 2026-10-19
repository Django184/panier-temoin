// Tests des recettes de Chef Feta et de la liste de courses.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADRESSE_RECETTE, adapterQuantite, quantiteDe, recetteDepuisLien, type Recette } from './recettes.ts';
import {
  ajouterIngredient,
  dedoublonner,
  ecartsAvecRecette,
  majListePourRecette,
  parRayon,
  rayonDuParcours,
  RAYON_PLACARD,
  type ArticleCourses,
} from './courses.ts';

const OBJET = {
  r: 'Poulet sauté façon teriyaki (riz, champignons)',
  p: 4,
  m: 'Préparation : 15 min · Cuisson : 20 min · Toutes saisons',
  i: [
    ['Légumes', '250 g de champignons de Paris'],
    ['Légumes', '2 carottes moyennes'],
    ['Légumes', '2 à 3 gousses d\'ail'],
    ['Viandes et poissons', '700 g de blancs de poulet'],
    ['Bocaux', '1,5 cas de vinaigre de riz (ou de cidre)'],
    ['Placard — à vérifier', 'sel'],
    ['Rayon inconnu', 'papier 100% recyclé'],
  ],
  e: ['Lance le riz selon les instructions du paquet.', '**Sauce :** mélange la sauce soja et le miel #1.'],
  a: ['Laisse les champignons bien colorer.'],
  n: 'Protéines ~40 g | Calories ~465 kcal',
};

/** Lien tel que les instructions demandent à Chef Feta de l'écrire. */
function lienCommeChefFeta(objet: unknown): string {
  const json = JSON.stringify(objet)
    .replaceAll('%', '%25')
    .replaceAll(' ', '%20')
    .replaceAll('#', '%23')
    .replaceAll('(', '%28')
    .replaceAll(')', '%29');
  return `${ADRESSE_RECETTE}${json}`;
}

function recette(): Recette {
  return { ...recetteDepuisLien(lienCommeChefFeta(OBJET)), id: 'r1', portions: 4, importeLe: '2026-10-13', modifieLe: null };
}

test('lien de Chef Feta : recette complète, telle que reçue par le navigateur', () => {
  const fragment = '#' + new URL(lienCommeChefFeta(OBJET)).hash.slice(1);
  const r = recetteDepuisLien(fragment);
  assert.equal(r.titre, 'Poulet sauté façon teriyaki (riz, champignons)');
  assert.equal(r.personnes, 4);
  assert.equal(r.ingredients.length, 7);
  assert.equal(r.etapes.length, 2);
  assert.equal(r.etapes[1], '**Sauce :** mélange la sauce soja et le miel #1.');
  assert.equal(r.ingredients[6].texte, 'papier 100% recyclé');
  assert.equal(r.nutrition, 'Protéines ~40 g | Calories ~465 kcal');
});

test('lien de première version (nom et ingrédients seulement)', () => {
  const r = recetteDepuisLien(lienCommeChefFeta({ r: 'Bowl', i: [['Fromages', '200 g de feta']] }));
  assert.equal(r.personnes, null);
  assert.deepEqual(r.etapes, []);
  assert.equal(r.ingredients[0].texte, '200 g de feta');
});

test('lien incomplet : erreur claire', () => {
  assert.throws(() => recetteDepuisLien(`${ADRESSE_RECETTE}{"r":"X","i":[["Légumes",`), /incomplet/);
});

test('quantités adaptées aux portions', () => {
  assert.equal(quantiteDe('250 g de champignons'), 250);
  assert.equal(quantiteDe('sel'), null);
  assert.equal(adapterQuantite('250 g de champignons de Paris', 0.5), '125 g de champignons de Paris');
  assert.equal(adapterQuantite('700 g de blancs de poulet', 1.5), '1050 g de blancs de poulet');
  assert.equal(adapterQuantite('2 carottes moyennes', 0.5), '1 carottes moyennes');
  assert.equal(adapterQuantite('1,5 cas de vinaigre', 2), '3 cas de vinaigre');
  assert.equal(adapterQuantite('1,5 cas de vinaigre', 0.5), '1 cas de vinaigre');
  assert.equal(adapterQuantite("2 à 3 gousses d'ail", 2), "4 à 6 gousses d'ail");
  assert.equal(adapterQuantite('½ citron', 2), '1 citron');
  assert.equal(adapterQuantite('30 g de parmesan', 1.5), '45 g de parmesan');
  assert.equal(adapterQuantite('sel', 3), 'sel');
});

test('rayons reconnus malgré la casse, les accents et les emoji', () => {
  assert.equal(rayonDuParcours('🥬 LEGUMES'), 'Légumes');
  assert.equal(rayonDuParcours('Fruits secs'), 'Fruits secs');
  assert.equal(rayonDuParcours('Placard — à vérifier'), RAYON_PLACARD);
  assert.equal(rayonDuParcours('Épices du monde'), 'Autres');
});

test('liste : recette chargée, portions changées, coches et modifications gardées', () => {
  let n = 0;
  const id = () => `a${++n}`;
  const r = recette();
  let liste: ArticleCourses[] = majListePourRecette([], r, id);
  assert.equal(liste.length, 7);
  assert.deepEqual(
    parRayon(liste).map((g) => g.rayon),
    ['Légumes', 'Viandes et poissons', 'Bocaux', 'Autres', RAYON_PLACARD],
  );
  assert.equal(ecartsAvecRecette(liste, r), 0);

  // Coche, et quantité de poulet modifiée à la main.
  liste = liste.map((a) =>
    a.ingredient === 0 ? { ...a, coche: true } : a.ingredient === 3 ? { ...a, texte: '600 g de poulet', manuel: true } : a,
  );

  // 2 personnes au lieu de 4 : 4 quantités changent (sel et papier non chiffrés, poulet manuel).
  const deux = { ...r, portions: 2 };
  assert.equal(ecartsAvecRecette(liste, deux), 4);
  liste = majListePourRecette(liste, deux, id);
  assert.equal(ecartsAvecRecette(liste, deux), 0);
  assert.equal(liste.find((a) => a.ingredient === 0)?.texte, '125 g de champignons de Paris');
  assert.equal(liste.find((a) => a.ingredient === 0)?.coche, true);
  assert.equal(liste.find((a) => a.ingredient === 3)?.texte, '600 g de poulet');
  assert.equal(liste.length, 7);
});

test('liste : articles de première version remplacés au réimport', () => {
  const ancien: ArticleCourses = {
    id: 'v1',
    texte: '2 carottes',
    rayon: 'Légumes',
    recetteId: null,
    recette: 'Poulet sauté façon teriyaki (riz, champignons)',
    ingredient: null,
    coche: false,
  };
  const manuel: ArticleCourses = { ...ancien, id: 'm', recette: '', texte: 'Lait' };
  const liste = majListePourRecette([ancien, manuel], recette(), () => 'x');
  assert.equal(liste.length, 8);
  assert.ok(liste.some((a) => a.texte === 'Lait'));
  assert.ok(!liste.some((a) => a.id === 'v1'));
});

test('article retiré : ni écart, ni retour à l’adaptation ; « + Liste » le remet', () => {
  let n = 0;
  const id = () => `b${++n}`;
  const r = recette();
  // L'ail (rang 2) est retiré de la liste.
  let liste: ArticleCourses[] = majListePourRecette([], r, id).filter((a) => a.ingredient !== 2);
  assert.equal(ecartsAvecRecette(liste, r), 0, 'un article absent n’est pas un écart');

  const deux = { ...r, portions: 2 };
  liste = majListePourRecette(liste, deux, id, { seulementPresents: true });
  assert.equal(liste.length, 6);
  assert.ok(!liste.some((a) => a.ingredient === 2), 'l’ail ne revient pas');
  assert.equal(liste.find((a) => a.ingredient === 0)?.texte, '125 g de champignons de Paris');

  liste = ajouterIngredient(liste, deux, 2, id);
  assert.equal(liste.find((a) => a.ingredient === 2)?.texte, "1 à 1,5 gousses d'ail");
  assert.equal(ajouterIngredient(liste, deux, 2, id), liste, 'pas de double');
});

test('doublons : même recette importée deux fois (deux fenêtres ou téléphones)', () => {
  const a = { ...recette(), id: 'r1', importeLe: '2026-10-15T10:00:00Z' };
  const b = { ...recette(), id: 'r2', titre: 'POULET sauté façon  teriyaki (riz, champignons)', importeLe: '2026-10-16T10:00:00Z' };
  let n = 0;
  const id = () => `c${++n}`;
  const liste = majListePourRecette(majListePourRecette([], a, id), b, id);
  assert.equal(liste.length, 14);

  const r = dedoublonner([a, b], liste);
  assert.deepEqual(r.recettes.map((x) => x.id), ['r2'], 'la plus récente est gardée');
  assert.equal(r.liste.length, 7, 'un article par ingrédient');
  assert.ok(r.liste.every((x) => x.recetteId === 'r2'));

  const encore = dedoublonner(r.recettes, r.liste);
  assert.equal(encore.liste.length, 7);
});
