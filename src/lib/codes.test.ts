// Tests de structure des codes Aztec et EAN-13. Le décodage réel par un
// lecteur indépendant (zxing-cpp) est vérifié dans l'intégration continue
// (scripts/codes_de_test.ts et scripts/verifier_codes.py).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genererAztec } from './aztec.ts';
import { chiffreControle, ean13Valide, genererEan13 } from './ean13.ts';

test('Aztec : symbole compact pour un code Cumulus, cible centrale', () => {
  const m = genererAztec('9201A11/AbCdEfGhIjKlMnOpQrStUvWxYz012345678+/w==');
  const t = m.length;
  assert.ok(t <= 27, `compact attendu, taille ${t}`);
  const c = Math.floor(t / 2);
  // Anneaux alternés de la cible : centre sombre, puis clair, sombre…
  for (let r = 0; r <= 4; r++) assert.equal(m[c][c + r], r % 2 === 0, `anneau ${r}`);
});

test('Aztec : grand symbole au-delà de 4 couches', () => {
  assert.ok(genererAztec('x'.repeat(300)).length > 27);
});

test('EAN-13 : chiffre de contrôle et 95 modules', () => {
  assert.equal(chiffreControle('400638133393'), 1);
  assert.ok(ean13Valide('4006381333931'));
  assert.ok(!ean13Valide('4006381333932'));
  const barres = genererEan13('4006381333931');
  assert.equal(barres.length, 95);
  assert.deepEqual(barres.slice(0, 3), [true, false, true]);
});
