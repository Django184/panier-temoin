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
  b.methode = 'import_claude';
  // Comme pour un ticket lu par Claude, l'unité n'est pas devinée.
  b.lignes = b.lignes.map((l) => ({ ...l, douteux: l.douteux.filter((d) => d !== 'unite') }));
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
  if (chemin.endsWith('/rpc/derniers_achats')) {
    const achat = (produit_id, nom, unite, prix, precedent, promo = false) => ({
      produit_id, nom, vendu_au_poids: unite === 'kg', unite, date_achat: '2026-10-12',
      prix_normal_centimes: prix, prix_paye_centimes: promo ? Math.round(prix * 0.6) : prix, est_promo: promo,
      precedent_prix_centimes: precedent, precedent_date: precedent ? '2026-09-28' : null,
      variation_pct: precedent ? Math.round(((prix - precedent) * 1000) / precedent) / 10 : null,
    });
    return [
      achat('p1', 'Agnesi Linguine N.10', 'piece', 240, 220, true),
      achat('p2', 'Bio lentilles rouges', 'piece', 280, 280, true),
      achat('p3', 'Bio Fairtrade bananes', 'kg', 295, 310),
      achat('p4', 'MBud gnocchi', 'piece', 195, 185),
      achat('p5', 'Bio Feta', 'piece', 320, null),
      achat('p6', 'Pommes rou. douce Gala', 'kg', 280, 295),
    ];
  }
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
  if (chemin.endsWith('/rest/v1/carte_cumulus')) {
    // Code fictif : jamais la vraie carte dans les captures.
    const carte = { code: '9201A11/CarteFictiveDemo0000AbCdEfGhIjKlMnOpQr==', numero: '2099000000002', modifie_le: '2026-10-13T08:00:00Z' };
    return objet ? carte : [carte];
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

async function capturer(nom, { theme = 'light', connecte = true, brouillon = null, chemin = '', action = null, projet = true, aides = false, coches = 'en_bas', sansAide = false } = {}) {
  const contexte = await navigateur.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: theme,
    locale: 'fr-CH',
    serviceWorkers: 'block',
  });
  await contexte.addInitScript(
    ([cle, valeurSession, valeurBrouillon, avecProjet, avecAides, modeCoches, aidesCoupees]) => {
      if (sessionStorage.getItem('capture-pret')) return; // une seule fois par onglet
      sessionStorage.setItem('capture-pret', '1');
      if (valeurSession) window.localStorage.setItem(cle, valeurSession);
      if (valeurBrouillon) window.localStorage.setItem('panier-temoin:brouillon', valeurBrouillon);
      if (avecProjet) {
        window.localStorage.setItem('panier-temoin:projet-claude', 'https://claude.ai/project/00000000-0000-4000-8000-000000000000');
        window.localStorage.setItem('panier-temoin:projet-chef-feta', 'https://claude.ai/project/11111111-0000-4000-8000-000000000000');
      }
      window.localStorage.setItem(
        'panier-temoin:preferences',
        JSON.stringify({
          aides: !aidesCoupees,
          aidesVues: avecAides ? [] : ['ajouter', 'courses'],
          coches: modeCoches,
        }),
      );
    },
    [`sb-${REF}-auth-token`, connecte ? JSON.stringify(session()) : null, brouillon ? JSON.stringify(brouillon) : null, projet, aides, coches, sansAide],
  );
  // Tables partagées simulées (liste de courses, recettes), en mémoire.
  const tables = { courses_articles: new Map(), recettes: new Map() };
  await contexte.route(`https://${REF}.supabase.co/**`, async (route) => {
    const requete = route.request();
    const url = new URL(requete.url());
    const table = Object.keys(tables).find((t) => url.pathname.endsWith(`/rest/v1/${t}`));
    if (table) {
      const methode = requete.method();
      if (methode === 'POST') {
        const corps = requete.postDataJSON();
        for (const ligne of Array.isArray(corps) ? corps : [corps]) tables[table].set(ligne.id, ligne);
      } else if (methode === 'DELETE') {
        const ids = (url.searchParams.get('id') ?? '').replace(/^in\.\(|\)$/g, '').split(',');
        ids.forEach((id) => tables[table].delete(id.replaceAll('"', '')));
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(methode === 'GET' ? [...tables[table].values()] : []),
      });
      return;
    }
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
  await page.screenshot({ path: `${SORTIE}/${nom}.png` });
  await page.screenshot({ path: `${SORTIE}/${nom}-complet.png`, fullPage: true });
  console.log(`capture : ${nom}`);
  await contexte.close();
}

const reprendre = async (page) => {
  await page.getByRole('button', { name: 'Reprendre' }).click();
};

