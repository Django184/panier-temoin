// Génère des codes-barres EAN-13 de test (images PGM) avec leur
// texte attendu, pour vérification par un décodeur indépendant
// (zxing-cpp) dans le workflow « Tests et publication ».
// Usage : node scripts/codes_de_test.ts <dossier>

import { mkdirSync, writeFileSync } from 'node:fs';
import { genererEan13 } from '../src/lib/ean13.ts';

const dossier = process.argv[2] ?? 'codes-test';
mkdirSync(dossier, { recursive: true });

function image(modules: boolean[][], marge: number, echelle: number): Buffer {
  const largeur = (modules[0].length + 2 * marge) * echelle;
  const hauteur = (modules.length + 2 * marge) * echelle;
  const px = Buffer.alloc(largeur * hauteur, 255);
  modules.forEach((rangee, y) =>
    rangee.forEach((sombre, x) => {
      if (!sombre) return;
      for (let dy = 0; dy < echelle; dy++)
        for (let dx = 0; dx < echelle; dx++) px[((y + marge) * echelle + dy) * largeur + (x + marge) * echelle + dx] = 0;
    }),
  );
  return Buffer.concat([Buffer.from(`P5 ${largeur} ${hauteur} 255\n`), px]);
}

const attendus: Array<{ fichier: string; format: string; texte: string }> = [];

for (const numero of ['2099000000002', '4006381333931']) {
  const barres = genererEan13(numero);
  writeFileSync(`${dossier}/ean-${numero}.pgm`, image(Array.from({ length: 60 }, () => barres), 10, 3));
  attendus.push({ fichier: `ean-${numero}.pgm`, format: 'EAN13', texte: numero });
}
writeFileSync(`${dossier}/attendus.json`, JSON.stringify(attendus, null, 2));
console.log(`${attendus.length} codes générés dans ${dossier}`);
