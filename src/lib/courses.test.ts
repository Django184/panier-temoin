// Tests de la lecture des recettes de Chef Feta pour la liste de courses.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADRESSE_COURSES, ajouterRecette, lireRecette, parRayon, rayonDuParcours, RAYON_PLACARD, type ArticleCourses } from './courses.ts';

const RECETTE = `**Poulet sauté façon teriyaki, riz, champignons, carottes et oignon rouge**
*Pour 4 personnes · Préparation : 15 min · Cuisson : 20 min · Saison(s) : Toutes saisons*

**Ingrédients — dans l'ordre du parcours Migros Renens**

**Légumes**
- 250 g de champignons de Paris
- 2 carottes moyennes
- 1 oignon rouge
- 2 gousses d'ail
- 1 morceau de gingembre frais d'env. 2 cm (1 cac râpée)
- 2 oignons verts (optionnel)

**Viandes et poissons**
- 700 g de blancs de poulet (ou de cuisses désossées, moins chères)

**Fruits secs**
- 1 cas de graines de sésame (optionnel)

**Bocaux**
- 3 cas de miel (?)
- 1,5 cas de vinaigre de riz (ou de cidre)

**Pâtes**
- 300 g de riz basmati ou jasmin (poids sec)
- 1,5 cac de maïzena

**Produits asiatiques et Tex-Mex**
- 6 cas de sauce soja

**🧂 Placard — à vérifier**
- 1 cas d'huile neutre
- sel (pour le riz)

*(toutes les quantités en système métrique européen)*

**Préparation**
1. Lance le riz selon les instructions du paquet.
2. **Sauce :** dans un bol, mélange la sauce soja, le miel.

**Valeurs nutritionnelles (estimation par portion)**
Protéines : ~40 g | Glucides : ~57 g`;

function verifier(lue: ReturnType<typeof lireRecette>) {
  assert.equal(lue.recette, 'Poulet sauté façon teriyaki, riz, champignons, carottes et oignon rouge');
  assert.equal(lue.articles.length, 15);
  assert.deepEqual(lue.articles[0], { rayon: 'Légumes', texte: '250 g de champignons de Paris' });
  assert.equal(lue.articles[6].rayon, 'Viandes et poissons');
  assert.equal(lue.articles[7].rayon, 'Fruits secs');
  assert.equal(lue.articles[8].texte, '3 cas de miel (?)');
  assert.equal(lue.articles[12].rayon, 'Produits asiatiques et Tex-Mex');
  assert.equal(lue.articles[14].rayon, RAYON_PLACARD);
  assert.ok(!lue.articles.some((a) => /riz selon|mélange/.test(a.texte)), 'la préparation n’est pas lue');
}

test('recette copiée depuis Claude (Markdown)', () => {
  verifier(lireRecette(RECETTE));
});

test('recette copiée en texte simple (puces •, sans gras)', () => {
  const simple = RECETTE.replace(/\*\*/g, '').replace(/^- /gm, '• ');
  verifier(lireRecette(simple));
});

test('lien « Ajouter à ma liste de courses » de Chef Feta', () => {
  const objet = {
    r: 'Bowl feta (version 2)',
    i: [
      ['Légumes', '2 avocats'],
      ['Fromages', '200 g de feta'],
      ['Placard — à vérifier', "huile d'olive"],
      ['Rayon inconnu', 'papier 100%'],
    ],
  };
  const lien = `${ADRESSE_COURSES}${JSON.stringify(objet).replaceAll(' ', '%20').replaceAll('(', '%28').replaceAll(')', '%29')}`;
  const lue = lireRecette(`[🛒 Ajouter à ma liste de courses](${lien})`);
  assert.equal(lue.recette, 'Bowl feta (version 2)');
  assert.deepEqual(
    lue.articles.map((a) => a.rayon),
    ['Légumes', 'Fromages', RAYON_PLACARD, 'Autres'],
  );
  assert.equal(lue.articles[3].texte, 'papier 100%');
});

test('rayons reconnus malgré la casse, les accents et les emoji', () => {
  assert.equal(rayonDuParcours('🥬 LEGUMES'), 'Légumes');
  assert.equal(rayonDuParcours('Fruits'), 'Fruits');
  assert.equal(rayonDuParcours('Fruits secs'), 'Fruits secs');
  assert.equal(rayonDuParcours('Produits asiatiques'), 'Produits asiatiques et Tex-Mex');
  assert.equal(rayonDuParcours('Épices du monde'), 'Autres');
});

test('liste : une recette réimportée remplace l’ancienne, tri par parcours', () => {
  let n = 0;
  const id = () => String(++n);
  let liste: ArticleCourses[] = ajouterRecette([], lireRecette(RECETTE), id);
  liste = ajouterRecette(liste, lireRecette(RECETTE), id);
  assert.equal(liste.length, 15);
  const groupes = parRayon(liste);
  assert.deepEqual(
    groupes.map((g) => g.rayon),
    ['Légumes', 'Viandes et poissons', 'Fruits secs', 'Bocaux', 'Pâtes', 'Produits asiatiques et Tex-Mex', RAYON_PLACARD],
  );
});

test('texte sans ingrédients : erreur claire', () => {
  assert.throws(() => lireRecette('Bonjour, que veux-tu cuisiner ?'), /Aucune liste/);
});
