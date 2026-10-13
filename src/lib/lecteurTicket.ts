// Lecteur du texte d'un ticket de supermarché Migros, tel que l'OCR le
// restitue. Il ne retient que l'en-tête (coopérative, magasin), le bloc
// d'articles, les totaux et la ligne de pied « Filiale … Date Heure » :
// numéro Cumulus, données de paiement et identifiants de caisse ne sont
// jamais extraits.
//
// Mise en page d'une ligne d'article (colonnes du ticket) :
//   Désignation article        Quant.  Prix  Rabais  Total  #
//   Agnesi Linguine N.10          3    2.40   2.88   4.32  1
//
// Article pesé : le poids n'est pas imprimé. « Prix » est le prix au kilo,
// « Total » le montant payé, et la quantité vaut 1. Le poids est déduit.

import type { ChampLigne, FormatMagasin, LigneBrouillon, TicketBrouillon } from './types.ts';
import { poidsDeduit, produitCentimes } from './montants.ts';
import { ligneCoherente } from './coherence.ts';

let compteurLignes = 0;

/** Clé locale unique pour une nouvelle ligne. */
export function nouvelleCle(): string {
  compteurLignes += 1;
  return `l${Date.now().toString(36)}${compteurLignes}`;
}

export function ligneVide(): LigneBrouillon {
  return {
    cle: nouvelleCle(),
    libelle: '',
    unite: 'piece',
    quantite: 1,
    prixCentimes: null,
    rabaisCentimes: 0,
    totalCentimes: null,
    douteux: [],
    corriges: [],
    produitId: null,
    produitNom: '',
    prixConfirme: false,
  };
}

// ---------------------------------------------------------------------
// Jetons
// ---------------------------------------------------------------------

interface Montant {
  type: 'montant';
  centimes: number;
  /** false : montant lu sans point décimal (« 260 » pour 2.60). */
  sur: boolean;
}

interface Entier {
  type: 'entier';
  valeur: number;
}

type Jeton = Montant | Entier;

/**
 * Corrige les confusions de l'OCR dans un jeton numérique (« 2,8O » →
 * « 2.80 »). Renvoie null si le jeton n'est pas numérique : il doit
 * contenir au moins un chiffre, et seulement des caractères qui en
 * tiennent lieu, sinon « rouges » deviendrait « 0 ».
 */
function nettoyerNumerique(brut: string): string | null {
  const coeur = brut.replace(/^[^0-9A-Za-z|]+/, '').replace(/[^0-9A-Za-z|]+$/, '');
  if (!/\d/.test(coeur) || !/^[0-9OoIl|.,]+$/.test(coeur)) return null;
  return coeur
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(',', '.');
}

function lireJeton(brut: string): Jeton | null {
  const t = nettoyerNumerique(brut);
  if (t === null) return null;
  if (/^\d{1,4}\.\d{2}$/.test(t)) {
    const [francs, centimes] = t.split('.');
    return { type: 'montant', centimes: Number(francs) * 100 + Number(centimes), sur: true };
  }
  if (/^\d{3,5}$/.test(t)) {
    return { type: 'montant', centimes: Number(t), sur: false };
  }
  if (/^\d{1,2}$/.test(t)) {
    return { type: 'entier', valeur: Number(t) };
  }
  return null;
}

/** Jeton sans lettre ni chiffre : bruit de l'OCR (« | », « — », « °, »). */
function estBruit(brut: string): boolean {
  return !/[0-9A-Za-zÀ-ÿ]/.test(brut);
}

// ---------------------------------------------------------------------
// Lignes d'articles
// ---------------------------------------------------------------------

/**
 * Nettoie un libellé : bruit du bord du ticket en tête (jetons d'une ou
 * deux lettres, symboles), espaces multiples, ponctuation finale.
 */
