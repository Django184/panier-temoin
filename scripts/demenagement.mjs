// Changement d'adresse (chantier B, ECOSYSTEME.md §7.4), de bout en bout dans Chromium.
//
//   1. L'ancienne adresse (un serveur local, préfixe /panier-temoin/) sert une app installée
//      simulée : service worker en cache d'abord, cache nommé comme celui de Workbox, données
//      de l'app dans le stockage (dont une session et une carte Cumulus, qui ne doivent pas partir).
//   2. Elle passe au passeur (passeur/) : le service worker d'autodestruction remplace l'ancien,
//      efface ses caches (pas ceux des autres apps de l'origine), se désinscrit et recharge la fenêtre.
//   3. Le passeur transmet les données à la nouvelle adresse (l'app construite, servie par
//      « vite preview » sur un autre port, donc une autre origine), qui les écrit et l'annonce.
//
// Lancer après « npm run build » et « npx vite preview --port 4173 » : node scripts/demenagement.mjs

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const NOUVELLE = process.env.NOUVELLE ?? 'http://localhost:4173/';
const REF = 'tpovnthrvlajmyjrfltn';
let enPasseur = false;

// L'app installée de l'ancienne adresse, réduite à ce qui compte ici : son service worker.
const ANCIENNE_PAGE = '<!doctype html><title>Ancienne app</title><script src="ancienne.js"></script><p>ancienne app</p>';
const ANCIENNE_JS = 'navigator.serviceWorker.register("sw.js");';
const ANCIEN_SW = `
const CACHE = "workbox-precache-v2-" + self.registration.scope;
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "ancienne.js"]))));
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode === "navigate") { e.respondWith(caches.match("./")); return; }
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});`;

const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css' };
const ancien = http.createServer(async (req, res) => {
  const chemin = new URL(req.url, 'http://x').pathname;
  if (!chemin.startsWith('/panier-temoin/')) return res.writeHead(404).end();
  const fichier = chemin.slice('/panier-temoin/'.length) || 'index.html';
  const ext = fichier.split('.').pop();
  let corps;
  if (!enPasseur) {
    corps = { 'index.html': ANCIENNE_PAGE, 'ancienne.js': ANCIENNE_JS, 'sw.js': ANCIEN_SW }[fichier];
  } else {
    try {
      corps = await readFile(new URL(`../passeur/${fichier}`, import.meta.url), 'utf8');
      if (fichier === 'index.html') corps = corps.replaceAll('https://panier-temoin.pages.dev/', NOUVELLE);
    } catch {
      corps = undefined;
    }
  }
  if (corps === undefined) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': TYPES[ext] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(corps);
});
await new Promise((r) => ancien.listen(0, r));
const ANCIENNE = `http://localhost:${ancien.address().port}/panier-temoin/`;

let echecs = 0;
const ok = (cond, msg) => {
  console.log((cond ? '✓ ' : '✗ ') + msg);
  if (!cond) {
    echecs++;
    console.log(`::error::Déménagement : ${msg}`);
  }
};
async function attendreAdresse(page, debut, delai = 15000) {
  const fin = Date.now() + delai;
  while (Date.now() < fin) {
    if (page.url().startsWith(debut)) {
      await page.waitForLoadState('load').catch(() => {});
      return true;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

const navigateur = await chromium.launch();
const contexte = await navigateur.newContext({ locale: 'fr-CH' });
// Aucune requête réelle vers Supabase.
await contexte.route(`https://${REF}.supabase.co/**`, (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' }),
);
const page = await contexte.newPage();
const erreurs = [];
page.on('pageerror', (e) => erreurs.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) erreurs.push(m.text());
});

// 1. Ancienne adresse : app installée, avec ses données (et celles d'une app voisine).
const PREFS = { aides: false, aidesVues: ['courses'], coches: 'en_place', couleur: 'rose' };
const FILE = [{ table: 'courses_articles', type: 'upsert', id: '22222222-2222-4222-8222-222222222222', a: 1 }];
const COURSES = [{ id: FILE[0].id, texte: 'Lait entier 1 l', rayon: 'Produits laitiers', recetteId: null, recette: '', ingredient: null, coche: false, manuel: true }];
await page.goto(ANCIENNE);
await page.evaluate(
  ([prefs, file, courses]) => {
    const p = 'panier-temoin:';
    localStorage.setItem(p + 'preferences', JSON.stringify(prefs));
    localStorage.setItem(p + 'projet-claude', 'https://claude.ai/project/00000000-0000-4000-8000-000000000000');
    localStorage.setItem(p + 'synchro-file', JSON.stringify(file));
    localStorage.setItem(p + 'courses', JSON.stringify(courses));
    localStorage.setItem(p + 'recettes', JSON.stringify([{ id: 'r-sans-attente', titre: 'Déjà dans la base' }]));
    localStorage.setItem(p + 'carte-cumulus', JSON.stringify({ numero: '2099999999993' }));
    localStorage.setItem('sb-tpovnthrvlajmyjrfltn-auth-token', '{"access_token":"jeton-factice"}');
  },
  [PREFS, FILE, COURSES],
);
await page.evaluate(() => navigator.serviceWorker.ready);
await page.evaluate(() => caches.open('ma-journee-voisine').then((c) => c.put('/minuterie/x', new Response('x'))));
await page.goto(ANCIENNE + '#/courses');
await page.waitForFunction(() => !!navigator.serviceWorker.controller);
ok((await page.evaluate(() => caches.keys())).some((c) => c.includes('/panier-temoin/')), 'ancienne adresse : app installée et en cache');

// 2. Passeur publié ; le navigateur vérifie la mise à jour du service worker.
enPasseur = true;
await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update())).catch(() => {});
ok(await attendreAdresse(page, NOUVELLE), 'fenêtre rechargée puis renvoyée vers la nouvelle adresse');
await page.waitForSelector('#racine *');
await page.waitForTimeout(800);

