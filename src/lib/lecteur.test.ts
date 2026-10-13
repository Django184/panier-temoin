// Tests du lecteur de ticket, de l'import depuis Claude et des contrôles.
// Exécution : npm test (Node 22.18 ou plus, sans dépendance).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lireTicket, lireLigneArticle } from './lecteurTicket.ts';
import { lireReponseClaude, ErreurImport, ADRESSE_IMPORT, INSTRUCTIONS_PROJET } from './importClaude.ts';
import { etatTicket } from './coherence.ts';
import { versCentimes, enFrancs, enCHF } from './montants.ts';
import {
  TICKET_1_IDEAL,
  TICKET_2_IDEAL,
  TICKET_1_OCR_BRUT,
  TICKET_2_OCR_BRUT,
  TICKET_2_OCR_ARTICLES,
} from './fixtures/tickets.ts';

const ligne = (ticket: ReturnType<typeof lireTicket>, debut: string) => {
  const trouvee = ticket.lignes.find((l) => l.libelle.startsWith(debut));
  assert.ok(trouvee, `ligne « ${debut} » introuvable`);
  return trouvee;
};

test('montants : conversions', () => {
  assert.equal(versCentimes('2.40'), 240);
  assert.equal(versCentimes('2,4'), 240);
  assert.equal(versCentimes('24'), 2400);
  assert.equal(versCentimes('abc'), null);
  assert.equal(enFrancs(5), '0.05');
  assert.equal(enFrancs(2460), '24.60');
  assert.equal(enCHF(null), '');
});

test('ticket 1 transcrit : en-tête, pied et 4 lignes justes', () => {
  const t = lireTicket(TICKET_1_IDEAL);
  assert.deepEqual(t.magasin, {
    numeroFiliale: '064590', nom: 'MM Métropole Renens', format: 'MM', localite: 'Renens', canton: 'VD',
  });
  assert.equal(t.date, '2026-10-12');
  assert.equal(t.heure, '12:43:59', 'heure du pied, pas celle du paiement (12:45:24)');
  assert.equal(t.totalCentimes, 640);
  assert.equal(t.lignes.length, 4);

  const poivrons = ligne(t, 'Poivrons rouges');
  assert.equal(poivrons.unite, 'kg');
  assert.equal(poivrons.quantite, 0.303);
  assert.equal(poivrons.prixCentimes, 380);
  assert.ok(poivrons.douteux.includes('unite'), 'un article pesé est à confirmer');

  assert.deepEqual(ligne(t, 'MClass fromage').douteux, []);
  assert.equal(etatTicket(t).pret, true);
});

test('ticket 2 transcrit : promotions et articles pesés', () => {
  const t = lireTicket(TICKET_2_IDEAL);
  assert.equal(t.heure, '19:00:05');
  assert.equal(t.totalCentimes, 2460);
  assert.equal(t.rabaisTotalCentimes, 400);
  assert.equal(t.lignes.length, 9);

  const linguine = ligne(t, 'Agnesi');
  assert.deepEqual(
    [linguine.quantite, linguine.prixCentimes, linguine.rabaisCentimes, linguine.totalCentimes],
    [3, 240, 288, 432],
  );
  assert.equal(ligne(t, 'Bio Fairtrade').quantite, 0.881);
  assert.equal(ligne(t, 'Pommes').quantite, 0.482);
  assert.equal(ligne(t, 'Bio courgettes').unite, 'piece');
  assert.equal(etatTicket(t).pret, true);
});

test('aucune donnée sensible extraite', () => {
  for (const texte of [TICKET_1_IDEAL, TICKET_2_IDEAL, TICKET_1_OCR_BRUT, TICKET_2_OCR_BRUT]) {
    const json = JSON.stringify(lireTicket(texte));
    assert.ok(!json.includes('1234'), 'le numéro Cumulus ne doit pas apparaître');
    assert.ok(!/cumulus|twint|visa|trm-id/i.test(json), 'aucune ligne de paiement ne doit devenir un article');
  }
});

