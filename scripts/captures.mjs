// Captures d'écran de l'app, au format téléphone, pour relire l'interface
// sans appareil. Lancé par le workflow « Captures d'écran » contre la
// version de production servie par « vite preview ».
//
// Aucune donnée réelle : une session factice est placée dans le stockage
// du navigateur et toutes les requêtes vers Supabase reçoivent des
// réponses simulées.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { lireTicket } from '../src/lib/lecteurTicket.ts';
import { TICKET_2_IDEAL } from '../src/lib/fixtures/tickets.ts';

const BASE = 'http://localhost:4173/panier-temoin/';
const REF = 'tpovnthrvlajmyjrfltn';
const SORTIE = 'captures';
mkdirSync(SORTIE, { recursive: true });

// ---------------------------------------------------------------------
// Données simulées
// ---------------------------------------------------------------------

const UTILISATEUR = {
  id: '11111111-1111-4111-8111-111111111111',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'test@exemple.ch',
  app_metadata: { provider: 'email' },
  user_metadata: {},
  created_at: '2026-10-01T00:00:00Z',
};

const session = () => ({
  access_token: 'jeton-factice',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'factice',
  user: UTILISATEUR,
});

const MAGASIN = { id: 'm1', numero_filiale: '064590', nom: 'MM Métropole Renens', format: 'MM', localite: 'Renens', canton: 'VD' };
const MAGASINS = [
  MAGASIN,
  { id: 'm2', numero_filiale: '064511', nom: 'M Morges Gare', format: 'M', localite: 'Morges', canton: 'VD' },
  { id: 'm3', numero_filiale: '061200', nom: 'MMM Balexert', format: 'MMM', localite: 'Vernier', canton: 'GE' },
];

function serie() {
  const points = [];
  const debut = Date.parse('2025-10-13T12:00:00Z');
  for (let i = 0; i < 52; i += 2) {
    const d = new Date(debut + i * 7 * 864e5).toISOString().slice(0, 10);
    const prix = i < 20 ? 220 : 240;
    points.push({ semaine: d, unite: 'piece', mediane_centimes: prix, min_centimes: prix, max_centimes: prix + 5, nb_releves: 2, nb_magasins: 2 });
  }
  return points;
}

function brouillonDemo() {
  const b = lireTicket(TICKET_2_IDEAL);
  b.methode = 'lecture_ia';
  // Une ligne mal lue, pour voir l'état « À vérifier ».
  b.lignes[3] = { ...b.lignes[3], totalCentimes: 920, douteux: ['total'] };
  b.lignes[0] = { ...b.lignes[0], produitId: 'p1', produitNom: 'Agnesi Linguine N.10' };
  return b;
}

function reponseSimulee(url, entetes) {
  const chemin = new URL(url).pathname;
  const objet = (entetes['accept'] ?? '').includes('vnd.pgrst.object');
  if (chemin.endsWith('/auth/v1/user')) return UTILISATEUR;
  if (chemin.endsWith('/rpc/rechercher_produits')) {
    return [
      { produit_id: 'p1', nom: 'Agnesi Linguine N.10', vendu_au_poids: false, score: 0.6, nb_releves: 26, dernier_prix_centimes: 240, derniere_unite: 'piece' },
      { produit_id: 'p2', nom: 'Bio lentilles rouges', vendu_au_poids: false, score: 0.4, nb_releves: 12, dernier_prix_centimes: 280, derniere_unite: 'piece' },
      { produit_id: 'p3', nom: 'Bio Fairtrade bananes', vendu_au_poids: true, score: 0.3, nb_releves: 18, dernier_prix_centimes: 295, derniere_unite: 'kg' },
    ];
  }
  if (chemin.endsWith('/rpc/serie_prix')) return serie();
  if (chemin.endsWith('/rpc/comparaison_magasins')) {
    return [
      { magasin_id: 'm2', magasin_nom: 'M Morges Gare', localite: 'Morges', canton: 'VD', unite: 'piece', mediane_centimes: 235, dernier_prix_centimes: 240, dernier_releve: '2026-10-08', nb_releves: 7 },
      { magasin_id: 'm1', magasin_nom: 'MM Métropole Renens', localite: 'Renens', canton: 'VD', unite: 'piece', mediane_centimes: 240, dernier_prix_centimes: 240, dernier_releve: '2026-10-12', nb_releves: 12 },
      { magasin_id: 'm3', magasin_nom: 'MMM Balexert', localite: 'Vernier', canton: 'GE', unite: 'piece', mediane_centimes: 255, dernier_prix_centimes: 255, dernier_releve: '2026-09-30', nb_releves: 4 },
    ];
  }
  if (chemin.endsWith('/rpc/stats_promotions')) {
    return [{ nb_achats: 26, nb_promos: 5, part_promo_pct: 19.2, rabais_moyen_pct: 32.5, rabais_max_pct: 40, derniere_promo: '2026-10-12' }];
  }
  if (chemin.endsWith('/rest/v1/produits')) {
    const p = { id: 'p1', nom: 'Agnesi Linguine N.10', vendu_au_poids: false };
    return objet ? p : [p];
  }
  if (chemin.endsWith('/rest/v1/magasins')) {
    if (url.includes('numero_filiale')) return objet ? MAGASIN : [MAGASIN];
    return MAGASINS;
  }
  if (chemin.endsWith('/rest/v1/favoris')) {
    return [{ produits: { id: 'p1', nom: 'Agnesi Linguine N.10', vendu_au_poids: false } }];
  }
  return objet ? null : [];
}

