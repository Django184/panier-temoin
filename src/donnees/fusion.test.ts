// Tests de la fusion entre la liste locale et la liste partagée.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { differences, fusionner, memesListes, type Attente } from './fusion.ts';

interface Article {
  id: string;
  texte: string;
  coche: boolean;
}
const egal = (a: Article, b: Article) => a.texte === b.texte && a.coche === b.coche;
const ordre = (a: Article, b: Article) => a.id.localeCompare(b.id);
const art = (id: string, texte: string, coche = false): Article => ({ id, texte, coche });

test('différences : ajouts, modifications, suppressions', () => {
  const d = differences([art('a', 'lait'), art('b', 'pain')], [art('a', 'lait', true), art('c', 'feta')], egal);
  assert.deepEqual(d.modifies.map((x) => x.id), ['a', 'c']);
  assert.deepEqual(d.supprimes, ['b']);
});

test('fusion : la base fait foi pour ce qui n’attend pas d’envoi', () => {
  const local = [art('a', 'lait'), art('b', 'pain')];
  // L'autre téléphone a coché « pain » et ajouté « feta », retiré « lait ».
  const distants = [art('b', 'pain', true), art('c', 'feta')];
  const r = fusionner(local, distants, new Map(), egal, ordre);
  assert.deepEqual(r, [art('b', 'pain', true), art('c', 'feta')]);
});

test('fusion : les changements locaux non envoyés l’emportent', () => {
  const local = [art('a', 'lait', true), art('d', 'œufs')];
  const distants = [art('a', 'lait'), art('b', 'pain')];
  const attente: Attente = new Map([
    ['a', 'upsert'], // coché ici, pas encore envoyé
    ['d', 'upsert'], // ajouté ici hors ligne
    ['b', 'delete'], // retiré ici hors ligne
  ]);
  const r = fusionner(local, distants, attente, egal, ordre);
  assert.deepEqual(r, [art('a', 'lait', true), art('d', 'œufs')]);
});

test('fusion : objets locaux identiques réutilisés', () => {
  const lait = art('a', 'lait');
  const r = fusionner([lait], [art('a', 'lait')], new Map(), egal, ordre);
  assert.equal(r[0], lait);
  assert.ok(memesListes([lait], r, egal));
});
