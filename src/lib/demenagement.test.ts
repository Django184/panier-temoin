// Tests du changement d'adresse : décodage de l'export et choix de ce qui est écrit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decoderDemenagement, ErreurDemenagement, planDemenagement, versBase64url, type ExportDemenagement } from './demenagement.ts';

function exportAvec(cles: Record<string, string>, app = 'panier-temoin'): string {
  return versBase64url(
    JSON.stringify({
      format: 'ecosysteme.export',
      formatVersion: 1,
      app,
      appVersion: 'passeur',
      schemaVersion: 0,
      exportedAt: '2026-11-04T10:00:00Z',
      data: { cles },
    }),
  );
}

const PREFS = JSON.stringify({ aides: false, aidesVues: ['courses'], coches: 'en_place', couleur: 'rose' });
const FILE = JSON.stringify([{ table: 'courses_articles', type: 'upsert', id: 'a1', a: 1 }]);
const vide = () => null;

test('aller-retour base64url avec accents et emoji', () => {
  const exp = decoderDemenagement(exportAvec({ preferences: PREFS, 'projet-claude': 'Crème brûlée 🛒' }));
  assert.equal(exp.data.cles['projet-claude'], 'Crème brûlée 🛒');
  assert.equal(exp.app, 'panier-temoin');
});

test('export illisible, étranger ou vide : erreur en clair', () => {
  assert.throws(() => decoderDemenagement('pas-du-base64!'), ErreurDemenagement);
  assert.throws(() => decoderDemenagement(versBase64url('{"x":1}')), /export de l’écosystème/);
  assert.throws(() => decoderDemenagement(exportAvec({}, 'ma-journee')), /autre app \(ma-journee\)/);
  assert.throws(
    () => decoderDemenagement(versBase64url(JSON.stringify({ format: 'ecosysteme.export', formatVersion: 1, app: 'panier-temoin', data: {} }))),
    /aucune donnée/,
  );
});

test('réglages et projets repris ; session et carte Cumulus jamais écrites', () => {
  const exp = decoderDemenagement(
    exportAvec({
      preferences: PREFS,
      'projet-claude': 'https://claude.ai/project/abc',
      'carte-cumulus': '{"numero":"2099999999993"}',
      'sb-tpovnthrvlajmyjrfltn-auth-token': '{"access_token":"x"}',
      inconnue: 'x',
    }),
  );
  const plan = planDemenagement(exp, vide);
  assert.deepEqual(
    plan.ecrire.map(([c]) => c),
    ['preferences', 'projet-claude'],
  );
  assert.equal(plan.enAttente, 0);
});

test('une donnée déjà présente à la nouvelle adresse n’est pas écrasée', () => {
  const exp = decoderDemenagement(exportAvec({ preferences: PREFS, brouillon: '{"lignes":[]}' }));
  const plan = planDemenagement(exp, (c) => (c === 'preferences' ? '{}' : null));
  assert.deepEqual(plan.ecrire, [['brouillon', '{"lignes":[]}']]);
  assert.deepEqual(plan.conservees, ['preferences']);
});

test('liste et file d’envoi reprises ensemble, seulement s’il reste des changements à envoyer', () => {
  const cles = { courses: '[{"id":"a1"}]', recettes: '[]', 'synchro-file': FILE };
  const plan = planDemenagement(decoderDemenagement(exportAvec(cles)), vide);
  assert.deepEqual(plan.ecrire.map(([c]) => c).sort(), ['courses', 'recettes', 'synchro-file']);
  assert.equal(plan.enAttente, 1);

  const sansFile = planDemenagement(decoderDemenagement(exportAvec({ ...cles, 'synchro-file': '[]' })), vide);
  assert.deepEqual(sansFile.ecrire, [], 'file vide : la base fait foi, rien à reprendre');
});

test('nouvelle adresse déjà utilisée : la liste reçue n’écrase rien', () => {
  const cles = { courses: '[{"id":"a1"}]', 'synchro-file': FILE };
  const plan = planDemenagement(decoderDemenagement(exportAvec(cles)), (c) => (c === 'courses' ? '[]' : null));
  assert.deepEqual(plan.ecrire, []);
  assert.deepEqual(plan.conservees.sort(), ['courses', 'synchro-file']);
  assert.equal(plan.enAttente, 0);
});

test('valeur trop grande ou non textuelle ignorée', () => {
  const exp = decoderDemenagement(exportAvec({ preferences: PREFS })) as ExportDemenagement;
  (exp.data.cles as Record<string, unknown>).brouillon = 42;
  exp.data.cles['projet-claude'] = 'x'.repeat(1_000_001);
  assert.deepEqual(
    planDemenagement(exp, vide).ecrire.map(([c]) => c),
    ['preferences'],
  );
});

// Le passeur (passeur/passeur.js, sans module) et la réception doivent parler du même format.
test('le passeur lit les clés que la réception sait écrire, et jamais la session ni la carte', () => {
  const passeur = readFileSync(new URL('../../passeur/passeur.js', import.meta.url), 'utf8');
  for (const cle of ['preferences', 'projet-claude', 'projet-chef-feta', 'brouillon', 'courses', 'recettes', 'recette-active', 'synchro-file']) {
    assert.ok(passeur.includes(`"${cle}"`), `clé ${cle} absente du passeur`);
  }
  assert.ok(!passeur.includes('carte-cumulus') && !passeur.includes('auth-token'));
});
