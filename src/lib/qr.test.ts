// Tests du générateur de QR code : structure de la matrice. Le décodage
// réel par un lecteur a été vérifié à part (OpenCV), versions 1 à 10.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genererQR } from './qr.ts';

test('QR : taille selon la longueur du texte', () => {
  assert.equal(genererQR('A').length, 21); // version 1
  assert.equal(genererQR('x'.repeat(48)).length, 33); // version 4
  assert.throws(() => genererQR('x'.repeat(300)));
});

test('QR : motifs de repérage dans les trois coins', () => {
  const m = genererQR('Carte de test 0123456789');
  const t = m.length;
  for (const [x, y] of [[0, 0], [t - 7, 0], [0, t - 7]]) {
    for (let i = 0; i < 7; i++) {
      assert.equal(m[y][x + i], true, 'bord haut sombre');
      assert.equal(m[y + 6][x + i], true, 'bord bas sombre');
    }
    assert.equal(m[y + 1][x + 1], false, 'anneau clair');
    assert.equal(m[y + 3][x + 3], true, 'centre sombre');
  }
});