function nettoyerLibelle(brut: string): string {
  const mots = brut.split(/\s+/).filter((m) => m.length > 0);
  const estBruitDeBord = (mot: string): boolean =>
    mot.length <= 2 ||
    /[^A-Za-zÀ-ÿ.'’-]/.test(mot) ||
    !/[aeiouyàâäéèêëîïôöùûü]/i.test(mot);
  while (mots.length > 1 && estBruitDeBord(mots[0])) {
    mots.shift();
  }
  return mots
    .join(' ')
    .replace(/^[^A-Za-zÀ-ÿ]+/, '')
    .replace(/[\s:;|=«»"'°_~—–-]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Lit une ligne d'article. Renvoie null si la ligne ne contient pas au
 * moins un montant après un libellé.
 */
export function lireLigneArticle(texte: string): LigneBrouillon | null {
  const jetons = texte.trim().split(/\s+/).filter((j) => j.length > 0);
  const queue: Jeton[] = [];
  let i = jetons.length - 1;

  // Remonte depuis la fin tant que les jetons sont numériques ou du bruit.
  for (; i >= 0; i -= 1) {
    const brut = jetons[i];
    if (estBruit(brut)) continue;
    const jeton = lireJeton(brut);
    if (jeton === null) break;
    queue.unshift(jeton);
  }

  const libelle = nettoyerLibelle(jetons.slice(0, i + 1).join(' '));
  if (libelle.length < 2) return null;

  // Colonne « # » en fin de ligne : un entier après le dernier montant.
  while (queue.length > 0 && queue[queue.length - 1].type === 'entier') queue.pop();

  const indexPremierMontant = queue.findIndex((j) => j.type === 'montant');
  if (indexPremierMontant === -1) return null;

  // Quantité : le dernier entier avant le premier montant.
  const avant = queue.slice(0, indexPremierMontant).filter((j): j is Entier => j.type === 'entier');
  const montants = queue.slice(indexPremierMontant).filter((j): j is Montant => j.type === 'montant');

  let quantite = 1;
  let quantiteSure = false;
  if (avant.length > 0) {
    quantite = avant[avant.length - 1].valeur;
    quantiteSure = quantite >= 1 && quantite <= 9;
  }
  if (quantite < 1) quantite = 1;

  let prix: Montant | null = null;
  let rabais: Montant | null = null;
  let total: Montant | null = null;
  if (montants.length >= 3) {
    [prix, rabais, total] = montants.slice(-3);
  } else if (montants.length === 2) {
    [prix, total] = montants;
  } else {
    total = montants[0];
  }

  return construireLigne(
    libelle,
    quantite,
    prix ? prix.centimes : null,
    rabais ? rabais.centimes : 0,
    total ? total.centimes : null,
    {
      quantiteSure,
      prixSur: prix ? prix.sur : false,
      rabaisSur: rabais ? rabais.sur : true,
      totalSur: total ? total.sur : false,
    },
  );
}

/**
 * Construit une ligne à partir de valeurs lues (par l'OCR ou par l'import
 * depuis Claude) : marque les valeurs incertaines, reconnaît les articles
 * pesés et tente de rendre la ligne cohérente.
 */
export function construireLigne(
  libelle: string,
  quantite: number,
  prixCentimes: number | null,
  rabaisCentimes: number,
  totalCentimes: number | null,
  certitudes: Certitudes,
): LigneBrouillon {
  const douteux = new Set<ChampLigne>();
  const ligne: LigneBrouillon = {
    ...ligneVide(),
    libelle,
    quantite,
    prixCentimes,
    rabaisCentimes,
    totalCentimes,
    produitNom: libelle,
  };

  if (prixCentimes === null || !certitudes.prixSur) douteux.add('prix');
  if (!certitudes.rabaisSur) douteux.add('rabais');
  if (totalCentimes === null || !certitudes.totalSur) douteux.add('total');
  if (!certitudes.quantiteSure) douteux.add('quantite');

  if (!ligneCoherente(ligne) && prixCentimes !== null && totalCentimes !== null) {
    reparerLigne(ligne, certitudes, douteux);
  }

  // Une quantité non lue mais confirmée par le calcul n'est plus douteuse.
  if (ligneCoherente(ligne) && ligne.unite === 'piece' && douteux.has('quantite') && certitudes.quantiteSure === false) {
    const lue = quantite;
    if (lue === ligne.quantite && lue === 1) douteux.delete('quantite');
  }

  ligne.douteux = [...douteux];
  return ligne;
}

export interface Certitudes {
  quantiteSure: boolean;
  prixSur: boolean;
  rabaisSur: boolean;
  totalSur: boolean;
}

/**
 * Tente de rendre une ligne cohérente :
 *   1. en recalculant la seule valeur douteuse à partir des trois autres ;
 *   2. sinon, si la ligne ressemble à un article pesé (quantité 1, pas de
 *      rabais), en déduisant le poids : total ÷ prix au kilo.
 * Toute valeur recalculée reste marquée comme douteuse : l'utilisateur
 * la voit surlignée et la confirme d'un coup d'œil.
 */
function reparerLigne(ligne: LigneBrouillon, c: Certitudes, douteux: Set<ChampLigne>): void {
  const prix = ligne.prixCentimes as number;
  const total = ligne.totalCentimes as number;
  const rabais = ligne.rabaisCentimes;
  const q = ligne.quantite;

  const candidats: Array<{ champ: ChampLigne; valeur: number; valide: boolean }> = [];

  const totalCalcule = produitCentimes(q, prix) - rabais;
  candidats.push({ champ: 'total', valeur: totalCalcule, valide: totalCalcule >= 0 });

  const prixCalcule = (total + rabais) / q;
  candidats.push({ champ: 'prix', valeur: prixCalcule, valide: Number.isInteger(prixCalcule) && prixCalcule > 0 });

  const quantiteCalculee = (total + rabais) / prix;
  candidats.push({
    champ: 'quantite',
    valeur: quantiteCalculee,
    valide: Number.isInteger(quantiteCalculee) && quantiteCalculee >= 1 && quantiteCalculee <= 20,
  });

  const rabaisCalcule = produitCentimes(q, prix) - total;
  candidats.push({
    champ: 'rabais',
    valeur: rabaisCalcule,
    // Rabais plausible : entre 0 et 60 % du montant brut.
    valide: rabaisCalcule > 0 && rabaisCalcule <= 0.6 * produitCentimes(q, prix),
  });

  const sur: Record<string, boolean> = {
    total: c.totalSur,
    prix: c.prixSur,
    quantite: c.quantiteSure,
    rabais: c.rabaisSur,
  };

  // Ordre de préférence : d'abord la valeur lue sans certitude, puis une
  // quantité suspecte, puis le prix, le total et le rabais.
  const ordre: ChampLigne[] = [];
  for (const champ of ['rabais', 'total', 'prix', 'quantite'] as ChampLigne[]) {
    if (!sur[champ]) ordre.push(champ);
  }
  for (const champ of ['quantite', 'prix', 'total'] as ChampLigne[]) {
    if (!ordre.includes(champ) && !(champ === 'quantite' && c.quantiteSure)) ordre.push(champ);
  }

  // Un article sans rabais, en quantité 1, dont le total diffère du prix :
  // c'est le plus souvent un article pesé (les chiffres d'un montant lu
  // sans point décimal sont en général justes). On retient alors le poids
  // déduit, marqué à confirmer, plutôt qu'une correction du total.
  const ressemblePese = rabais === 0 && q === 1 && total > 0 && total !== prix;

  if (!ressemblePese) {
    for (const champ of ordre) {
      const candidat = candidats.find((x) => x.champ === champ);
      if (!candidat || !candidat.valide) continue;
      if (champ === 'rabais' && rabais === 0 && sur.total && sur.prix) continue;
      appliquer(ligne, champ, candidat.valeur);
      douteux.add(champ);
      if (ligneCoherente(ligne)) return;
    }
  }

  if (ressemblePese) {
    ligne.quantite = 1;
    ligne.prixCentimes = prix;
    ligne.totalCentimes = total;
    ligne.unite = 'kg';
    ligne.quantite = poidsDeduit(total, 0, prix);
    douteux.add('unite');
    if (ligne.quantite > 3) {
      // Plus de 3 kg pour un seul article : plus probablement une erreur de lecture.
      douteux.add('total');
      douteux.add('prix');
    }
  }
}

function appliquer(ligne: LigneBrouillon, champ: ChampLigne, valeur: number): void {
  if (champ === 'total') ligne.totalCentimes = valeur;
  if (champ === 'prix') ligne.prixCentimes = valeur;
  if (champ === 'quantite') ligne.quantite = valeur;
  if (champ === 'rabais') ligne.rabaisCentimes = valeur;
}

// ---------------------------------------------------------------------
// En-tête, totaux et pied
// ---------------------------------------------------------------------

/**
 * Coopérative régionale → canton, quand il n'y a pas d'ambiguïté. On
 * cherche le nom seul, car l'OCR abîme souvent « Migros » (« Higros »).
 */
const CANTON_PAR_COOPERATIVE: Array<[RegExp, string]> = [
  [/\bVaud\b/i, 'VD'],
  [/\bGeneve\b/i, 'GE'],
  [/\bValais\b/i, 'VS'],
  [/\bZurich\b/i, 'ZH'],
  [/\bLuzern\b/i, 'LU'],
  [/\bTicino\b/i, 'TI'],
  [/\bBasel\b/i, 'BS'],
];

function sansAccents(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const RE_TOTAL = /otal\s*CHF\s*[:=]?\s*(\d{1,4}[.,]\d{2})/i;
const RE_RABAIS = /cono[mn]i[sz]ez\s+au\s+total\s*[:=]?\s*(\d{1,4}[.,]\d{2})/i;
const RE_PIED = /(\d{5,8})\s+\d{3,8}\s+\d{1,4}\s+\d{3,5}\s+(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/;
const RE_DATE_HEURE = /(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/;
const RE_DEBUT_ARTICLES = /signation|Quant\.?\s+Prix/i;
const RE_FIN_ARTICLES = /otal\s*CHF|cono[mn]i[sz]ez/i;
const RE_HORS_ARTICLES = /total|twint|eur\b|cumulus|tva|re[cç]u|carte|visa|mastercard|points|merci|tel\.|t[ée]l[ée]phone/i;
const RE_MAGASIN = /(?:^|[^A-Za-z])(MMM|MM|M)\s+([A-ZÀ-Ý][A-Za-zÀ-ÿ'’.\- ]{2,40})$/;

function montantTexte(texte: string): number {
  const [francs, centimes] = texte.replace(',', '.').split('.');
  return Number(francs) * 100 + Number(centimes);
}

/** Lit tout le texte d'un ticket et en tire un brouillon à valider. */
export function lireTicket(texte: string): TicketBrouillon {
  const lignesTexte = texte.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  const brouillon: TicketBrouillon = {
    magasin: { numeroFiliale: '', nom: '', format: '', localite: '', canton: '' },
    date: '',
    heure: '',
    totalCentimes: null,
    rabaisTotalCentimes: null,
    lignes: [],
    douteux: [],
    methode: 'ocr_local',
  };

  // Coopérative et magasin : dans les premières lignes.
  for (const ligne of lignesTexte.slice(0, 10)) {
    if (brouillon.magasin.canton === '') {
      const trouve = CANTON_PAR_COOPERATIVE.find(([motif]) => motif.test(sansAccents(ligne)));
      if (trouve) brouillon.magasin.canton = trouve[1];
    }
    if (brouillon.magasin.nom === '' && !/coop|soci|tel/i.test(ligne)) {
      const m = ligne.match(RE_MAGASIN);
      if (m) {
        brouillon.magasin.format = m[1] as FormatMagasin;
        brouillon.magasin.nom = `${m[1]} ${m[2].trim()}`;
        const mots = m[2].trim().split(/\s+/);
        brouillon.magasin.localite = mots.length > 1 ? mots[mots.length - 1] : '';
      }
    }
  }
  if (brouillon.magasin.nom === '') brouillon.douteux.push('magasin');

  // Totaux
  const total = texte.match(RE_TOTAL);
  if (total) brouillon.totalCentimes = montantTexte(total[1]);
  else brouillon.douteux.push('total');

  const rabais = texte.match(RE_RABAIS);
  brouillon.rabaisTotalCentimes = rabais ? montantTexte(rabais[1]) : 0;

  // Pied : filiale, date et heure du ticket
  const pied = texte.match(RE_PIED);
  if (pied) {
    brouillon.magasin.numeroFiliale = pied[1];
    brouillon.date = `${pied[4]}-${pied[3]}-${pied[2]}`;
    brouillon.heure = `${pied[5]}:${pied[6]}:${pied[7]}`;
  } else {
    brouillon.douteux.push('filiale');
    // À défaut, la date et l'heure du paiement (quelques secondes ou
    // minutes après celles du ticket) : à vérifier.
    const dh = texte.match(RE_DATE_HEURE);
    if (dh) {
      brouillon.date = `${dh[3]}-${dh[2]}-${dh[1]}`;
      brouillon.heure = `${dh[4]}:${dh[5]}:${dh[6]}`;
    }
    brouillon.douteux.push('date', 'heure');
  }

  // Bloc d'articles
  const debut = lignesTexte.findIndex((l) => RE_DEBUT_ARTICLES.test(l));
  let fin = lignesTexte.findIndex((l, i) => i > debut && RE_FIN_ARTICLES.test(l));
  if (fin === -1) fin = lignesTexte.length;
  const blocArticles = lignesTexte.slice(debut + 1, fin);

  for (const ligne of blocArticles) {
    if (RE_HORS_ARTICLES.test(ligne)) continue;
    const article = lireLigneArticle(ligne);
    if (article) brouillon.lignes.push(article);
  }

  reparerParLeTotal(brouillon);
  return brouillon;
}

/**
 * Si une seule ligne a un total incertain et que la somme ne tombe pas
 * juste, le total du ticket permet de retrouver celui de cette ligne.
 */
function reparerParLeTotal(brouillon: TicketBrouillon): void {
  if (brouillon.totalCentimes === null) return;
  const somme = brouillon.lignes.reduce((s, l) => s + (l.totalCentimes ?? 0), 0);
  const ecart = brouillon.totalCentimes - somme;
  if (ecart === 0) return;
  const incertaines = brouillon.lignes.filter((l) => l.totalCentimes === null || l.douteux.includes('total'));
  if (incertaines.length !== 1) return;
  const ligne = incertaines[0];
  if (ligne.prixCentimes === null) return;
  const nouveauTotal = (ligne.totalCentimes ?? 0) + ecart;
  if (nouveauTotal <= 0) return;

  // La correction n'est retenue que si elle donne une ligne plausible :
  // cohérente à la pièce, ou d'un poids inférieur à 3 kg.
  const essai: LigneBrouillon = { ...ligne, totalCentimes: nouveauTotal };
  if (essai.unite === 'kg') {
    essai.quantite = poidsDeduit(nouveauTotal, essai.rabaisCentimes, essai.prixCentimes as number);
    if (essai.quantite > 3) return;
  } else if (!ligneCoherente(essai)) {
    return;
  }
  ligne.totalCentimes = essai.totalCentimes;
  ligne.quantite = essai.quantite;
}
