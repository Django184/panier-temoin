// Tests de structure du code-barres EAN-13. Le décodage réel par un
// lecteur indépendant (zxing-cpp) est vérifié dans l'intégration continue
// (scripts/codes_de_test.ts et scripts/verifier_codes.py).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chiffreControle, ean13Valide, genererEan13 } from './ean13.ts';

test('EAN-13 : chiffre de contrôle et 95 modules', () => {
  assert.equal(chiffreControle('400638133393'), 1);
  assert.ok(ean13Valide('4006381333931'));
  assert.ok(!ean13Valide('4006381333932'));
  const barres = genererEan13('4006381333931');
  assert.equal(barres.length, 95);
  assert.deepEqual(barres.slice(0, 3), [true, false, true]);
});
