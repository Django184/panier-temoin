// Vérification du site publié (job « Site publié » de la CI) :
//   node scripts/en_ligne.mjs https://panier-temoin.pages.dev/
// En-têtes HTTP, manifeste, version servie, lien de recette envoyé par Claude, rechargement hors ligne.
// Aucun contournement de la CSP ; aucune requête réelle vers Supabase (réponses vides simulées).

import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const SITE = process.argv[2] ?? 'https://panier-temoin.pages.dev/';
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const REF = 'tpovnthrvlajmyjrfltn';

let echecs = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✓ ' : '✗ ') + msg);
  if (!cond) {
    echecs++;
    console.log(`::error::Site publié : ${msg}`);
  }
};

const navigateur = await chromium.launch();
const contexte = await navigateur.newContext({ locale: 'fr-CH' });
await contexte.route(`https://${REF}.supabase.co/**`, (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' }),
);
const page = await contexte.newPage();
const erreurs = [];
page.on('pageerror', (e) => erreurs.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) erreurs.push(m.text());
});

// 1. En-têtes, manifeste, version.
const reponse = await page.goto(SITE);
const h = reponse.headers();
ok((h['content-security-policy'] ?? '').includes("frame-ancestors 'none'"), 'CSP en en-tête HTTP, avec frame-ancestors');
ok(h['x-content-type-options'] === 'nosniff' && h['referrer-policy'] === 'strict-origin-when-cross-origin', 'nosniff et Referrer-Policy');
await page.waitForSelector('#racine *');
const infos = await page.evaluate(async () => ({
  manifeste: await (await fetch(document.querySelector('link[rel="manifest"]').href)).json(),
  version: await (await fetch('version.json', { cache: 'no-store' })).json(),
}));
ok(infos.manifeste.id === '/' && infos.manifeste.start_url === '/' && infos.manifeste.scope === '/', 'manifeste : id, start_url et scope à « / »');
ok(infos.manifeste.shortcuts?.every((r) => r.url.startsWith('/#/')), 'raccourcis du manifeste à la nouvelle adresse');
ok(infos.version.version === VERSION, `version ${VERSION} servie`);

// 2. Lien de recette tel que Chef Feta l'écrit.
const recette = { r: 'Recette de contrôle', p: 2, i: [['Légumes', '2 carottes']] };
await page.goto(SITE + '#/courses/' + encodeURIComponent(JSON.stringify(recette)));
await page.reload();
await page.waitForTimeout(1000);
ok((await page.textContent('body')).includes('Recette de contrôle'), 'lien de recette reçu et ajouté à la liste');

// 3. Hors ligne : la coquille de l'app est servie par le service worker.
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
await page.waitForFunction(() => !!navigator.serviceWorker.controller);
await contexte.setOffline(true);
await page.reload();
await page.waitForSelector('#racine *');
ok((await page.textContent('body')).includes('2 carottes'), 'hors ligne : l’app s’ouvre avec la liste');
await contexte.setOffline(false);

ok(erreurs.length === 0, 'aucune erreur de page ni violation de CSP' + (erreurs.length ? ` : ${erreurs.join(' | ')}` : ''));
await navigateur.close();
console.log(echecs ? `\n${echecs} échec(s)` : '\nSite publié conforme.');
process.exit(echecs ? 1 : 0);