// ---------------------------------------------------------------------
// Scénarios
// ---------------------------------------------------------------------

const navigateur = await chromium.launch();

async function capturer(nom, { theme = 'light', connecte = true, brouillon = null, chemin = '', action = null } = {}) {
  const contexte = await navigateur.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: theme,
    locale: 'fr-CH',
    serviceWorkers: 'block',
  });
  await contexte.addInitScript(
    ([cle, valeurSession, valeurBrouillon]) => {
      if (valeurSession) window.localStorage.setItem(cle, valeurSession);
      if (valeurBrouillon) window.localStorage.setItem('panier-temoin:brouillon', valeurBrouillon);
    },
    [`sb-${REF}-auth-token`, connecte ? JSON.stringify(session()) : null, brouillon ? JSON.stringify(brouillon) : null],
  );
  await contexte.route(`https://${REF}.supabase.co/**`, async (route) => {
    const requete = route.request();
    const corps = reponseSimulee(requete.url(), requete.headers());
    await route.fulfill({
      status: corps === null ? 406 : 200,
      contentType: 'application/json',
      headers: { 'content-range': '0-0/1', 'access-control-allow-origin': '*' },
      body: JSON.stringify(corps ?? { message: 'aucune ligne' }),
    });
  });
  const page = await contexte.newPage();
  page.on('pageerror', (e) => console.error(`[${nom}] erreur de page : ${e.message}`));
  await page.goto(`${BASE}#/${chemin}`);
  await page.waitForTimeout(800);
  if (action) await action(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SORTIE}/${nom}.png`, fullPage: true });
  console.log(`capture : ${nom}`);
  await contexte.close();
}

const reprendre = async (page) => {
  await page.getByRole('button', { name: 'Reprendre' }).click();
};

await capturer('01-accueil');
await capturer('02-connexion', { connecte: false, chemin: 'connexion' });
await capturer('03-nouveau-ticket', { chemin: 'ajouter' });
await capturer('04-verification', { chemin: 'ajouter', brouillon: brouillonDemo(), action: reprendre });
await capturer('05-verification-ligne-ouverte', {
  chemin: 'ajouter',
  brouillon: brouillonDemo(),
  action: async (page) => {
    await reprendre(page);
    await page.locator('.ligne-a-verifier .ligne-rangee').first().click();
  },
});
await capturer('06-explorer', {
  chemin: 'explorer',
  action: async (page) => {
    await page.getByRole('searchbox').fill('lin');
    await page.waitForTimeout(700);
  },
});
await capturer('07-fiche-produit', { chemin: 'produit/p1' });
await capturer('08-verification-sombre', { theme: 'dark', chemin: 'ajouter', brouillon: brouillonDemo(), action: reprendre });
await capturer('09-fiche-produit-sombre', { theme: 'dark', chemin: 'produit/p1' });

await navigateur.close();