test('OCR réel du bloc d’articles : réparations arithmétiques', () => {
  const t = lireTicket(TICKET_2_OCR_ARTICLES);

  const linguine = ligne(t, 'ignesi');
  assert.equal(linguine.prixCentimes, 240, 'prix lu 0.40, recalculé à partir du total et du rabais');
  assert.ok(linguine.douteux.includes('prix'));

  const lentilles = ligne(t, 'Yentilles');
  assert.equal(lentilles.quantite, 2, 'quantité lue 42, recalculée');
  assert.ok(lentilles.douteux.includes('quantite'));
  assert.equal(lentilles.rabaisCentimes, 112, '« 112 » lu sans point décimal');

  const bananes = ligne(t, 'vig Fairtrade');
  assert.equal(bananes.unite, 'kg');
  assert.equal(bananes.quantite, 0.881);

  // Les lignes mal lues restent signalées, jamais validées en silence.
  const feta = ligne(t, 'jofeta');
  assert.ok(feta.douteux.length > 0);
});

test('OCR réel de la page entière : pied, totaux et canton', () => {
  const t2 = lireTicket(TICKET_2_OCR_BRUT);
  assert.equal(t2.magasin.numeroFiliale, '064590');
  assert.equal(t2.date, '2026-10-12');
  assert.equal(t2.heure, '19:00:05');
  assert.equal(t2.totalCentimes, 2460);
  assert.equal(t2.rabaisTotalCentimes, 400, '« écononisez » est reconnu malgré l’erreur de l’OCR');
  assert.equal(t2.magasin.canton, 'VD');

  const t1 = lireTicket(TICKET_1_OCR_BRUT);
  assert.equal(t1.magasin.numeroFiliale, '', 'pied coupé sur la photo');
  assert.equal(t1.heure, '12:45:24', 'à défaut, heure du paiement…');
  assert.ok(t1.douteux.includes('heure'), '… marquée à vérifier');
  for (const l of t1.lignes) {
    assert.notEqual(l.totalCentimes, 640, 'une ligne incertaine ne reçoit pas tout le total du ticket');
  }
});

test('ligne isolée : libellé contenant des o et des l', () => {
  const l = lireLigneArticle('Pommes rou. douce Gala 1 2.80 1.35 1');
  assert.ok(l);
  assert.equal(l.libelle, 'Pommes rou. douce Gala');
  assert.equal(l.unite, 'kg');
});

test('contrôles : une ligne modifiée casse la somme', () => {
  const t = lireTicket(TICKET_2_IDEAL);
  t.lignes[3].totalCentimes = 330;
  const etat = etatTicket(t);
  assert.equal(etat.pret, false);
  assert.equal(etat.lignesIncoherentes.length, 1);
  assert.equal(etat.ecartTotalCentimes, 10);
});

test('import depuis Claude : réponse entourée de texte et de balises', () => {
  const reponse = `Voici le ticket :
\`\`\`json
{
  "magasin": { "numero_filiale": "064590", "nom": "MM Métropole Renens", "localite": "Renens", "cooperative": "Vaud" },
  "date": "12.10.2026", "heure": "19:00:05", "total": "24.60", "vous_economisez": "4.00",
  "lignes": [
    { "libelle": "Agnesi Linguine N.10", "quantite": "3", "prix": "2.40", "rabais": "2.88", "total": "4.32" },
    { "libelle": "Bio lentilles rouges", "quantite": 2, "prix": 2.8, "rabais": "1,12", "total": "4.48" },
    { "libelle": "MBud gnocchi", "quantite": "1", "prix": "1.95", "rabais": "", "total": "1.95" },
    { "libelle": "Bio Feta", "quantite": "1", "prix": "3.20", "rabais": "", "total": "3.20" },
    { "libelle": "Aubergines", "quantite": "1", "prix": "4.00", "rabais": "", "total": "2.00" },
    { "libelle": "Bio yogourt nature", "quantite": "1", "prix": "1.40", "rabais": "", "total": "1.40" },
    { "libelle": "Bio courgettes", "quantite": "1", "prix": "3.30", "rabais": "", "total": "3.30" },
    { "libelle": "Bio Fairtrade bananes", "quantite": "1", "prix": "2.95", "rabais": "", "total": "2.60" },
    { "libelle": "Pommes rou. douce Gala", "quantite": "1", "prix": "2.80", "rabais": "", "total": "1.35" }
  ]
}
\`\`\``;
  const t = lireReponseClaude(reponse);
  assert.equal(t.methode, 'import_claude');
  assert.equal(t.date, '2026-10-12');
  assert.equal(t.magasin.canton, 'VD');
  assert.equal(t.magasin.format, 'MM');
  assert.equal(ligne(t, 'Bio lentilles').rabaisCentimes, 112);
  assert.equal(ligne(t, 'Aubergines').unite, 'kg');
  assert.equal(etatTicket(t).pret, true);
});