// 3. Nouvelle adresse : ce qui est repris, ce qui ne l'est pas, ce qui est annoncé.
const nouvelles = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
ok(new URL(page.url()).hash === '#/courses', 'arrivée sur la liste, lien de déménagement retiré');
ok(JSON.parse(nouvelles['panier-temoin:preferences'] ?? '{}').couleur === 'rose', 'préférences reprises (couleur rose)');
ok(await page.evaluate(() => document.documentElement.dataset.couleur === 'rose' && document.documentElement.dataset.aides === 'non'),
  'préférences appliquées dès le premier affichage');
ok(nouvelles['panier-temoin:projet-claude']?.startsWith('https://claude.ai/project/'), 'adresse du projet Claude reprise');
ok(JSON.parse(nouvelles['panier-temoin:synchro-file'] ?? '[]').length === 1, 'changement non envoyé repris, pour envoi après connexion');
ok(!('panier-temoin:recettes' in nouvelles) || !nouvelles['panier-temoin:recettes'].includes('r-sans-attente'), 'recettes sans changement en attente laissées à la base');
ok(!('panier-temoin:carte-cumulus' in nouvelles), 'carte Cumulus non transmise');
ok(!Object.keys(nouvelles).some((k) => k.startsWith('sb-')), 'session Supabase non transmise');
const texte = await page.textContent('body');
ok(texte.includes('a changé d’adresse') && texte.includes('1 changement de la liste sera envoyé'), 'message affiché sur la liste');

// 4. Ancienne adresse : service worker et caches de l'app supprimés, le reste intact.
const p2 = await contexte.newPage();
await p2.goto(ANCIENNE + 'passeur.css');
const etat = await p2.evaluate(async () => ({
  regs: (await navigator.serviceWorker.getRegistrations()).length,
  caches: await caches.keys(),
  donnees: !!localStorage.getItem('panier-temoin:preferences'),
}));
ok(etat.regs === 0 && !etat.caches.some((c) => c.includes('/panier-temoin/')), 'ancienne adresse : service worker désinscrit, caches de l’app effacés');
ok(etat.caches.includes('ma-journee-voisine'), 'ancienne adresse : caches des autres apps de l’origine intacts');
ok(etat.donnees, 'ancienne adresse : données d’origine conservées');

// 5. Un lien de Claude ouvert à l'ancienne adresse suit tel quel vers la nouvelle.
const p3 = await contexte.newPage();
const lien = '#/courses/' + encodeURIComponent(JSON.stringify({ r: 'Soupe test', p: 2, i: [['Légumes', '2 carottes']] }));
await p3.goto(ANCIENNE + lien).catch(() => {});
ok(await attendreAdresse(p3, NOUVELLE), 'lien de recette : renvoyé vers la nouvelle adresse');
await p3.waitForTimeout(800);
ok((await p3.textContent('body')).includes('Soupe test'), 'lien de recette : recette reçue à la nouvelle adresse');

ok(erreurs.length === 0, 'aucune erreur de page ni violation de CSP' + (erreurs.length ? ` : ${erreurs.join(' | ')}` : ''));
await navigateur.close();
ancien.close();
console.log(echecs ? `\n${echecs} échec(s)` : '\nChangement d’adresse vérifié.');
process.exit(echecs ? 1 : 0);
