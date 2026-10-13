// Copie le moteur OCR (Tesseract.js) et le modèle de langue français dans
// public/ocr/, pour que l'app les serve elle-même au lieu de les charger
// depuis un CDN tiers. Lancé automatiquement par « npm run dev » et
// « npm run build ».

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const modules = join(racine, 'node_modules');
const cible = join(racine, 'public', 'ocr');

function exiger(chemin) {
  if (!existsSync(chemin)) {
    console.error(`Fichier introuvable : ${chemin}\nLancez d'abord « npm install ».`);
    process.exit(1);
  }
  return chemin;
}

rmSync(cible, { recursive: true, force: true });
mkdirSync(join(cible, 'core'), { recursive: true });
mkdirSync(join(cible, 'lang'), { recursive: true });

// 1. Le worker de Tesseract.js
cpSync(exiger(join(modules, 'tesseract.js', 'dist', 'worker.min.js')), join(cible, 'worker.min.js'));

// 2. Le cœur WASM : toutes les variantes, Tesseract.js choisit selon l'appareil
const dossierCore = exiger(join(modules, 'tesseract.js-core'));
const variantes = readdirSync(dossierCore).filter((f) => f.endsWith('.wasm.js') || f.endsWith('.wasm'));
if (variantes.length === 0) {
  console.error('Aucune variante du cœur WASM trouvée dans tesseract.js-core.');
  process.exit(1);
}
for (const fichier of variantes) {
  cpSync(join(dossierCore, fichier), join(cible, 'core', fichier));
}

// 3. Le modèle français compact (LSTM, entiers) : environ 700 Ko
cpSync(
  exiger(join(modules, '@tesseract.js-data', 'fra', '4.0.0_best_int', 'fra.traineddata.gz')),
  join(cible, 'lang', 'fra.traineddata.gz'),
);

console.log(`Moteur OCR copié dans public/ocr (${variantes.length} fichiers de cœur).`);