// Lien « Ajouter à ma liste de courses » tel que Chef Feta l'écrit.
const LIEN_COURSES = '#/courses/' + JSON.stringify({
  r: 'Poulet sauté façon teriyaki',
  p: 4,
  m: 'Préparation : 15 min · Cuisson : 20 min · Toutes saisons',
  i: [
    ['Légumes', '250 g de champignons de Paris'], ['Légumes', '2 carottes moyennes'], ['Légumes', '1 oignon rouge'],
    ['Légumes', "2 gousses d'ail"], ['Viandes et poissons', '700 g de blancs de poulet (ou cuisses désossées)'],
    ['Fruits secs', '1 cas de graines de sésame (optionnel)'], ['Bocaux', '3 cas de miel (?)'],
    ['Bocaux', '1,5 cas de vinaigre de riz'], ['Pâtes', '300 g de riz basmati'], ['Pâtes', '1,5 cac de maïzena'],
    ['Produits asiatiques et Tex-Mex', '6 cas de sauce soja'], ['Placard — à vérifier', "1 cas d'huile neutre"],
  ],
  e: [
    'Lance le riz selon les instructions du paquet.',
    "**Sauce :** dans un bol, mélange la sauce soja, le miel, le vinaigre, l'ail pressé et la maïzena.",
    "**Poulet :** chauffe l'huile à feu vif et saisis le poulet 5 à 6 min sans trop remuer. Réserve.",
    "**Légumes :** fais revenir l'oignon 2 min, ajoute les carottes 3 min puis les champignons 4 min.",
    '**Laquage :** remets le poulet, verse la sauce et laisse caraméliser 2 à 3 min.',
  ],
  a: ['Laisse les champignons bien colorer avant de remettre le poulet.', 'Variante sans viande : 400 g de tofu ferme et 250 g d’edamame.'],
  n: 'Protéines ~40 g | Glucides ~57 g | Lipides ~8 g | ~465 kcal',
}).replaceAll('%', '%25').replaceAll(' ', '%20').replaceAll('#', '%23').replaceAll('(', '%28').replaceAll(')', '%29');
// Coche le 1er article, puis le seul article du rayon « Viandes et poissons ».
const cocherDeux = async (page) => {
  await page.getByLabel('250 g de champignons de Paris').check();
  await page.waitForTimeout(400);
  await page.getByLabel(/blancs de poulet/).check();
  await page.waitForTimeout(400);
};
// Lien « Ouvrir dans Panier Témoin » tel que Claude l'écrit pour un ticket.
const LIEN_IMPORT = '#/import/' + JSON.stringify({
  f: '064590', m: 'MM Métropole Renens', l: 'Renens', c: 'Vaud', d: '2026-10-12', h: '19:00:05', t: '12.75', e: '4.00',
  a: [['Agnesi Linguine N.10', '3', '2.40', '2.88', '4.32'], ['Bio lentilles rouges', '2', '2.80', '1.12', '4.48'], ['MBud gnocchi', '1', '1.95', '', '1.95'], ['Aubergines', '1', '4.00', '', '2.00']],
}).replaceAll(' ', '%20');

await capturer('01-courses', { chemin: LIEN_COURSES.slice(2), action: cocherDeux });
await capturer('01b-courses-a-leur-place', { chemin: LIEN_COURSES.slice(2), action: cocherDeux, coches: 'en_place' });
await capturer('02-courses-modifier', {
  chemin: LIEN_COURSES.slice(2),
  action: async (page) => {
    await page.getByRole('button', { name: 'Modifier' }).click();
  },
});
await capturer('02b-courses-historique', {
  chemin: LIEN_COURSES.slice(2),
  action: async (page) => {
    await page.getByRole('button', { name: 'Recettes' }).click();
  },
});
await capturer('04b-recette-ingredient-retire', {
  chemin: LIEN_COURSES.slice(2),
  action: async (page) => {
    await page.getByRole('button', { name: 'Modifier' }).click();
    await page.getByRole('button', { name: 'Retirer 1 oignon rouge' }).click();
    await page.getByRole('button', { name: 'Terminé' }).click();
    await page.getByRole('link', { name: 'Recette' }).click();
  },
});
await capturer('03-courses-premiere-fois', { chemin: 'courses', projet: false, aides: true });
await capturer('04-recette', {
  chemin: LIEN_COURSES.slice(2),
  action: async (page) => {
    await page.getByRole('link', { name: 'Recette' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Une personne de moins' }).click();
    await page.getByRole('button', { name: 'Une personne de moins' }).click();
  },
});
await capturer('05-recette-modifier', {
  chemin: LIEN_COURSES.slice(2),
  action: async (page) => {
    await page.getByRole('link', { name: 'Recette' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Modifier' }).click();
  },
});
await capturer('06-carte', { chemin: 'carte' });
await capturer('08-ticket', { chemin: 'ajouter' });
await capturer('09-ticket-premiere-fois', { chemin: 'ajouter', projet: false, aides: true });
await capturer('10-retour-de-claude', { chemin: LIEN_IMPORT.slice(2) });
await capturer('11-verification', { chemin: 'ajouter', brouillon: brouillonDemo(), action: reprendre });
await capturer('12-prix', { chemin: 'explorer' });
await capturer('12b-prix-hausses-par-ecart', {
  chemin: 'explorer',
  action: async (page) => {
    await page.getByRole('radio', { name: /Hausse/ }).click();
    await page.getByRole('radio', { name: 'Écart' }).click();
  },
});
await capturer('13-fiche-produit', { chemin: 'produit/p1' });
await capturer('14-reglages', { chemin: 'reglages' });
await capturer('15-reglages-deconnecte', { connecte: false, chemin: 'reglages' });
await capturer('16-courses-sombre', { theme: 'dark', chemin: LIEN_COURSES.slice(2), action: cocherDeux });
await capturer('17-recette-sombre', {
  theme: 'dark',
  chemin: LIEN_COURSES.slice(2),
  action: async (page) => {
    await page.getByRole('link', { name: 'Recette' }).click();
  },
});
await capturer('18-prix-sombre', { theme: 'dark', chemin: 'explorer' });

// Interface sans aide (Réglages → Aides désactivées).
await capturer('19-courses-sans-aide', { chemin: LIEN_COURSES.slice(2), action: cocherDeux, sansAide: true });
await capturer('20-prix-sans-aide', { chemin: 'explorer', sansAide: true });
await capturer('21-carte-sans-aide', { chemin: 'carte', sansAide: true });
await capturer('22-reglages-sans-aide', { chemin: 'reglages', sansAide: true });

await navigateur.close();