test('import depuis Claude : réponses invalides', () => {
  assert.throws(() => lireReponseClaude('Je ne peux pas lire ce ticket.'), ErreurImport);
  assert.throws(() => lireReponseClaude('{ "lignes": [] }'), ErreurImport);
  assert.throws(() => lireReponseClaude('{ pas du json }'), ErreurImport);
});

// Ticket 2 au format compact des instructions du projet Claude.
const COMPACT = {
  f: '064590',
  m: 'MM Métropole Renens',
  l: 'Renens',
  c: 'Vaud',
  d: '2026-10-12',
  h: '19:00:05',
  t: '24.60',
  e: '4.00',
  a: [
    ['Agnesi Linguine N.10', '3', '2.40', '2.88', '4.32'],
    ['Bio lentilles rouges', '2', '2.80', '1.12', '4.48'],
    ['MBud gnocchi', '1', '1.95', '', '1.95'],
    ['Bio Feta (200g)', '1', '3.20', '', '3.20'],
    ['Aubergines', '1', '4.00', '', '2.00'],
    ['Bio yogourt nature', '1', '1.40', '', '1.40'],
    ['Bio courgettes', '1', '3.30', '', '3.30'],
    ['Bio Fairtrade bananes', '1', '2.95', '', '2.60'],
    ['Pommes rou. douce Gala', '1', '2.80', '', '1.35'],
  ],
};

/** Lien tel que les instructions demandent à Claude de l'écrire. */
function lienCommeClaude(objet: unknown): string {
  const json = JSON.stringify(objet)
    .replaceAll('%', '%25')
    .replaceAll(' ', '%20')
    .replaceAll('(', '%28')
    .replaceAll(')', '%29');
  return `${ADRESSE_IMPORT}${json}`;
}

function verifierTicket2(t: ReturnType<typeof lireReponseClaude>) {
  assert.equal(t.magasin.numeroFiliale, '064590');
  assert.equal(t.magasin.canton, 'VD');
  assert.equal(t.date, '2026-10-12');
  assert.equal(t.heure, '19:00:05');
  assert.equal(t.totalCentimes, 2460);
  assert.equal(t.lignes.length, 9);
  assert.equal(ligne(t, 'Bio Feta').libelle, 'Bio Feta (200g)');
  assert.equal(ligne(t, 'Aubergines').unite, 'kg');
  assert.equal(etatTicket(t).pret, true);
}

test('instructions du projet : lien d’import et format compact', () => {
  assert.ok(INSTRUCTIONS_PROJET.includes(ADRESSE_IMPORT));
  assert.ok(INSTRUCTIONS_PROJET.includes('Cumulus'));
});

test('lien de Claude : fragment reçu par l’app, encodé par le navigateur', () => {
  // Le navigateur encode en plus les guillemets et les accents.
  const lien = lienCommeClaude(COMPACT);
  const fragment = '#' + new URL(lien).hash.slice(1);
  verifierTicket2(lireReponseClaude(fragment));
});

test('lien de Claude : « % » laissé tel quel et parenthèses non encodées', () => {
  const objet = { ...COMPACT, a: [...COMPACT.a, ['Lait 3.5% (UHT)', '1', '1.00', '', '1.00']], t: '25.60' };
  const lien = `${ADRESSE_IMPORT}${JSON.stringify(objet).replaceAll(' ', '%20')}`;
  const t = lireReponseClaude(`[Ouvrir dans Panier Témoin](${lien})`);
  assert.equal(t.lignes.length, 10);
  assert.equal(t.lignes[9].libelle, 'Lait 3.5% (UHT)');
});

test('réponse complète de Claude collée : lien coupé, bloc de code intact', () => {
  const lienCoupe = lienCommeClaude(COMPACT).slice(0, 200);
  const reponse = `9 articles, total 24.60 CHF, le 12.10.2026.

[Ouvrir dans Panier Témoin](${lienCoupe})

\`\`\`json
${JSON.stringify(COMPACT)}
\`\`\``;
  verifierTicket2(lireReponseClaude(reponse));
});

test('bloc de code seul, copié avec le bouton de copie', () => {
  verifierTicket2(lireReponseClaude(JSON.stringify(COMPACT)));
});
